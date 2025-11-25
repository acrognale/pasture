use std::collections::HashMap;
use std::path::Path;
use std::path::PathBuf;

use chrono::Utc;
use codex_core::config::Config;
use codex_core::config::ConfigOverrides;
use codex_protocol::ConversationId;
use codex_protocol::config_types::ReasoningEffort;
use codex_protocol::config_types::ReasoningSummary;
use codex_protocol::config_types::SandboxMode;
use codex_protocol::protocol::AskForApproval;
use codex_protocol::protocol::Op;
use codex_protocol::protocol::SandboxPolicy;
use codex_protocol::protocol::SessionConfiguredEvent;
use codex_protocol::protocol::TurnAbortReason;
use codex_protocol::user_input::UserInput as CoreUserInput;
use sea_orm::DatabaseConnection;
use serde::Deserialize;
use serde::Serialize;
use serde_json::Value;
use tauri::AppHandle;
use tauri::State;
use tokio::fs::File;
use tokio::io::AsyncBufReadExt;
use tokio::io::BufReader;
use ts_rs::TS;
use uuid::Uuid;

use crate::codex_runtime::CodexRuntime;
use crate::env;
use crate::errors::{AppError, AppResult};
use crate::title_generation;
use crate::workspace_manager::ThreadRecord;
use crate::workspace_manager::ThreadRollout;
use crate::workspace_manager::WorkspaceComposerDefaults;
use crate::workspace_manager::WorkspaceManager;

#[derive(Serialize, Deserialize, Debug, Clone, PartialEq, TS)]
#[serde(rename_all = "camelCase")]
pub struct ThreadSummary {
    pub thread_id: String,
    pub workspace_path: String,
    pub current_conversation_id: String,
    pub preview: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub title: Option<String>,
    pub timestamp: String,
    pub rollout_count: usize,
}

#[derive(Serialize, Deserialize, Debug, Clone, PartialEq, TS)]
#[serde(rename_all = "camelCase")]
pub struct ListThreadRolloutsParams {
    pub workspace_path: String,
    pub thread_id: String,
}

#[derive(Serialize, Deserialize, Debug, Clone, PartialEq, TS)]
#[serde(rename_all = "camelCase")]
pub struct ListThreadRolloutsResponse {
    pub thread_id: String,
    pub current_conversation_id: String,
    pub rollouts: Vec<ThreadRollout>,
}

#[derive(Serialize, Deserialize, Debug, Clone, PartialEq, TS)]
#[serde(rename_all = "camelCase")]
pub struct SwitchThreadRolloutParams {
    pub workspace_path: String,
    pub thread_id: String,
    pub conversation_id: String,
}

#[derive(Serialize, Deserialize, Debug, Clone, TS)]
#[serde(rename_all = "camelCase")]
pub struct SwitchThreadRolloutResponse {
    pub conversation_id: ConversationId,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub session_configured: Option<SessionConfiguredEvent>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub reasoning_summary: Option<ReasoningSummary>,
}

#[derive(Serialize, Deserialize, Debug, Clone, PartialEq, Default, TS)]
#[serde(rename_all = "camelCase")]
pub struct ForkThreadParams {
    pub workspace_path: String,
    pub thread_id: String,
    pub base_conversation_id: String,
    pub nth_user_message: u32,
    pub options: Option<NewConversationParams>,
}

#[derive(Serialize, Deserialize, Debug, Clone, TS)]
#[serde(rename_all = "camelCase")]
pub struct ForkThreadResponse {
    pub thread_id: String,
    pub base_conversation_id: ConversationId,
    pub conversation_id: ConversationId,
    #[ts(type = "string")]
    pub rollout_path: PathBuf,
    pub session_configured: SessionConfiguredEvent,
    pub reasoning_summary: ReasoningSummary,
    pub nth_user_message: u32,
    pub created_at: String,
}

#[derive(Serialize, Deserialize, Debug, Clone, PartialEq, Default, TS)]
#[serde(rename_all = "camelCase")]
pub struct ListThreadsParams {
    pub workspace_path: String,
}

#[derive(Serialize, Deserialize, Debug, Clone, PartialEq, TS)]
#[serde(rename_all = "camelCase")]
pub struct ListThreadsResponse {
    pub items: Vec<ThreadSummary>,
}

#[derive(Serialize, Deserialize, Debug, Clone, PartialEq, Default, TS)]
#[serde(rename_all = "camelCase")]
pub struct NewThreadCommandParams {
    pub workspace_path: String,
    pub options: Option<NewConversationParams>,
}

#[derive(Serialize, Deserialize, Debug, Clone, PartialEq, TS)]
#[serde(rename_all = "camelCase")]
pub struct NewThreadResponse {
    pub thread_id: String,
    pub conversation_id: ConversationId,
    pub model: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub reasoning_effort: Option<ReasoningEffort>,
    #[ts(type = "string")]
    pub rollout_path: PathBuf,
}

#[derive(Serialize, Deserialize, Debug, Clone, PartialEq, TS)]
#[serde(rename_all = "camelCase")]
pub struct InitializeThreadParams {
    pub thread_id: String,
    pub workspace_path: String,
}

#[derive(Serialize, Deserialize, Debug, Clone, TS)]
#[serde(rename_all = "camelCase")]
pub struct InitializeThreadResponse {
    pub session_configured: SessionConfiguredEvent,
    pub reasoning_summary: ReasoningSummary,
}

/// List all threads for a workspace from Pasture persistence.
#[tauri::command]
pub async fn list_threads(
    workspace_manager: State<'_, WorkspaceManager>,
    db: State<'_, DatabaseConnection>,
    params: ListThreadsParams,
) -> AppResult<ListThreadsResponse> {
    let workspace_path = workspace_manager.normalize_workspace_path(&params.workspace_path)?;

    let threads = crate::db::threads::get_threads_for_workspace(&db, &workspace_path).await?;

    let items = threads
        .into_iter()
        .map(|thread| ThreadSummary {
            thread_id: thread.thread_id.clone(),
            workspace_path: workspace_path.clone(),
            current_conversation_id: thread.current_conversation_id.clone(),
            title: thread.title.clone(),
            preview: thread
                .preview
                .clone()
                .or(thread.title.clone())
                .unwrap_or_else(|| "Untitled session".to_string()),
            timestamp: thread.updated_at.clone(),
            rollout_count: thread.rollouts.len(),
        })
        .collect();

    Ok(ListThreadsResponse { items })
}

/// List all rollouts recorded for a thread.
#[tauri::command]
pub async fn list_thread_rollouts(
    workspace_manager: State<'_, WorkspaceManager>,
    db: State<'_, DatabaseConnection>,
    params: ListThreadRolloutsParams,
) -> AppResult<ListThreadRolloutsResponse> {
    let workspace_path = workspace_manager.normalize_workspace_path(&params.workspace_path)?;

    let thread = crate::db::threads::get_thread(&db, &workspace_path, &params.thread_id)
        .await?
        .ok_or(AppError::NotFound { entity: "thread" })?;

    Ok(ListThreadRolloutsResponse {
        thread_id: thread.thread_id,
        current_conversation_id: thread.current_conversation_id,
        rollouts: thread.rollouts,
    })
}

/// Create a new thread and its initial rollout.
#[tauri::command]
pub async fn new_thread(
    params: NewThreadCommandParams,
    workspace_manager: State<'_, WorkspaceManager>,
    db: State<'_, DatabaseConnection>,
    runtime: State<'_, CodexRuntime>,
    app_handle: AppHandle,
) -> AppResult<NewThreadResponse> {
    let workspace_path = workspace_manager.normalize_workspace_path(&params.workspace_path)?;
    let workspace_root_path = PathBuf::from(&workspace_path);

    if !runtime.is_initialized().await {
        return Err(AppError::Validation {
            message: "Runtime not initialized".to_string(),
        });
    }

    let mut options = params.options.unwrap_or_default();
    let workspace_defaults =
        crate::db::workspace::get_workspace_defaults(&db, &workspace_path).await?;
    apply_workspace_defaults(&mut options, &workspace_defaults);

    let mut base_config = runtime.config().as_ref().clone();
    base_config.cwd = workspace_root_path.clone();

    let mut config = derive_config_from_params(options, &base_config).await?;
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
        .map_err(|e| AppError::Codex(format!("Failed to create conversation: {}", e)))?;

    let conversation_id = new_conv.conversation_id;
    let conversation_id_str = conversation_id.to_string();
    let rollout_path = new_conv.session_configured.rollout_path.clone();

    let thread_id = Uuid::new_v4().to_string();
    let timestamp = Utc::now().to_rfc3339();
    let thread_rollout = ThreadRollout {
        conversation_id: conversation_id_str.clone(),
        rollout_path: rollout_path.to_string_lossy().to_string(),
        created_at: timestamp.clone(),
        label: None,
        forked_from_conversation_id: None,
        forked_from_nth_user_message: None,
    };
    let thread_record = ThreadRecord {
        thread_id: thread_id.clone(),
        created_at: timestamp.clone(),
        updated_at: timestamp.clone(),
        current_conversation_id: conversation_id_str.clone(),
        rollouts: vec![thread_rollout],
        title: None,
        preview: Some("Untitled session".to_string()),
    };

    crate::db::threads::upsert_thread(&db, &workspace_path, thread_record).await?;

    let session = workspace_manager
        .store_active_conversation(
            conversation_id_str.clone(),
            rollout_path.clone(),
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

    Ok(NewThreadResponse {
        thread_id,
        conversation_id,
        model: new_conv.session_configured.model,
        reasoning_effort: new_conv.session_configured.reasoning_effort,
        rollout_path,
    })
}

/// Initialize a thread by resuming its current conversation rollout.
#[tauri::command]
pub async fn initialize_thread(
    params: InitializeThreadParams,
    workspace_manager: State<'_, WorkspaceManager>,
    db: State<'_, DatabaseConnection>,
    runtime: State<'_, CodexRuntime>,
    app_handle: AppHandle,
) -> AppResult<InitializeThreadResponse> {
    if !runtime.is_initialized().await {
        return Err(AppError::Validation {
            message: "Runtime not initialized".to_string(),
        });
    }

    let workspace_path = workspace_manager.normalize_workspace_path(&params.workspace_path)?;

    let thread = crate::db::threads::get_thread(&db, &workspace_path, &params.thread_id)
        .await?
        .ok_or(AppError::NotFound { entity: "thread" })?;

    let conversation_id = thread.current_conversation_id.clone();
    let current_rollout = find_rollout_for_conversation(&thread, &conversation_id)
        .ok_or(AppError::NotFound { entity: "rollout" })?;
    let rollout_path = PathBuf::from(&current_rollout.rollout_path);

    let cwd = match workspace_manager
        .get_active_conversation(&conversation_id)
        .await
    {
        Some(active) => active.cwd.clone(),
        None => load_rollout_cwd(&rollout_path, Some(&workspace_path)).await?,
    };

    let session = workspace_manager
        .store_active_conversation(conversation_id.clone(), rollout_path.clone(), cwd.clone())
        .await;

    let mut config = runtime.config().as_ref().clone();
    config.cwd = cwd;
    let fallback_env = config.shell_environment_policy.r#set.clone();
    let env_vars = session.workspace_environment(&fallback_env).await;
    config.shell_environment_policy.r#set = env_vars.clone();
    let reasoning_summary = config.model_reasoning_summary;
    let auth_manager = runtime.auth_manager().clone();

    let new_conversation = runtime
        .conversation_manager()
        .resume_conversation_from_rollout(config, rollout_path.clone(), auth_manager)
        .await
        .map_err(|e| AppError::Codex(format!("Failed to resume conversation: {}", e)))?;

    let session_configured = new_conversation.session_configured.clone();
    let conv_id =
        ConversationId::from_string(&conversation_id).map_err(|e| AppError::Validation {
            message: format!("Invalid conversation ID: {}", e),
        })?;

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

    Ok(InitializeThreadResponse {
        session_configured,
        reasoning_summary,
    })
}

/// Switch a thread to a specific rollout and resume its conversation.
#[tauri::command]
pub async fn switch_thread_rollout(
    params: SwitchThreadRolloutParams,
    workspace_manager: State<'_, WorkspaceManager>,
    db: State<'_, DatabaseConnection>,
    runtime: State<'_, CodexRuntime>,
    app_handle: AppHandle,
) -> AppResult<SwitchThreadRolloutResponse> {
    if !runtime.is_initialized().await {
        return Err(AppError::Validation {
            message: "Runtime not initialized".to_string(),
        });
    }

    let workspace_path = workspace_manager.normalize_workspace_path(&params.workspace_path)?;

    let mut thread = crate::db::threads::get_thread(&db, &workspace_path, &params.thread_id)
        .await?
        .ok_or(AppError::NotFound { entity: "thread" })?;

    let conv_id =
        ConversationId::from_string(&params.conversation_id).map_err(|e| AppError::Validation {
            message: format!("Invalid conversation ID: {}", e),
        })?;

    let rollout = find_rollout_for_conversation(&thread, &params.conversation_id)
        .ok_or(AppError::NotFound { entity: "rollout" })?;
    let rollout_path = PathBuf::from(&rollout.rollout_path);

    let cwd = match workspace_manager
        .get_active_conversation(&params.conversation_id)
        .await
    {
        Some(active) => active.cwd.clone(),
        None => load_rollout_cwd(&rollout_path, Some(&workspace_path)).await?,
    };

    let session = workspace_manager
        .store_active_conversation(
            params.conversation_id.clone(),
            rollout_path.clone(),
            cwd.clone(),
        )
        .await;

    let mut config = runtime.config().as_ref().clone();
    config.cwd = cwd;
    let fallback_env = config.shell_environment_policy.r#set.clone();
    let env_vars = session.workspace_environment(&fallback_env).await;
    config.shell_environment_policy.r#set = env_vars.clone();
    let reasoning_summary = config.model_reasoning_summary;
    let auth_manager = runtime.auth_manager().clone();
    let existing_conversation = runtime
        .conversation_manager()
        .get_conversation(conv_id)
        .await;

    let (session_configured, reasoning_summary) = match existing_conversation {
        Ok(conversation) => {
            // Conversation already active in runtime; ensure we have a subscription,
            // but avoid replaying history from the rollout.
            let _ = runtime
                .event_manager()
                .subscribe(
                    conv_id,
                    conversation,
                    app_handle.clone(),
                    params.conversation_id.clone(),
                )
                .await;

            (None, None)
        }
        Err(_) => {
            let new_conversation = runtime
                .conversation_manager()
                .resume_conversation_from_rollout(config, rollout_path.clone(), auth_manager)
                .await
                .map_err(|e| AppError::Codex(format!("Failed to resume conversation: {}", e)))?;

            let session_configured = new_conversation.session_configured.clone();

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
                        params.conversation_id.clone(),
                    )
                    .await;
            }

            (Some(session_configured), Some(reasoning_summary))
        }
    };

    if let Err(err) = session.review_snapshots().ensure_base().await {
        log::debug!(
            "Failed to ensure baseline snapshot for conversation {}: {}",
            params.conversation_id,
            err
        );
    }

    let timestamp = Utc::now().to_rfc3339();
    thread.current_conversation_id = params.conversation_id.clone();
    thread.updated_at = timestamp;

    crate::db::threads::upsert_thread(&db, &workspace_path, thread).await?;

    Ok(SwitchThreadRolloutResponse {
        conversation_id: conv_id,
        session_configured,
        reasoning_summary,
    })
}

/// Fork a thread's current conversation into a new rollout and switch the thread to it.
#[tauri::command]
pub async fn fork_thread(
    params: ForkThreadParams,
    workspace_manager: State<'_, WorkspaceManager>,
    db: State<'_, DatabaseConnection>,
    runtime: State<'_, CodexRuntime>,
    app_handle: AppHandle,
) -> AppResult<ForkThreadResponse> {
    if !runtime.is_initialized().await {
        return Err(AppError::Validation {
            message: "Runtime not initialized".to_string(),
        });
    }

    let ForkThreadParams {
        workspace_path,
        thread_id,
        base_conversation_id,
        nth_user_message,
        options,
    } = params;

    let workspace_path = workspace_manager.normalize_workspace_path(&workspace_path)?;

    let mut thread = crate::db::threads::get_thread(&db, &workspace_path, &thread_id)
        .await?
        .ok_or(AppError::NotFound { entity: "thread" })?;

    let base_conversation_id_parsed =
        ConversationId::from_string(&base_conversation_id).map_err(|e| AppError::Validation {
            message: format!(
                "Invalid conversation ID for fork (thread {}): {}",
                thread_id, e
            ),
        })?;

    let base_rollout = find_rollout_for_conversation(&thread, &base_conversation_id)
        .ok_or(AppError::NotFound { entity: "rollout" })?;
    let rollout_path = PathBuf::from(&base_rollout.rollout_path);

    let cwd = match workspace_manager
        .get_active_conversation(&base_conversation_id)
        .await
    {
        Some(active) => active.cwd.clone(),
        None => load_rollout_cwd(&rollout_path, Some(&workspace_path)).await?,
    };

    let session = workspace_manager
        .store_active_conversation(
            base_conversation_id.clone(),
            rollout_path.clone(),
            cwd.clone(),
        )
        .await;

    let mut options = options.unwrap_or_default();
    let workspace_defaults =
        crate::db::workspace::get_workspace_defaults(&db, &workspace_path).await?;
    apply_workspace_defaults(&mut options, &workspace_defaults);

    let mut base_config = runtime.config().as_ref().clone();
    base_config.cwd = cwd.clone();

    let mut config = derive_config_from_params(options, &base_config).await?;

    let fallback_env = config.shell_environment_policy.r#set.clone();
    let env_vars = session.workspace_environment(&fallback_env).await;
    config.shell_environment_policy.r#set = env_vars.clone();
    let reasoning_summary = config.model_reasoning_summary;

    let new_conv = runtime
        .conversation_manager()
        .fork_conversation(nth_user_message as usize, config, rollout_path.clone())
        .await
        .map_err(|e| AppError::Codex(format!("Failed to fork conversation: {}", e)))?;

    let conversation_id = new_conv.conversation_id;
    let conversation_id_str = conversation_id.to_string();
    let timestamp = Utc::now().to_rfc3339();
    let session_configured = new_conv.session_configured.clone();
    let rollout_path = session_configured.rollout_path.clone();

    thread.rollouts.push(ThreadRollout {
        conversation_id: conversation_id_str.clone(),
        rollout_path: rollout_path.to_string_lossy().to_string(),
        created_at: timestamp.clone(),
        label: None,
        forked_from_conversation_id: Some(base_conversation_id.clone()),
        forked_from_nth_user_message: Some(nth_user_message),
    });
    thread.current_conversation_id = conversation_id_str.clone();
    thread.updated_at = timestamp.clone();

    crate::db::threads::upsert_thread(&db, &workspace_path, thread).await?;

    let session = workspace_manager
        .store_active_conversation(
            conversation_id_str.clone(),
            session_configured.rollout_path.clone(),
            cwd,
        )
        .await;
    session.set_environment_cache(env_vars).await;

    if let Err(err) = session.review_snapshots().ensure_base().await {
        log::debug!(
            "Failed to ensure baseline snapshot for conversation {}: {}",
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
                conversation_id_str.clone(),
            )
            .await;
    }

    Ok(ForkThreadResponse {
        thread_id,
        base_conversation_id: base_conversation_id_parsed,
        conversation_id,
        rollout_path,
        session_configured,
        reasoning_summary,
        nth_user_message,
        created_at: timestamp,
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
    db: State<'_, DatabaseConnection>,
) -> AppResult<()> {
    if !runtime.is_initialized().await {
        return Err(AppError::Validation {
            message: "Runtime not initialized".to_string(),
        });
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

    let conv_id =
        ConversationId::from_string(&conversation_id).map_err(|e| AppError::Validation {
            message: format!("Invalid conversation ID: {}", e),
        })?;

    let app_handle_clone = app_handle.clone();

    let conversation = runtime
        .conversation_manager()
        .get_conversation(conv_id)
        .await
        .map_err(|_| AppError::NotFound {
            entity: "conversation",
        })?;

    let _ = runtime
        .event_manager()
        .subscribe(
            conv_id,
            conversation.clone(),
            app_handle_clone,
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

    if let Some(preview) = mapped_items
        .iter()
        .find_map(|item| match item {
            CoreUserInput::Text { text } => Some(text.trim()),
            _ => None,
        })
        .filter(|text| !text.is_empty())
    {
        if let Err(err) = crate::db::threads::update_thread_preview_for_conversation(
            &db,
            &conversation_id,
            preview,
        )
        .await
        {
            log::debug!(
                "Failed to update thread preview for conversation {}: {}",
                conversation_id,
                err
            );
        }

        title_generation::spawn_generate_thread_title(
            runtime.inner().clone(),
            db.inner().clone(),
            conv_id,
            preview.to_string(),
            app_handle.clone(),
        );
    }

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
            .map_err(|e| AppError::Codex(format!("Failed to apply turn overrides: {}", e)))?;
    }

    conversation
        .submit(Op::UserInput {
            items: mapped_items,
        })
        .await
        .map_err(|e| AppError::Codex(format!("Failed to submit user message: {}", e)))?;

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
) -> AppResult<()> {
    if !runtime.is_initialized().await {
        return Err(AppError::Validation {
            message: "Runtime not initialized".to_string(),
        });
    }

    let conversation_id = params.conversation_id;
    let conv_id =
        ConversationId::from_string(&conversation_id).map_err(|e| AppError::Validation {
            message: format!("Invalid conversation ID: {}", e),
        })?;

    let conversation = runtime
        .conversation_manager()
        .get_conversation(conv_id)
        .await
        .map_err(|_| AppError::NotFound {
            entity: "conversation",
        })?;

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
        .map_err(|e| AppError::Codex(format!("Failed to compact conversation: {}", e)))?;

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
) -> AppResult<InterruptConversationResponse> {
    if !runtime.is_initialized().await {
        return Err(AppError::Validation {
            message: "Runtime not initialized".to_string(),
        });
    }

    let conv_id =
        ConversationId::from_string(&params.conversation_id).map_err(|e| AppError::Validation {
            message: format!("Invalid conversation ID: {}", e),
        })?;

    let conversation = runtime
        .conversation_manager()
        .get_conversation(conv_id)
        .await
        .map_err(|_| AppError::NotFound {
            entity: "conversation",
        })?;

    conversation
        .submit(Op::Interrupt)
        .await
        .map_err(|e| AppError::Codex(format!("Failed to interrupt conversation: {}", e)))?;

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
) -> AppResult<AddConversationSubscriptionResponse> {
    if !runtime.is_initialized().await {
        return Err(AppError::Validation {
            message: "Runtime not initialized".to_string(),
        });
    }

    let conv_id =
        ConversationId::from_string(&params.conversation_id).map_err(|e| AppError::Validation {
            message: format!("Invalid conversation ID: {}", e),
        })?;

    let conversation = runtime
        .conversation_manager()
        .get_conversation(conv_id)
        .await
        .map_err(|_| AppError::NotFound {
            entity: "conversation",
        })?;

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
) -> AppResult<()> {
    let uuid = Uuid::parse_str(&params.subscription_id).map_err(|e| AppError::Validation {
        message: format!("Invalid subscription ID: {}", e),
    })?;

    runtime
        .event_manager()
        .unsubscribe(uuid)
        .await
        .map_err(|e| AppError::Validation { message: e })?;

    Ok(())
}

async fn derive_config_from_params(
    params: NewConversationParams,
    base_config: &Config,
) -> AppResult<Config> {
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
        .map_err(|e| AppError::Codex(format!("Failed to load config: {}", e)))?;
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

fn find_rollout_for_conversation<'a>(
    thread: &'a ThreadRecord,
    conversation_id: &str,
) -> Option<&'a ThreadRollout> {
    thread
        .rollouts
        .iter()
        .find(|rollout| rollout.conversation_id == conversation_id)
}

async fn load_rollout_cwd(
    rollout_path: &Path,
    fallback_workspace: Option<&str>,
) -> AppResult<PathBuf> {
    let file = match File::open(rollout_path).await {
        Ok(file) => file,
        Err(e) => {
            if let Some(ws) = fallback_workspace {
                log::debug!(
                    "Falling back to workspace cwd {} for rollout {}: {}",
                    ws,
                    rollout_path.display(),
                    e
                );
                return Ok(PathBuf::from(ws));
            }
            return Err(AppError::Io(e));
        }
    };
    let mut reader = BufReader::new(file);
    let mut first_line = String::new();
    let bytes_read = reader
        .read_line(&mut first_line)
        .await
        .map_err(AppError::Io)?;

    if bytes_read == 0 {
        if let Some(ws) = fallback_workspace {
            log::debug!(
                "Rollout {} did not contain a session header, falling back to workspace cwd {}",
                rollout_path.display(),
                ws
            );
            return Ok(PathBuf::from(ws));
        }
        return Err(AppError::Validation {
            message: format!(
                "Rollout {} did not contain a session header",
                rollout_path.display()
            ),
        });
    }

    let value: serde_json::Value = match serde_json::from_str(&first_line) {
        Ok(v) => v,
        Err(e) => {
            if let Some(ws) = fallback_workspace {
                log::debug!(
                    "Failed to parse rollout header {} ({}), falling back to workspace cwd {}",
                    rollout_path.display(),
                    e,
                    ws
                );
                return Ok(PathBuf::from(ws));
            }
            return Err(AppError::Validation {
                message: format!("Failed to parse rollout header: {}", e),
            });
        }
    };

    if let Some(cwd_str) = value.get("cwd").and_then(|v| v.as_str()) {
        return Ok(PathBuf::from(cwd_str));
    }

    if let Some(ws) = fallback_workspace {
        log::debug!(
            "Rollout {} header missing cwd, falling back to workspace cwd {}",
            rollout_path.display(),
            ws
        );
        return Ok(PathBuf::from(ws));
    }

    Err(AppError::Validation {
        message: format!("Rollout {} header missing cwd", rollout_path.display()),
    })
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
