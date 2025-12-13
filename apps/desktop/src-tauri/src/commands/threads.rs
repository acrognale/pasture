use std::path::PathBuf;

use codex_protocol::ConversationId;
use codex_protocol::config_types::ReasoningSummary;
use codex_protocol::config_types::SandboxMode;
use codex_protocol::openai_models::ReasoningEffort;
use codex_protocol::protocol::AskForApproval;
use codex_protocol::protocol::SessionConfiguredEvent;
use serde::Deserialize;
use serde::Serialize;
use serde_json::Value;
use std::collections::HashMap;
use tauri::AppHandle;
use tauri::State;
use ts_rs::TS;

use crate::codex_config::NewThreadOptions;
use crate::context::WorkspaceContext;
use crate::domain::Conversation;
use crate::domain::ThreadId;
use crate::domain::WorkspacePath;
use crate::errors::AppError;
use crate::errors::AppResult;
use crate::state::AppState;
use crate::threads;

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
    pub conversation_count: usize,
}

#[derive(Serialize, Deserialize, Debug, Clone, PartialEq, TS)]
#[serde(rename_all = "camelCase")]
pub struct ListThreadConversationsParams {
    pub workspace_path: String,
    pub thread_id: String,
}

#[derive(Serialize, Deserialize, Debug, Clone, PartialEq, TS)]
#[serde(rename_all = "camelCase")]
pub struct ListThreadConversationsResponse {
    pub thread_id: String,
    pub current_conversation_id: String,
    pub conversations: Vec<Conversation>,
}

#[derive(Serialize, Deserialize, Debug, Clone, PartialEq, TS)]
#[serde(rename_all = "camelCase")]
pub struct SwitchConversationParams {
    pub workspace_path: String,
    pub thread_id: String,
    pub conversation_id: ConversationId,
}

#[derive(Serialize, Deserialize, Debug, Clone, TS)]
#[serde(rename_all = "camelCase")]
pub struct SwitchConversationResponse {
    pub conversation_id: ConversationId,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub session_configured: Option<SessionConfiguredEvent>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub reasoning_summary: Option<ReasoningSummary>,
}

#[derive(Serialize, Deserialize, Debug, Clone, PartialEq, Default, TS)]
#[serde(rename_all = "camelCase")]
pub struct ForkConversationParams {
    pub workspace_path: String,
    pub thread_id: String,
    pub base_conversation_id: ConversationId,
    pub nth_user_message: u32,
    pub options: Option<NewConversationParams>,
}

#[derive(Serialize, Deserialize, Debug, Clone, TS)]
#[serde(rename_all = "camelCase")]
pub struct ForkConversationResponse {
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
    #[serde(skip_serializing_if = "Option::is_none")]
    pub web_search_enabled: Option<bool>,
}

/// List all threads for a workspace from Pasture persistence.
#[tauri::command]
pub async fn list_threads(
    app: State<'_, AppState>,
    params: ListThreadsParams,
) -> AppResult<ListThreadsResponse> {
    let ctx = WorkspaceContext::new(WorkspacePath::canonicalize(&params.workspace_path)?, &app);

    let workspace_path_str = ctx.path.as_str().to_string();
    let items = threads::list(&ctx).await?;

    let items = items
        .into_iter()
        .map(|thread| ThreadSummary {
            thread_id: thread.id.as_str().to_string(),
            workspace_path: workspace_path_str.clone(),
            current_conversation_id: thread.current_conversation_id.to_string(),
            title: thread.title.clone(),
            preview: thread
                .preview
                .clone()
                .or_else(|| thread.title.clone())
                .unwrap_or_else(|| "Untitled thread".to_string()),
            timestamp: thread.updated_at.clone(),
            conversation_count: thread.conversations.len(),
        })
        .collect();

    Ok(ListThreadsResponse { items })
}

/// List all conversations for a thread.
#[tauri::command]
pub async fn list_thread_conversations(
    app: State<'_, AppState>,
    params: ListThreadConversationsParams,
) -> AppResult<ListThreadConversationsResponse> {
    let ctx = WorkspaceContext::new(WorkspacePath::canonicalize(&params.workspace_path)?, &app);
    let thread_id = ThreadId(params.thread_id);
    let thread = threads::get(&ctx, &thread_id).await?;

    Ok(ListThreadConversationsResponse {
        thread_id: thread.id.as_str().to_string(),
        current_conversation_id: thread.current_conversation_id.to_string(),
        conversations: thread.conversations,
    })
}

/// Create a new thread and its initial fork.
#[tauri::command]
pub async fn new_thread(
    params: NewThreadCommandParams,
    app: State<'_, AppState>,
    app_handle: AppHandle,
) -> AppResult<NewThreadResponse> {
    let ctx = WorkspaceContext::new(WorkspacePath::canonicalize(&params.workspace_path)?, &app);

    let options = params.options.unwrap_or_default();
    let thread_options = NewThreadOptions::from(options);

    let (thread, new_conv) = threads::create(&ctx, thread_options, app_handle).await?;

    let rollout_path = new_conv.session_configured.rollout_path.clone();

    // Search index is workspace-scoped; kick indexing after creating a new thread.
    if let Err(err) = app
        .thread_search
        .ensure_indexing_started(app.db.clone(), ctx.path.clone())
        .await
    {
        tracing::debug!(
            "Failed to start thread search indexing for workspace {}: {}",
            ctx.path.as_str(),
            err
        );
    }

    Ok(NewThreadResponse {
        thread_id: thread.id.as_str().to_string(),
        conversation_id: new_conv.conversation_id,
        model: new_conv.session_configured.model,
        reasoning_effort: new_conv.session_configured.reasoning_effort,
        rollout_path,
    })
}

/// Initialize a thread by resuming its current fork's conversation.
#[tauri::command]
pub async fn initialize_thread(
    params: InitializeThreadParams,
    app: State<'_, AppState>,
    app_handle: AppHandle,
) -> AppResult<InitializeThreadResponse> {
    let ctx = WorkspaceContext::new(WorkspacePath::canonicalize(&params.workspace_path)?, &app);
    let thread_id = ThreadId(params.thread_id);

    let threads::ThreadInitialization {
        conversation,
        reasoning_summary,
        ..
    } = threads::initialize(&ctx, &thread_id, app_handle).await?;

    Ok(InitializeThreadResponse {
        session_configured: conversation.session_configured,
        reasoning_summary,
    })
}

/// Switch a thread to a specific conversation and resume it.
#[tauri::command]
pub async fn switch_conversation(
    params: SwitchConversationParams,
    app: State<'_, AppState>,
    app_handle: AppHandle,
) -> AppResult<SwitchConversationResponse> {
    let ctx = WorkspaceContext::new(WorkspacePath::canonicalize(&params.workspace_path)?, &app);
    let thread_id = ThreadId(params.thread_id);
    let conversation_id = params.conversation_id;

    let threads::SwitchConversationResult {
        session_configured,
        reasoning_summary,
        ..
    } = threads::switch_conversation(&ctx, &thread_id, &conversation_id, app_handle).await?;

    Ok(SwitchConversationResponse {
        conversation_id,
        session_configured,
        reasoning_summary,
    })
}

/// Fork a conversation within a thread into a new conversation and switch to it.
#[tauri::command]
pub async fn fork_conversation(
    params: ForkConversationParams,
    app: State<'_, AppState>,
    app_handle: AppHandle,
) -> AppResult<ForkConversationResponse> {
    let ForkConversationParams {
        workspace_path,
        thread_id,
        base_conversation_id,
        nth_user_message,
        options,
    } = params;

    let ctx = WorkspaceContext::new(WorkspacePath::canonicalize(&workspace_path)?, &app);
    let thread_id = ThreadId(thread_id);
    let thread_options = NewThreadOptions::from(options.unwrap_or_default());

    let threads::ForkConversationResult {
        thread: updated_thread,
        conversation: new_conv,
        reasoning_summary,
    } = threads::fork(
        &ctx,
        &thread_id,
        &base_conversation_id,
        nth_user_message,
        thread_options,
        app_handle,
    )
    .await?;

    let new_conv_id = new_conv.conversation_id.to_string();
    let new_conversation = updated_thread
        .conversations
        .iter()
        .find(|conv| conv.id.to_string() == new_conv_id)
        .ok_or(AppError::NotFound {
            entity: "conversation",
        })?;

    let session_configured = new_conv.session_configured.clone();

    Ok(ForkConversationResponse {
        thread_id: thread_id.as_str().to_string(),
        base_conversation_id,
        conversation_id: new_conv.conversation_id,
        rollout_path: new_conv.session_configured.rollout_path.clone(),
        session_configured,
        reasoning_summary,
        nth_user_message,
        created_at: new_conversation.created_at.clone(),
    })
}

impl From<NewConversationParams> for NewThreadOptions {
    fn from(params: NewConversationParams) -> Self {
        Self {
            model: params.model,
            model_provider_id: None,
            profile: params.profile,
            cwd: params.cwd,
            approval_policy: params.approval_policy,
            sandbox: params.sandbox,
            config: params.config,
            base_instructions: params.base_instructions,
            include_apply_patch_tool: params.include_apply_patch_tool,
            web_search_enabled: params.web_search_enabled,
        }
    }
}
