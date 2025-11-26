//! Turn business logic - standalone functions for turn/message operations.

use std::sync::Arc;

use codex_core::CodexConversation;
use codex_core::ConversationManager;
use codex_protocol::ConversationId;
use codex_protocol::config_types::ReasoningEffort;
use codex_protocol::config_types::ReasoningSummary;
use codex_protocol::config_types::SandboxMode;
use codex_protocol::protocol::AskForApproval;
use codex_protocol::protocol::Op;
use codex_protocol::protocol::SandboxPolicy;
use codex_protocol::user_input::UserInput as CoreUserInput;
use tauri::AppHandle;
use uuid::Uuid;

use crate::errors::AppError;
use crate::errors::AppResult;
use crate::router::EventRouter;

// ============================================================
// Turn Overrides
// ============================================================

#[derive(Debug, Clone, Default)]
pub struct TurnOverrides {
    pub model: Option<String>,
    pub reasoning_effort: Option<ReasoningEffort>,
    pub summary: Option<ReasoningSummary>,
    pub sandbox: Option<SandboxMode>,
    pub approval_policy: Option<AskForApproval>,
}

impl TurnOverrides {
    pub fn is_empty(&self) -> bool {
        self.model.is_none()
            && self.reasoning_effort.is_none()
            && self.summary.is_none()
            && self.sandbox.is_none()
            && self.approval_policy.is_none()
    }
}

// ============================================================
// Operations
// ============================================================

/// Send user input to a conversation.
pub async fn send(
    conversations: &ConversationManager,
    events: &EventRouter,
    conversation_id: &ConversationId,
    items: Vec<CoreUserInput>,
    overrides: TurnOverrides,
    window_label: &str,
    app_handle: AppHandle,
) -> AppResult<()> {
    let conversation = resolve_conversation(conversations, conversation_id).await?;
    let _ = events
        .ensure_subscription(
            *conversation_id,
            conversation.clone(),
            app_handle,
            window_label.to_string(),
        )
        .await;

    if !overrides.is_empty() {
        let sandbox_policy = overrides.sandbox.map(sandbox_mode_to_policy);
        let effort_override = overrides.reasoning_effort.map(Some);
        conversation
            .submit(Op::OverrideTurnContext {
                cwd: None,
                approval_policy: overrides.approval_policy,
                sandbox_policy,
                model: overrides.model,
                effort: effort_override,
                summary: overrides.summary,
            })
            .await
            .map_err(|e| AppError::Codex(format!("Failed to apply turn overrides: {}", e)))?;
    }

    conversation
        .submit(Op::UserInput { items })
        .await
        .map_err(|e| AppError::Codex(format!("Failed to submit user message: {}", e)))
        .map(|_| ())
}

/// Interrupt an active conversation.
pub async fn interrupt(
    conversations: &ConversationManager,
    conversation_id: &ConversationId,
) -> AppResult<()> {
    let conversation = resolve_conversation(conversations, conversation_id).await?;
    conversation
        .submit(Op::Interrupt)
        .await
        .map_err(|e| AppError::Codex(format!("Failed to interrupt conversation: {}", e)))
        .map(|_| ())
}

/// Trigger the compact operation for a conversation.
pub async fn compact(
    conversations: &ConversationManager,
    events: &EventRouter,
    conversation_id: &ConversationId,
    window_label: &str,
    app_handle: AppHandle,
) -> AppResult<()> {
    let conversation = resolve_conversation(conversations, conversation_id).await?;
    let _ = events
        .ensure_subscription(
            *conversation_id,
            conversation.clone(),
            app_handle,
            window_label.to_string(),
        )
        .await;

    conversation
        .submit(Op::Compact)
        .await
        .map_err(|e| AppError::Codex(format!("Failed to compact conversation: {}", e)))
        .map(|_| ())
}

/// Add a subscription for conversation events.
pub async fn add_subscription(
    conversations: &ConversationManager,
    events: &EventRouter,
    conversation_id: &ConversationId,
    app_handle: AppHandle,
    window_label: String,
) -> AppResult<Uuid> {
    let conversation = resolve_conversation(conversations, conversation_id).await?;
    Ok(events
        .ensure_subscription(*conversation_id, conversation, app_handle, window_label)
        .await)
}

/// Remove a subscription for conversation events.
pub async fn remove_subscription(events: &EventRouter, subscription_id: Uuid) -> AppResult<()> {
    events
        .unsubscribe(subscription_id)
        .await
        .map_err(|e| AppError::Validation { message: e })
}

// ============================================================
// Helper Functions
// ============================================================

async fn resolve_conversation(
    conversations: &ConversationManager,
    conversation_id: &ConversationId,
) -> AppResult<Arc<CodexConversation>> {
    conversations
        .get_conversation(*conversation_id)
        .await
        .map_err(|_| AppError::NotFound {
            entity: "conversation",
        })
}

fn sandbox_mode_to_policy(mode: SandboxMode) -> SandboxPolicy {
    match mode {
        SandboxMode::ReadOnly => SandboxPolicy::new_read_only_policy(),
        SandboxMode::WorkspaceWrite => SandboxPolicy::new_workspace_write_policy(),
        SandboxMode::DangerFullAccess => SandboxPolicy::DangerFullAccess,
    }
}
