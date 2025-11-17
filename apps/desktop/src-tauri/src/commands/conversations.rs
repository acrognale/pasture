use std::collections::HashMap;
use std::path::Path;
use std::path::PathBuf;

use codex_core::Cursor;
use codex_core::INTERACTIVE_SESSION_SOURCES;
use codex_core::RolloutRecorder;
use codex_core::SessionMeta;
use codex_core::config::Config;
use codex_core::config::ConfigOverrides;
use codex_core::parse_turn_item;
use codex_protocol::ConversationId;
use codex_protocol::config_types::ReasoningEffort;
use codex_protocol::config_types::ReasoningSummary;
use codex_protocol::config_types::SandboxMode;
use codex_protocol::items::TurnItem;
use codex_protocol::models::ResponseItem;
use codex_protocol::protocol::AskForApproval;
use codex_protocol::protocol::Op;
use codex_protocol::protocol::SandboxPolicy;
use codex_protocol::protocol::SessionConfiguredEvent;
use codex_protocol::protocol::TurnAbortReason;
use codex_protocol::user_input::UserInput as CoreUserInput;
use serde::Deserialize;
use serde::Serialize;
use serde_json::Value;
use tauri::AppHandle;
use tauri::State;
use ts_rs::TS;
use uuid::Uuid;

use crate::codex_runtime::CodexRuntime;
use crate::env;
use crate::workspace_manager::WorkspaceComposerDefaults;
use crate::workspace_manager::WorkspaceManager;

use super::util::CommandResult;

const DEFAULT_CONVERSATION_LIMIT: usize = 25;
const MAX_CONVERSATION_LIMIT: usize = 100;

/// Row displayed in the conversation list.
#[derive(Serialize, Deserialize, Debug, Clone, PartialEq, TS)]
#[serde(rename_all = "camelCase")]
pub struct ConversationSummary {
    pub conversation_id: ConversationId,
    #[ts(type = "string")]
    pub path: PathBuf,
    #[ts(type = "string")]
    pub cwd: PathBuf,
    pub preview: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub timestamp: Option<String>,
}

#[derive(Serialize, Deserialize, Debug, Clone, PartialEq, Default, TS)]
#[serde(rename_all = "camelCase")]
pub struct ListConversationsParams {
    pub workspace_path: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub cursor: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub limit: Option<usize>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub model_providers: Option<Vec<String>>,
}

#[derive(Serialize, Deserialize, Debug, Clone, PartialEq, TS)]
#[serde(rename_all = "camelCase")]
pub struct ListConversationsResponse {
    pub items: Vec<ConversationSummary>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub next_cursor: Option<String>,
}

fn parse_cursor_token(token: &str) -> CommandResult<Cursor> {
    serde_json::from_value::<Cursor>(Value::String(token.to_string()))
        .map_err(|err| format!("Invalid cursor token: {}", err))
}

fn serialize_cursor_token(cursor: &Cursor) -> CommandResult<String> {
    serde_json::to_value(cursor)
        .map_err(|err| format!("Failed to serialize cursor: {}", err))?
        .as_str()
        .map(|s| s.to_string())
        .ok_or_else(|| "Cursor serialization produced invalid value".to_string())
}

/// List all conversations scoped to the current workspace.
#[tauri::command]
pub async fn list_conversations(
    workspace_manager: State<'_, WorkspaceManager>,
    runtime: State<'_, CodexRuntime>,
    params: ListConversationsParams,
) -> CommandResult<ListConversationsResponse> {
    let ListConversationsParams {
        workspace_path,
        cursor: cursor_token,
        limit,
        model_providers,
    } = params;

    let workspace_path = workspace_manager
        .normalize_workspace_path(&workspace_path)
        .map_err(|e| e.to_string())?;
    if !runtime.is_initialized().await {
        return Err("Runtime not initialized".to_string());
    }

    let mut limit = limit.unwrap_or(DEFAULT_CONVERSATION_LIMIT);
    limit = limit.clamp(1, MAX_CONVERSATION_LIMIT);

    let mut cursor: Option<Cursor> = match cursor_token.as_deref() {
        Some(token) => Some(parse_cursor_token(token)?),
        None => None,
    };
    let config = runtime.config();
    let workspace_cwd = Path::new(&workspace_path);
    let provider_filter = match model_providers {
        Some(providers) => {
            if providers.is_empty() {
                None
            } else {
                Some(providers)
            }
        }
        None => Some(vec![config.model_provider_id.clone()]),
    };
    let fallback_provider = config.model_provider_id.clone();

    let mut items: Vec<ConversationSummary> = Vec::new();
    let mut next_cursor_token: Option<String> = None;

    // Continue fetching pages until we have enough workspace-matching conversations
    // or we've exhausted all available pages
    loop {
        let mut page = RolloutRecorder::list_conversations(
            &config.codex_home,
            limit,
            cursor.as_ref(),
            INTERACTIVE_SESSION_SOURCES,
            provider_filter.as_deref(),
            fallback_provider.as_str(),
        )
        .await
        .map_err(|e| format!("Failed to list conversations: {}", e))?;

        log::info!("Found {} conversations in page", page.items.len());

        let mut next_cursor = page.next_cursor.take();
        let serialized_cursor = match next_cursor.as_ref() {
            Some(cursor_ref) => Some(serialize_cursor_token(cursor_ref)?),
            None => None,
        };
        // Only update next_cursor_token if we have a cursor (avoids unused assignment warning)
        if serialized_cursor.is_some() {
            next_cursor_token = serialized_cursor.clone();
        }

        // Filter and collect conversations that match the current workspace
        for summary in page
            .items
            .into_iter()
            .filter_map(|it| extract_conversation_summary(it.path, &it.head, workspace_cwd))
        {
            let conversation_id = summary.conversation_id.to_string();
            workspace_manager
                .store_active_conversation(
                    conversation_id,
                    summary.path.clone(),
                    summary.cwd.clone(),
                )
                .await;
            items.push(summary);

            // Stop processing current page if we have enough matches
            if items.len() >= limit {
                break;
            }
        }

        // Check if we have enough matches or if there are no more pages
        if items.len() >= limit || next_cursor.is_none() {
            break;
        }

        // Continue to next page
        cursor = next_cursor.take();
    }

    let next_cursor = if items.len() >= limit {
        next_cursor_token
    } else {
        None
    };

    Ok(ListConversationsResponse { items, next_cursor })
}

/// Parameters for initializing conversation history.
#[derive(Serialize, Deserialize, Debug, Clone, PartialEq, TS)]
#[serde(rename_all = "camelCase")]
pub struct InitializeConversationParams {
    pub conversation_id: String,
}

/// Response returned after initializing a conversation stream.
#[derive(Serialize, Deserialize, Debug, Clone, TS)]
#[serde(rename_all = "camelCase")]
pub struct InitializeConversationResponse {
    pub session_configured: SessionConfiguredEvent,
    pub reasoning_summary: ReasoningSummary,
}

/// Initialize a conversation by loading its history and subscribing to events.
/// Initial events are returned directly in the response.
/// The streamed feed starts *after* the session is configured, so callers must replay
/// `session_configured.initial_messages` from this response to hydrate history.
#[tauri::command]
pub async fn initialize_conversation(
    params: InitializeConversationParams,
    workspace_manager: State<'_, WorkspaceManager>,
    runtime: State<'_, CodexRuntime>,
    app_handle: AppHandle,
) -> CommandResult<InitializeConversationResponse> {
    if !runtime.is_initialized().await {
        return Err("Runtime not initialized".to_string());
    }

    let conversation_id = params.conversation_id;
    let session = workspace_manager
        .get_active_conversation(&conversation_id)
        .await
        .ok_or_else(|| format!("Unknown conversation: {}", conversation_id))?;

    let mut config = runtime.config().as_ref().clone();
    let fallback_env = config.shell_environment_policy.r#set.clone();
    config.cwd = session.cwd.clone();
    let env_vars = session.workspace_environment(&fallback_env).await;
    config.shell_environment_policy.r#set = env_vars.clone();
    let reasoning_summary = config.model_reasoning_summary;
    let auth_manager = runtime.auth_manager().clone();

    let new_conversation = runtime
        .conversation_manager()
        .resume_conversation_from_rollout(config, session.rollout_path.clone(), auth_manager)
        .await
        .map_err(|e| format!("Failed to resume conversation: {}", e))?;

    let session_configured = new_conversation.session_configured.clone();
    let conv_id = ConversationId::from_string(&conversation_id)
        .map_err(|e| format!("Invalid conversation ID: {}", e))?;

    // Subscribe to live event stream
    if let Ok(conversation) = runtime
        .conversation_manager()
        .get_conversation(conv_id)
        .await
    {
        let _ = runtime
            .event_manager()
            .subscribe(
                conv_id,
                conversation,
                app_handle.clone(),
                conversation_id.clone(),
            )
            .await;
    }

    if let Err(err) = session.review_snapshots().ensure_base().await {
        log::debug!(
            "Failed to ensure baseline snapshot for conversation {}: {}",
            conversation_id,
            err
        );
    }

    let restored_event_count = session_configured
        .initial_messages
        .as_ref()
        .map(|events| events.len())
        .unwrap_or(0);

    log::info!(
        "Initialized conversation {} with {} cached events",
        conversation_id,
        restored_event_count
    );

    Ok(InitializeConversationResponse {
        session_configured,
        reasoning_summary,
    })
}

/// Options accepted when creating a new conversation.
#[derive(Serialize, Deserialize, Debug, Clone, PartialEq, Default, TS)]
#[serde(rename_all = "camelCase")]
pub struct NewConversationParams {
    #[serde(skip_serializing_if = "Option::is_none")]
    pub model: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub profile: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub cwd: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub approval_policy: Option<AskForApproval>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub sandbox: Option<SandboxMode>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub config: Option<HashMap<String, Value>>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub base_instructions: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub include_apply_patch_tool: Option<bool>,
}

/// Wrapper parameters accepted when creating a new conversation.
#[derive(Serialize, Deserialize, Debug, Clone, PartialEq, Default, TS)]
#[serde(rename_all = "camelCase")]
pub struct NewConversationCommandParams {
    pub workspace_path: String,
    pub options: Option<NewConversationParams>,
}

/// Response returned after creating a new conversation.
#[derive(Serialize, Deserialize, Debug, Clone, PartialEq, TS)]
#[serde(rename_all = "camelCase")]
pub struct NewConversationResponse {
    pub conversation_id: ConversationId,
    pub model: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub reasoning_effort: Option<ReasoningEffort>,
    #[ts(type = "string")]
    pub rollout_path: PathBuf,
}

/// Create a new conversation.
#[tauri::command]
pub async fn new_conversation(
    params: NewConversationCommandParams,
    workspace_manager: State<'_, WorkspaceManager>,
    runtime: State<'_, CodexRuntime>,
    app_handle: AppHandle,
) -> CommandResult<NewConversationResponse> {
    let workspace_path = workspace_manager
        .normalize_workspace_path(&params.workspace_path)
        .map_err(|e| e.to_string())?;
    let workspace_root_path = PathBuf::from(&workspace_path);

    if !runtime.is_initialized().await {
        return Err("Runtime not initialized".to_string());
    }

    let mut options = params.options.unwrap_or_default();
    let workspace_defaults = workspace_manager
        .get_workspace_defaults_for_normalized(&workspace_path)
        .await;
    apply_workspace_defaults(&mut options, &workspace_defaults);
    let mut base_config = runtime.config().as_ref().clone();
    base_config.cwd = workspace_root_path.clone();

    let mut config = derive_config_from_params(options, &base_config)
        .await
        .map_err(|e| format!("Failed to derive config: {}", e))?;
    let cwd = config.cwd.clone();
    let fallback_env = runtime.config().shell_environment_policy.r#set.clone();
    let env_vars = env::capture_login_shell_environment(Some(config.cwd.as_path()))
        .await
        .unwrap_or(fallback_env);
    config.shell_environment_policy.r#set = env_vars.clone();

    let new_conv = runtime
        .conversation_manager()
        .new_conversation(config)
        .await
        .map_err(|e| format!("Failed to create conversation: {}", e))?;

    let conversation_id = new_conv.conversation_id;

    let conversation_id_str = conversation_id.to_string();
    let session = workspace_manager
        .store_active_conversation(
            conversation_id_str.clone(),
            new_conv.session_configured.rollout_path.clone(),
            cwd.clone(),
        )
        .await;

    session.set_environment_cache(env_vars).await;

    if let Err(err) = session.review_snapshots().ensure_base().await {
        log::debug!(
            "Failed to capture baseline snapshot for conversation {}: {}",
            conversation_id_str,
            err
        );
    }

    if let Ok(conversation) = runtime
        .conversation_manager()
        .get_conversation(conversation_id)
        .await
    {
        let _ = runtime
            .event_manager()
            .subscribe(
                conversation_id,
                conversation,
                app_handle,
                conversation_id.to_string(),
            )
            .await;
    }

    Ok(NewConversationResponse {
        conversation_id,
        model: new_conv.session_configured.model,
        reasoning_effort: new_conv.session_configured.reasoning_effort,
        rollout_path: new_conv.session_configured.rollout_path,
    })
}

/// Wire representation of user-provided inputs.
#[derive(Serialize, Deserialize, Debug, Clone, PartialEq, TS)]
#[serde(rename_all = "camelCase")]
#[serde(tag = "type", content = "data")]
pub enum InputItem {
    Text {
        text: String,
    },
    Image {
        image_url: String,
    },
    LocalImage {
        #[ts(type = "string")]
        path: PathBuf,
    },
}

/// Parameters accepted when sending a user message.
#[derive(Serialize, Deserialize, Debug, Clone, PartialEq, TS)]
#[serde(rename_all = "camelCase")]
pub struct SendUserMessageParams {
    pub conversation_id: String,
    pub items: Vec<InputItem>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub model: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub reasoning_effort: Option<ReasoningEffort>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub summary: Option<ReasoningSummary>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub sandbox: Option<SandboxMode>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub approval_policy: Option<AskForApproval>,
}

/// Send a user message to a conversation.
#[tauri::command]
pub async fn send_user_message(
    params: SendUserMessageParams,
    runtime: State<'_, CodexRuntime>,
    app_handle: AppHandle,
) -> CommandResult<()> {
    if !runtime.is_initialized().await {
        return Err("Runtime not initialized".to_string());
    }

    let SendUserMessageParams {
        conversation_id,
        items,
        model,
        reasoning_effort,
        summary,
        sandbox,
        approval_policy,
    } = params;

    let conv_id = ConversationId::from_string(&conversation_id)
        .map_err(|e| format!("Invalid conversation ID: {}", e))?;

    let conversation = runtime
        .conversation_manager()
        .get_conversation(conv_id)
        .await
        .map_err(|_| format!("Conversation not found: {}", conversation_id))?;

    let _ = runtime
        .event_manager()
        .subscribe(
            conv_id,
            conversation.clone(),
            app_handle,
            conversation_id.clone(),
        )
        .await;

    let mapped_items: Vec<CoreUserInput> = items
        .into_iter()
        .map(|item| match item {
            InputItem::Text { text } => CoreUserInput::Text { text },
            InputItem::Image { image_url } => CoreUserInput::Image { image_url },
            InputItem::LocalImage { path } => CoreUserInput::LocalImage { path },
        })
        .collect();

    let sandbox_policy = sandbox.map(sandbox_mode_to_policy);
    let effort_override = reasoning_effort.map(Some);

    if model.is_some()
        || effort_override.is_some()
        || summary.is_some()
        || sandbox_policy.is_some()
        || approval_policy.is_some()
    {
        conversation
            .submit(Op::OverrideTurnContext {
                cwd: None,
                approval_policy,
                sandbox_policy,
                model: model.clone(),
                effort: effort_override,
                summary,
            })
            .await
            .map_err(|e| format!("Failed to apply turn overrides: {}", e))?;
    }

    conversation
        .submit(Op::UserInput {
            items: mapped_items,
        })
        .await
        .map_err(|e| format!("Failed to submit user message: {}", e))?;

    Ok(())
}

/// Parameters accepted when compacting a conversation.
#[derive(Serialize, Deserialize, Debug, Clone, PartialEq, TS)]
#[serde(rename_all = "camelCase")]
pub struct CompactConversationParams {
    pub conversation_id: String,
}

/// Trigger the compact operation for a conversation.
#[tauri::command]
pub async fn compact_conversation(
    params: CompactConversationParams,
    runtime: State<'_, CodexRuntime>,
    app_handle: AppHandle,
) -> CommandResult<()> {
    if !runtime.is_initialized().await {
        return Err("Runtime not initialized".to_string());
    }

    let conversation_id = params.conversation_id;
    let conv_id = ConversationId::from_string(&conversation_id)
        .map_err(|e| format!("Invalid conversation ID: {}", e))?;

    let conversation = runtime
        .conversation_manager()
        .get_conversation(conv_id)
        .await
        .map_err(|_| format!("Conversation not found: {}", conversation_id.clone()))?;

    let _ = runtime
        .event_manager()
        .subscribe(
            conv_id,
            conversation.clone(),
            app_handle,
            conversation_id.clone(),
        )
        .await;

    conversation
        .submit(Op::Compact)
        .await
        .map_err(|e| format!("Failed to compact conversation: {}", e))?;

    Ok(())
}

/// Parameters accepted when interrupting a conversation.
#[derive(Serialize, Deserialize, Debug, Clone, PartialEq, TS)]
#[serde(rename_all = "camelCase")]
pub struct InterruptConversationParams {
    pub conversation_id: String,
}

/// Response returned when interrupting a conversation.
#[derive(Serialize, Deserialize, Debug, Clone, PartialEq, TS)]
#[serde(rename_all = "camelCase")]
pub struct InterruptConversationResponse {
    pub abort_reason: TurnAbortReason,
}

/// Interrupt an active conversation.
#[tauri::command]
pub async fn interrupt_conversation(
    params: InterruptConversationParams,
    runtime: State<'_, CodexRuntime>,
) -> CommandResult<InterruptConversationResponse> {
    if !runtime.is_initialized().await {
        return Err("Runtime not initialized".to_string());
    }

    let conv_id = ConversationId::from_string(&params.conversation_id)
        .map_err(|e| format!("Invalid conversation ID: {}", e))?;

    let conversation = runtime
        .conversation_manager()
        .get_conversation(conv_id)
        .await
        .map_err(|_| format!("Conversation not found: {}", params.conversation_id))?;

    conversation
        .submit(Op::Interrupt)
        .await
        .map_err(|e| format!("Failed to interrupt conversation: {}", e))?;

    Ok(InterruptConversationResponse {
        abort_reason: TurnAbortReason::Interrupted,
    })
}

/// Parameters accepted when adding a conversation listener.
#[derive(Serialize, Deserialize, Debug, Clone, PartialEq, TS)]
#[serde(rename_all = "camelCase")]
pub struct AddConversationListenerParams {
    pub conversation_id: String,
}

/// Response returned when subscribing to a conversation.
#[derive(Serialize, Deserialize, Debug, Clone, PartialEq, TS)]
#[serde(rename_all = "camelCase")]
pub struct AddConversationSubscriptionResponse {
    pub subscription_id: Uuid,
}

/// Subscribe to conversation events.
#[tauri::command]
pub async fn add_conversation_listener(
    params: AddConversationListenerParams,
    runtime: State<'_, CodexRuntime>,
    app_handle: AppHandle,
) -> CommandResult<AddConversationSubscriptionResponse> {
    if !runtime.is_initialized().await {
        return Err("Runtime not initialized".to_string());
    }

    let conv_id = ConversationId::from_string(&params.conversation_id)
        .map_err(|e| format!("Invalid conversation ID: {}", e))?;

    let conversation = runtime
        .conversation_manager()
        .get_conversation(conv_id)
        .await
        .map_err(|_| format!("Conversation not found: {}", params.conversation_id))?;

    let subscription_id = runtime
        .event_manager()
        .subscribe(
            conv_id,
            conversation,
            app_handle,
            params.conversation_id.clone(),
        )
        .await;

    Ok(AddConversationSubscriptionResponse { subscription_id })
}

/// Parameters accepted when removing a conversation listener.
#[derive(Serialize, Deserialize, Debug, Clone, PartialEq, TS)]
#[serde(rename_all = "camelCase")]
pub struct RemoveConversationListenerParams {
    pub subscription_id: String,
}

/// Unsubscribe from conversation events.
#[tauri::command]
pub async fn remove_conversation_listener(
    params: RemoveConversationListenerParams,
    runtime: State<'_, CodexRuntime>,
) -> CommandResult<()> {
    let uuid = Uuid::parse_str(&params.subscription_id)
        .map_err(|e| format!("Invalid subscription ID: {}", e))?;

    runtime
        .event_manager()
        .unsubscribe(uuid)
        .await
        .map_err(|e| e.to_string())?;

    Ok(())
}

async fn derive_config_from_params(
    params: NewConversationParams,
    base_config: &Config,
) -> anyhow::Result<Config> {
    let NewConversationParams {
        model,
        profile,
        cwd,
        approval_policy,
        sandbox: sandbox_mode,
        config: cli_overrides,
        base_instructions,
        include_apply_patch_tool,
    } = params;

    let resolved_cwd = cwd
        .map(PathBuf::from)
        .map(|path| {
            if path.is_absolute() {
                path
            } else {
                base_config.cwd.join(path)
            }
        })
        .unwrap_or_else(|| base_config.cwd.clone());

    let overrides = ConfigOverrides {
        model,
        review_model: None,
        config_profile: profile,
        cwd: Some(resolved_cwd),
        approval_policy,
        sandbox_mode,
        model_provider: None,
        codex_linux_sandbox_exe: None,
        base_instructions,
        include_apply_patch_tool,
        show_raw_agent_reasoning: None,
        tools_web_search_request: None,
        ..Default::default()
    };

    let cli_overrides: Vec<(String, toml::Value)> = cli_overrides
        .unwrap_or_default()
        .into_iter()
        .map(|(k, v)| (k, json_to_toml(v)))
        .collect();

    let mut config = Config::load_with_cli_overrides(cli_overrides, overrides)
        .await
        .map_err(|e| anyhow::anyhow!("Failed to load config: {}", e))?;
    // Preserve captured login-shell environment (PATH, etc.) from the base config.
    config.shell_environment_policy = base_config.shell_environment_policy.clone();
    Ok(config)
}

fn json_to_toml(value: serde_json::Value) -> toml::Value {
    match value {
        serde_json::Value::Null => toml::Value::String(String::new()),
        serde_json::Value::Bool(b) => toml::Value::Boolean(b),
        serde_json::Value::Number(n) => {
            if let Some(i) = n.as_i64() {
                toml::Value::Integer(i)
            } else if let Some(f) = n.as_f64() {
                toml::Value::Float(f)
            } else {
                toml::Value::String(n.to_string())
            }
        }
        serde_json::Value::String(s) => toml::Value::String(s),
        serde_json::Value::Array(arr) => {
            toml::Value::Array(arr.into_iter().map(json_to_toml).collect())
        }
        serde_json::Value::Object(obj) => {
            let mut map = toml::map::Map::new();
            for (k, v) in obj {
                map.insert(k, json_to_toml(v));
            }
            toml::Value::Table(map)
        }
    }
}

fn apply_workspace_defaults(
    options: &mut NewConversationParams,
    defaults: &WorkspaceComposerDefaults,
) {
    if options.model.is_none() {
        options.model = defaults.model.clone();
    }
    if options.sandbox.is_none() {
        options.sandbox = defaults.sandbox.clone();
    }
    if options.approval_policy.is_none() {
        options.approval_policy = defaults.approval.clone();
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn apply_workspace_defaults_prefers_workspace_values_when_missing() {
        let mut options = NewConversationParams::default();
        let defaults = WorkspaceComposerDefaults {
            model: Some("gpt-5-codex".to_string()),
            sandbox: Some(SandboxMode::DangerFullAccess),
            approval: Some(AskForApproval::Never),
            ..Default::default()
        };

        apply_workspace_defaults(&mut options, &defaults);

        assert_eq!(options.model.as_deref(), Some("gpt-5-codex"));
        assert_eq!(options.sandbox, Some(SandboxMode::DangerFullAccess));
        assert_eq!(options.approval_policy, Some(AskForApproval::Never));
    }

    #[test]
    fn apply_workspace_defaults_does_not_override_explicit_options() {
        let mut options = NewConversationParams {
            model: Some("custom-model".to_string()),
            sandbox: Some(SandboxMode::WorkspaceWrite),
            approval_policy: Some(AskForApproval::OnFailure),
            ..Default::default()
        };

        let defaults = WorkspaceComposerDefaults {
            model: Some("gpt-5".to_string()),
            sandbox: Some(SandboxMode::DangerFullAccess),
            approval: Some(AskForApproval::Never),
            ..Default::default()
        };

        apply_workspace_defaults(&mut options, &defaults);

        assert_eq!(options.model.as_deref(), Some("custom-model"));
        assert_eq!(options.sandbox, Some(SandboxMode::WorkspaceWrite));
        assert_eq!(options.approval_policy, Some(AskForApproval::OnFailure));
    }
}

fn sandbox_mode_to_policy(mode: SandboxMode) -> SandboxPolicy {
    match mode {
        SandboxMode::ReadOnly => SandboxPolicy::new_read_only_policy(),
        SandboxMode::WorkspaceWrite => SandboxPolicy::new_workspace_write_policy(),
        SandboxMode::DangerFullAccess => SandboxPolicy::DangerFullAccess,
    }
}

fn normalized_path_string(path: &Path) -> String {
    let canonical = path.canonicalize().unwrap_or_else(|_| path.to_path_buf());
    path_to_normalized_string(&canonical)
}

#[cfg(not(windows))]
fn path_to_normalized_string(path: &Path) -> String {
    path.to_string_lossy().into_owned()
}

#[cfg(windows)]
fn path_to_normalized_string(path: &Path) -> String {
    let mut s = path.to_string_lossy().into_owned();
    if s.starts_with(r"\\?\") {
        s = s[4..].to_string();
    }
    s = s.replace('/', "\\");
    s.make_ascii_lowercase();
    s
}

fn normalized_path_match(a: &Path, b: &Path) -> bool {
    normalized_path_string(a) == normalized_path_string(b)
}

fn extract_conversation_summary(
    path: PathBuf,
    head: &[serde_json::Value],
    workspace_cwd: &Path,
) -> Option<ConversationSummary> {
    let session_meta = match head.first() {
        Some(first_line) => serde_json::from_value::<SessionMeta>(first_line.clone()).ok()?,
        None => return None,
    };

    if !normalized_path_match(&session_meta.cwd, workspace_cwd) {
        return None;
    }

    let preview: String = head
        .iter()
        .filter_map(|value| serde_json::from_value::<ResponseItem>(value.clone()).ok())
        .find_map(|item| match parse_turn_item(&item) {
            Some(TurnItem::UserMessage(user)) => Some(user.message()),
            _ => None,
        })?;

    const PREVIEW_MAX_LEN: usize = 80;
    let preview = if preview.chars().count() > PREVIEW_MAX_LEN {
        // Truncate at character boundary, not byte boundary
        let truncate_at = preview
            .char_indices()
            .nth(PREVIEW_MAX_LEN)
            .map(|(idx, _)| idx)
            .unwrap_or(preview.len());
        format!("{}…", &preview[..truncate_at])
    } else {
        preview
    };

    let conversation_id = session_meta.id;
    let timestamp = session_meta.timestamp;
    let cwd = session_meta.cwd;

    Some(ConversationSummary {
        conversation_id,
        path,
        cwd,
        preview,
        timestamp: Some(timestamp),
    })
}
