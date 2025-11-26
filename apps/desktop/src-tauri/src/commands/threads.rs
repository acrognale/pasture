use std::collections::HashMap;
use std::path::PathBuf;

use codex_protocol::ConversationId;
use codex_protocol::config_types::{ReasoningEffort, ReasoningSummary, SandboxMode};
use codex_protocol::protocol::{AskForApproval, SessionConfiguredEvent};
use serde::{Deserialize, Serialize};
use serde_json::Value;
use tauri::{AppHandle, State};
use ts_rs::TS;

use crate::codex_config::NewThreadOptions;
use crate::domain::{Conversation, ThreadId};
use crate::errors::{AppError, AppResult};
use crate::services::{
    ForkConversationResult, SwitchConversationResult, ThreadInitialization, ThreadService,
    WorkspaceService,
};

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
            current_conversation_id: thread.current_conversation_id.to_string(),
            title: thread.title.clone(),
            preview: thread
                .preview
                .clone()
                .or_else(|| thread.title.clone())
                .unwrap_or_else(|| "Untitled session".to_string()),
            timestamp: thread.updated_at.clone(),
            conversation_count: thread.conversations.len(),
        })
        .collect();

    Ok(ListThreadsResponse { items })
}

/// List all conversations for a thread.
#[tauri::command]
pub async fn list_thread_conversations(
    workspace_service: State<'_, WorkspaceService>,
    thread_service: State<'_, ThreadService>,
    params: ListThreadConversationsParams,
) -> AppResult<ListThreadConversationsResponse> {
    let workspace_path = workspace_service.canonicalize(&params.workspace_path)?;
    let thread_id = ThreadId(params.thread_id);
    let thread = thread_service.get(&workspace_path, &thread_id).await?;

    let conversations = thread.conversations.clone();

    Ok(ListThreadConversationsResponse {
        thread_id: thread.id.as_str().to_string(),
        current_conversation_id: thread.current_conversation_id.to_string(),
        conversations,
    })
}

/// Create a new thread and its initial fork.
#[tauri::command]
pub async fn new_thread(
    params: NewThreadCommandParams,
    workspace_service: State<'_, WorkspaceService>,
    thread_service: State<'_, ThreadService>,
    app_handle: AppHandle,
) -> AppResult<NewThreadResponse> {
    let workspace_path = workspace_service.canonicalize(&params.workspace_path)?;

    let options = params.options.unwrap_or_default();
    let thread_options = NewThreadOptions::from(options);

    let (thread, new_conv) = thread_service
        .create(&workspace_path, thread_options, app_handle.clone())
        .await?;

    let rollout_path = new_conv.session_configured.rollout_path.clone();

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
    workspace_service: State<'_, WorkspaceService>,
    thread_service: State<'_, ThreadService>,
    app_handle: AppHandle,
) -> AppResult<InitializeThreadResponse> {
    let workspace_path = workspace_service.canonicalize(&params.workspace_path)?;
    let thread_id = ThreadId(params.thread_id);
    let ThreadInitialization {
        conversation,
        reasoning_summary,
        ..
    } = thread_service
        .initialize(&workspace_path, &thread_id, app_handle)
        .await?;

    Ok(InitializeThreadResponse {
        session_configured: conversation.session_configured,
        reasoning_summary,
    })
}

/// Switch a thread to a specific conversation and resume it.
#[tauri::command]
pub async fn switch_conversation(
    params: SwitchConversationParams,
    workspace_service: State<'_, WorkspaceService>,
    thread_service: State<'_, ThreadService>,
    app_handle: AppHandle,
) -> AppResult<SwitchConversationResponse> {
    let workspace_path = workspace_service.canonicalize(&params.workspace_path)?;
    let thread_id = ThreadId(params.thread_id);
    let conversation_id = params.conversation_id;

    let SwitchConversationResult {
        session_configured,
        reasoning_summary,
        ..
    } = thread_service
        .switch_conversation(&workspace_path, &thread_id, &conversation_id, app_handle)
        .await?;

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
    workspace_service: State<'_, WorkspaceService>,
    thread_service: State<'_, ThreadService>,
    app_handle: AppHandle,
) -> AppResult<ForkConversationResponse> {
    let ForkConversationParams {
        workspace_path,
        thread_id,
        base_conversation_id,
        nth_user_message,
        options,
    } = params;

    let workspace_path = workspace_service.canonicalize(&workspace_path)?;
    let thread_id = ThreadId(thread_id);

    let thread_options = NewThreadOptions::from(options.unwrap_or_default());

    let ForkConversationResult {
        thread: updated_thread,
        conversation: new_conv,
        reasoning_summary,
    } = thread_service
        .fork(
            &workspace_path,
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
