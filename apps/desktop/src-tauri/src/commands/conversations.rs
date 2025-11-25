use std::collections::HashMap;
use std::path::{Path, PathBuf};
use std::sync::Arc;

use codex_core::AuthManager;
use codex_core::ConversationManager;
use codex_core::config::Config;
use codex_protocol::ConversationId;
use codex_protocol::config_types::{ReasoningEffort, ReasoningSummary, SandboxMode};
use codex_protocol::protocol::{AskForApproval, SessionConfiguredEvent, TurnAbortReason};
use codex_protocol::user_input::UserInput as CoreUserInput;
use sea_orm::DatabaseConnection;
use serde::{Deserialize, Serialize};
use serde_json::Value;
use tauri::{AppHandle, State};
use tokio::fs::File;
use tokio::io::{AsyncBufReadExt, BufReader};
use ts_rs::TS;
use uuid::Uuid;

use crate::domain::{ForkId, ForkPoint, ThreadId};
use crate::errors::{AppError, AppResult};
use crate::events::EventRouter;
use crate::services::{
    NewThreadOptions, ReviewService, ThreadService, TurnOverrides, TurnService, WorkspaceService,
};
use crate::title_generation;
use crate::workspace_manager::ThreadRollout;

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
    workspace_service: State<'_, WorkspaceService>,
    thread_service: State<'_, ThreadService>,
    params: ListThreadsParams,
) -> AppResult<ListThreadsResponse> {
    let workspace_path = workspace_service.canonicalize(&params.workspace_path)?;
    let workspace_path_str = workspace_path.as_str().to_string();
    let threads = thread_service.list(&workspace_path).await?;

    let items = threads
        .into_iter()
        .map(|thread| ThreadSummary {
            thread_id: thread.id.as_str().to_string(),
            workspace_path: workspace_path_str.clone(),
            current_conversation_id: thread.current_fork_id.as_str().to_string(),
            title: thread.title.clone(),
            preview: thread
                .preview
                .clone()
                .or_else(|| thread.title.clone())
                .unwrap_or_else(|| "Untitled session".to_string()),
            timestamp: thread.updated_at.clone(),
            rollout_count: thread.forks.len(),
        })
        .collect();

    Ok(ListThreadsResponse { items })
}

/// List all rollouts recorded for a thread.
#[tauri::command]
pub async fn list_thread_rollouts(
    workspace_service: State<'_, WorkspaceService>,
    thread_service: State<'_, ThreadService>,
    params: ListThreadRolloutsParams,
) -> AppResult<ListThreadRolloutsResponse> {
    let workspace_path = workspace_service.canonicalize(&params.workspace_path)?;
    let thread_id = ThreadId(params.thread_id);
    let thread = thread_service.get(&workspace_path, &thread_id).await?;

    let rollouts = thread
        .forks
        .iter()
        .map(|fork| ThreadRollout::from(fork))
        .collect();

    Ok(ListThreadRolloutsResponse {
        thread_id: thread.id.as_str().to_string(),
        current_conversation_id: thread.current_fork_id.as_str().to_string(),
        rollouts,
    })
}

/// Create a new thread and its initial rollout.
#[tauri::command]
pub async fn new_thread(
    params: NewThreadCommandParams,
    workspace_service: State<'_, WorkspaceService>,
    thread_service: State<'_, ThreadService>,
    config: State<'_, Arc<Config>>,
    conversation_manager: State<'_, Arc<ConversationManager>>,
    events: State<'_, Arc<EventRouter>>,
    review: State<'_, Arc<ReviewService>>,
    app_handle: AppHandle,
) -> AppResult<NewThreadResponse> {
    let workspace_path = workspace_service.canonicalize(&params.workspace_path)?;

    let options = params.options.unwrap_or_default();
    let thread_options = NewThreadOptions::from(options);

    let env_vars = config.shell_environment_policy.r#set.clone();

    let (thread, new_conv) = thread_service
        .create(&workspace_path, thread_options, env_vars.clone())
        .await?;

    let conversation_id = new_conv.conversation_id.clone();
    let fork_id = ForkId::from(conversation_id.clone());
    let conversation_id_str = conversation_id.to_string();
    let rollout_path = new_conv.session_configured.rollout_path.clone();

    let review_service = review.inner().clone();
    if let Err(err) = review_service.ensure_base(&fork_id).await {
        log::debug!(
            "Failed to capture baseline snapshot for conversation {}: {}",
            conversation_id_str,
            err
        );
    }

    if let Ok(conversation) = conversation_manager.get_conversation(conversation_id).await {
        let _ = events
            .ensure_subscription(
                fork_id.clone(),
                conversation,
                app_handle,
                conversation_id_str.clone(),
            )
            .await;
    }

    Ok(NewThreadResponse {
        thread_id: thread.id.as_str().to_string(),
        conversation_id: new_conv.conversation_id,
        model: new_conv.session_configured.model,
        reasoning_effort: new_conv.session_configured.reasoning_effort,
        rollout_path,
    })
}

/// Initialize a thread by resuming its current conversation rollout.
#[tauri::command]
pub async fn initialize_thread(
    params: InitializeThreadParams,
    workspace_service: State<'_, WorkspaceService>,
    thread_service: State<'_, ThreadService>,
    config: State<'_, Arc<Config>>,
    conversation_manager: State<'_, Arc<ConversationManager>>,
    events: State<'_, Arc<EventRouter>>,
    review: State<'_, Arc<ReviewService>>,
    app_handle: AppHandle,
) -> AppResult<InitializeThreadResponse> {
    let workspace_path = workspace_service.canonicalize(&params.workspace_path)?;
    let thread_id = ThreadId(params.thread_id);
    let thread = thread_service.get(&workspace_path, &thread_id).await?;

    let conversation_id = thread.current_fork_id.as_str().to_string();
    let start_rollout = thread
        .forks
        .iter()
        .find(|fork| fork.id.as_str() == thread.current_fork_id.as_str())
        .ok_or(AppError::NotFound { entity: "rollout" })?;
    let rollout_path = PathBuf::from(&start_rollout.rollout_path);

    let cwd = load_rollout_cwd(&rollout_path, Some(workspace_path.as_str())).await?;
    let env_vars = config.shell_environment_policy.r#set.clone();

    let (_, new_conversation) = thread_service
        .initialize(
            &workspace_path,
            &thread_id,
            rollout_path.clone(),
            cwd.clone(),
            env_vars.clone(),
        )
        .await?;

    let session_configured = new_conversation.session_configured.clone();
    let reasoning_summary = config.model_reasoning_summary;
    let conv_id =
        ConversationId::from_string(&conversation_id).map_err(|e| AppError::Validation {
            message: format!("Invalid conversation ID: {}", e),
        })?;
    let fork_id = ForkId::from(conv_id.clone());

    if let Ok(conversation) = conversation_manager.get_conversation(conv_id).await {
        let _ = events
            .ensure_subscription(
                fork_id.clone(),
                conversation,
                app_handle.clone(),
                conversation_id.clone(),
            )
            .await;
    }

    let review_service = review.inner().clone();
    if let Err(err) = review_service.ensure_base(&fork_id).await {
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
    workspace_service: State<'_, WorkspaceService>,
    thread_service: State<'_, ThreadService>,
    config: State<'_, Arc<Config>>,
    conversation_manager: State<'_, Arc<ConversationManager>>,
    events: State<'_, Arc<EventRouter>>,
    review: State<'_, Arc<ReviewService>>,
    app_handle: AppHandle,
) -> AppResult<SwitchThreadRolloutResponse> {
    let workspace_path = workspace_service.canonicalize(&params.workspace_path)?;
    let thread_id = ThreadId(params.thread_id);
    let thread = thread_service.get(&workspace_path, &thread_id).await?;

    let conv_id =
        ConversationId::from_string(&params.conversation_id).map_err(|e| AppError::Validation {
            message: format!("Invalid conversation ID: {}", e),
        })?;
    let fork_id = ForkId::from(conv_id.clone());

    let rollout = thread
        .forks
        .iter()
        .find(|fork| fork.id.as_str() == params.conversation_id)
        .ok_or(AppError::NotFound { entity: "rollout" })?;
    let rollout_path = PathBuf::from(&rollout.rollout_path);

    let cwd = load_rollout_cwd(&rollout_path, Some(workspace_path.as_str())).await?;
    let env_vars = config.shell_environment_policy.r#set.clone();
    let reasoning_summary = config.model_reasoning_summary;

    let existing_conversation = conversation_manager.get_conversation(conv_id.clone()).await;

    let (session_configured, resumed_reasoning_summary) = match existing_conversation {
        Ok(conversation) => {
            let _ = events
                .ensure_subscription(
                    fork_id.clone(),
                    conversation,
                    app_handle.clone(),
                    params.conversation_id.clone(),
                )
                .await;

            (None, None)
        }
        Err(_) => {
            let (_, new_conversation) = thread_service
                .initialize(
                    &workspace_path,
                    &thread_id,
                    rollout_path.clone(),
                    cwd.clone(),
                    env_vars.clone(),
                )
                .await?;

            if let Ok(conversation) = conversation_manager.get_conversation(conv_id.clone()).await {
                let _ = events
                    .ensure_subscription(
                        fork_id.clone(),
                        conversation,
                        app_handle.clone(),
                        params.conversation_id.clone(),
                    )
                    .await;
            }

            (
                Some(new_conversation.session_configured.clone()),
                Some(reasoning_summary),
            )
        }
    };

    let review_service = review.inner().clone();
    if let Err(err) = review_service.ensure_base(&fork_id).await {
        log::debug!(
            "Failed to ensure baseline snapshot for conversation {}: {}",
            params.conversation_id,
            err
        );
    }

    let _ = thread_service
        .switch_rollout(&workspace_path, &thread_id, &fork_id)
        .await?;

    Ok(SwitchThreadRolloutResponse {
        conversation_id: conv_id,
        session_configured,
        reasoning_summary: resumed_reasoning_summary,
    })
}

/// Fork a thread's current conversation into a new rollout and switch the thread to it.
#[tauri::command]
pub async fn fork_thread(
    params: ForkThreadParams,
    workspace_service: State<'_, WorkspaceService>,
    thread_service: State<'_, ThreadService>,
    config: State<'_, Arc<Config>>,
    conversation_manager: State<'_, Arc<ConversationManager>>,
    events: State<'_, Arc<EventRouter>>,
    review: State<'_, Arc<ReviewService>>,
    app_handle: AppHandle,
) -> AppResult<ForkThreadResponse> {
    let ForkThreadParams {
        workspace_path,
        thread_id,
        base_conversation_id,
        nth_user_message,
        options,
    } = params;

    let workspace_path = workspace_service.canonicalize(&workspace_path)?;
    let thread_id = ThreadId(thread_id);
    let thread = thread_service.get(&workspace_path, &thread_id).await?;

    let base_conversation_id_parsed =
        ConversationId::from_string(&base_conversation_id).map_err(|e| AppError::Validation {
            message: format!(
                "Invalid conversation ID for fork (thread {}): {}",
                thread_id.as_str(),
                e
            ),
        })?;

    let base_rollout = thread
        .forks
        .iter()
        .find(|fork| fork.id.as_str() == base_conversation_id)
        .ok_or(AppError::NotFound { entity: "rollout" })?;
    let rollout_path = PathBuf::from(&base_rollout.rollout_path);

    let cwd = load_rollout_cwd(&rollout_path, Some(workspace_path.as_str())).await?;
    let env_vars = config.shell_environment_policy.r#set.clone();
    let reasoning_summary = config.model_reasoning_summary;

    let thread_options = NewThreadOptions::from(options.unwrap_or_default());
    let fork_point = ForkPoint {
        fork_id: ForkId(base_conversation_id.clone()),
        after_message: nth_user_message,
    };

    let (updated_thread, new_conv) = thread_service
        .fork(
            &workspace_path,
            &thread_id,
            &fork_point,
            cwd.clone(),
            env_vars.clone(),
            thread_options,
        )
        .await?;

    let new_conv_id = new_conv.conversation_id.to_string();
    let new_fork = updated_thread
        .forks
        .iter()
        .find(|fork| fork.id.as_str() == new_conv_id)
        .ok_or(AppError::NotFound { entity: "fork" })?;

    let conversation_id = new_conv.conversation_id.clone();
    let conversation_id_str = new_conv_id.clone();
    let fork_id = ForkId::from(conversation_id.clone());
    let session_configured = new_conv.session_configured.clone();

    let review_service = review.inner().clone();
    if let Err(err) = review_service.ensure_base(&fork_id).await {
        log::debug!(
            "Failed to ensure baseline snapshot for conversation {}: {}",
            conversation_id_str,
            err
        );
    }

    if let Ok(conversation) = conversation_manager.get_conversation(conversation_id).await {
        let _ = events
            .ensure_subscription(
                fork_id.clone(),
                conversation,
                app_handle,
                conversation_id_str.clone(),
            )
            .await;
    }

    Ok(ForkThreadResponse {
        thread_id: thread_id.as_str().to_string(),
        base_conversation_id: base_conversation_id_parsed,
        conversation_id: new_conv.conversation_id,
        rollout_path: new_conv.session_configured.rollout_path.clone(),
        session_configured,
        reasoning_summary,
        nth_user_message,
        created_at: new_fork.created_at.clone(),
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
    config: State<'_, Arc<Config>>,
    auth_manager: State<'_, Arc<AuthManager>>,
    turn_service: State<'_, TurnService>,
    app_handle: AppHandle,
    db: State<'_, DatabaseConnection>,
) -> AppResult<()> {
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

    let fork_id = ForkId::from(conv_id.clone());

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
            config.inner().clone(),
            auth_manager.inner().clone(),
            db.inner().clone(),
            conv_id,
            preview.to_string(),
            app_handle.clone(),
        );
    }

    let overrides = TurnOverrides {
        model,
        reasoning_effort,
        summary,
        sandbox,
        approval_policy,
    };

    turn_service
        .send(
            &fork_id,
            mapped_items,
            overrides,
            &conversation_id,
            app_handle.clone(),
        )
        .await?;

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
    turn_service: State<'_, TurnService>,
    app_handle: AppHandle,
) -> AppResult<()> {
    let conversation_id = params.conversation_id;
    let conv_id =
        ConversationId::from_string(&conversation_id).map_err(|e| AppError::Validation {
            message: format!("Invalid conversation ID: {}", e),
        })?;

    let fork_id = ForkId::from(conv_id.clone());
    turn_service
        .compact(&fork_id, &conversation_id, app_handle)
        .await?;

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
    turn_service: State<'_, TurnService>,
) -> AppResult<InterruptConversationResponse> {
    let conv_id =
        ConversationId::from_string(&params.conversation_id).map_err(|e| AppError::Validation {
            message: format!("Invalid conversation ID: {}", e),
        })?;

    let fork_id = ForkId::from(conv_id.clone());
    turn_service.interrupt(&fork_id).await?;

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
    conversation_manager: State<'_, Arc<ConversationManager>>,
    events: State<'_, Arc<EventRouter>>,
    app_handle: AppHandle,
) -> AppResult<AddConversationSubscriptionResponse> {
    let conv_id =
        ConversationId::from_string(&params.conversation_id).map_err(|e| AppError::Validation {
            message: format!("Invalid conversation ID: {}", e),
        })?;

    let conversation = conversation_manager
        .get_conversation(conv_id)
        .await
        .map_err(|_| AppError::NotFound {
            entity: "conversation",
        })?;

    let fork_id = ForkId::from(conv_id.clone());
    let subscription_id = events
        .ensure_subscription(
            fork_id,
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
    events: State<'_, Arc<EventRouter>>,
) -> AppResult<()> {
    let uuid = Uuid::parse_str(&params.subscription_id).map_err(|e| AppError::Validation {
        message: format!("Invalid subscription ID: {}", e),
    })?;

    events
        .unsubscribe(uuid)
        .await
        .map_err(|e| AppError::Validation { message: e })?;

    Ok(())
}

impl From<NewConversationParams> for NewThreadOptions {
    fn from(params: NewConversationParams) -> Self {
        Self {
            model: params.model,
            profile: params.profile,
            cwd: params.cwd,
            approval_policy: params.approval_policy,
            sandbox: params.sandbox,
            config: params.config,
            base_instructions: params.base_instructions,
            include_apply_patch_tool: params.include_apply_patch_tool,
        }
    }
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
