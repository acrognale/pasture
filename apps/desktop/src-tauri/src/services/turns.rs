use std::sync::Arc;

use codex_core::{CodexConversation, ConversationManager};
use codex_protocol::ConversationId;
use codex_protocol::config_types::{ReasoningEffort, ReasoningSummary, SandboxMode};
use codex_protocol::protocol::{AskForApproval, Op, SandboxPolicy};
use codex_protocol::user_input::UserInput as CoreUserInput;
use tauri::AppHandle;
use uuid::Uuid;

use crate::errors::{AppError, AppResult};
use crate::events::EventRouter;

#[derive(Clone)]
pub struct TurnService {
    conversations: Arc<ConversationManager>,
    events: Arc<EventRouter>,
}

impl TurnService {
    pub fn new(conversations: Arc<ConversationManager>, events: Arc<EventRouter>) -> Self {
        Self {
            conversations,
            events,
        }
    }

    pub async fn send(
        &self,
        fork_id: &ConversationId,
        items: Vec<CoreUserInput>,
        overrides: TurnOverrides,
        window_label: &str,
        app_handle: AppHandle,
    ) -> AppResult<()> {
        let conversation = self.resolve_conversation(fork_id).await?;
        let _ = self
            .events
            .ensure_subscription(
                fork_id.clone(),
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

    pub async fn interrupt(&self, fork_id: &ConversationId) -> AppResult<()> {
        let conversation = self.resolve_conversation(fork_id).await?;
        conversation
            .submit(Op::Interrupt)
            .await
            .map_err(|e| AppError::Codex(format!("Failed to interrupt conversation: {}", e)))
            .map(|_| ())
    }

    pub async fn compact(
        &self,
        fork_id: &ConversationId,
        window_label: &str,
        app_handle: AppHandle,
    ) -> AppResult<()> {
        let conversation = self.resolve_conversation(fork_id).await?;
        let _ = self
            .events
            .ensure_subscription(
                fork_id.clone(),
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

    pub async fn add_subscription(
        &self,
        fork_id: &ConversationId,
        app_handle: AppHandle,
        window_label: String,
    ) -> AppResult<Uuid> {
        let conversation = self.resolve_conversation(fork_id).await?;
        Ok(self
            .events
            .ensure_subscription(fork_id.clone(), conversation, app_handle, window_label)
            .await)
    }

    pub async fn remove_subscription(&self, subscription_id: Uuid) -> AppResult<()> {
        self.events
            .unsubscribe(subscription_id)
            .await
            .map_err(|e| AppError::Validation { message: e })
    }

    async fn resolve_conversation(
        &self,
        fork_id: &ConversationId,
    ) -> AppResult<Arc<CodexConversation>> {
        self.conversations
            .get_conversation(fork_id.clone())
            .await
            .map_err(|_| AppError::NotFound {
                entity: "conversation",
            })
    }
}

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

fn sandbox_mode_to_policy(mode: SandboxMode) -> SandboxPolicy {
    match mode {
        SandboxMode::ReadOnly => SandboxPolicy::new_read_only_policy(),
        SandboxMode::WorkspaceWrite => SandboxPolicy::new_workspace_write_policy(),
        SandboxMode::DangerFullAccess => SandboxPolicy::DangerFullAccess,
    }
}
