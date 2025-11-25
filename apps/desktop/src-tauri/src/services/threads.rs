use std::path::{Path, PathBuf};
use std::sync::Arc;

use chrono::Utc;
use codex_core::AuthManager;
use codex_core::ConversationManager;
use codex_core::NewConversation;
use codex_core::config::Config;
use codex_protocol::ConversationId;
use codex_protocol::config_types::ReasoningSummary;
use codex_protocol::protocol::SessionConfiguredEvent;
use tauri::AppHandle;
use uuid::Uuid;

use crate::db::{ThreadRepo, WorkspaceRepo};
use crate::domain::{Fork, ForkId, ForkPoint, Thread, ThreadId, WorkspacePath};
use crate::errors::{AppError, AppResult};
use crate::events::EventRouter;
use crate::services::{
    ConversationConfigDeriver, NewThreadOptions, ReviewService, load_rollout_cwd,
};

#[derive(Clone)]
pub struct ThreadService {
    threads: ThreadRepo,
    workspaces: WorkspaceRepo,
    conversations: Arc<ConversationManager>,
    auth_manager: Arc<AuthManager>,
    base_config: Arc<Config>,
    config_deriver: ConversationConfigDeriver,
    events: Arc<EventRouter>,
    review: Arc<ReviewService>,
}

pub struct ThreadInitialization {
    pub thread: Thread,
    pub conversation: NewConversation,
    pub reasoning_summary: ReasoningSummary,
}

pub struct SwitchForkResult {
    pub thread: Thread,
    pub session_configured: Option<SessionConfiguredEvent>,
    pub reasoning_summary: Option<ReasoningSummary>,
}

pub struct ForkThreadResult {
    pub thread: Thread,
    pub conversation: NewConversation,
    pub reasoning_summary: ReasoningSummary,
}

impl ThreadService {
    pub fn new(
        threads: ThreadRepo,
        workspaces: WorkspaceRepo,
        conversations: Arc<ConversationManager>,
        auth_manager: Arc<AuthManager>,
        base_config: Arc<Config>,
        config_deriver: ConversationConfigDeriver,
        events: Arc<EventRouter>,
        review: Arc<ReviewService>,
    ) -> Self {
        Self {
            threads,
            workspaces,
            conversations,
            auth_manager,
            base_config,
            config_deriver,
            events,
            review,
        }
    }

    pub async fn list(&self, workspace: &WorkspacePath) -> AppResult<Vec<Thread>> {
        self.threads.list_for_workspace(workspace).await
    }

    pub async fn get(&self, workspace: &WorkspacePath, thread_id: &ThreadId) -> AppResult<Thread> {
        self.load_thread(workspace, thread_id).await
    }

    pub async fn create(
        &self,
        workspace: &WorkspacePath,
        options: NewThreadOptions,
        app_handle: AppHandle,
    ) -> AppResult<(Thread, NewConversation)> {
        let mut base_config = self.base_config.as_ref().clone();
        base_config.cwd = PathBuf::from(workspace.as_str());

        let config = self
            .config_deriver
            .derive_for_new_thread(&base_config, workspace, &options)
            .await?;

        let new_conv = self
            .conversations
            .new_conversation(config)
            .await
            .map_err(|e| AppError::Codex(format!("Failed to create conversation: {}", e)))?;

        let timestamp = Utc::now().to_rfc3339();
        let thread_id = ThreadId(Uuid::new_v4().to_string());
        let fork_id = ForkId(new_conv.conversation_id.to_string());

        let fork = Fork {
            id: fork_id.clone(),
            thread_id: thread_id.clone(),
            rollout_path: new_conv
                .session_configured
                .rollout_path
                .to_string_lossy()
                .to_string(),
            created_at: timestamp.clone(),
            label: None,
            fork_point: None,
        };

        let thread = Thread {
            id: thread_id,
            current_fork_id: fork_id.clone(),
            forks: vec![fork],
            title: None,
            preview: Some("Untitled session".to_string()),
            created_at: timestamp.clone(),
            updated_at: timestamp,
            workspace_path: workspace.clone(),
        };

        self.threads.save(workspace, &thread).await?;
        self.workspaces.touch(workspace, None).await?;

        self.ensure_base_snapshot(&fork_id).await;
        self.ensure_subscription(&fork_id, app_handle).await;

        Ok((thread, new_conv))
    }

    pub async fn initialize(
        &self,
        workspace: &WorkspacePath,
        thread_id: &ThreadId,
        app_handle: AppHandle,
    ) -> AppResult<ThreadInitialization> {
        let thread = self.load_thread(workspace, thread_id).await?;
        let rollout_path = self.current_fork_rollout_path(&thread)?;
        let cwd = self.resolve_rollout_cwd(&rollout_path, workspace).await?;

        let mut config = self.base_config.as_ref().clone();
        config.cwd = cwd;
        let reasoning_summary = config.model_reasoning_summary;

        let new_conv = self
            .conversations
            .resume_conversation_from_rollout(config, rollout_path, self.auth_manager.clone())
            .await
            .map_err(|e| AppError::Codex(format!("Failed to resume conversation: {}", e)))?;

        let fork_id = ForkId::from(new_conv.conversation_id.clone());
        self.ensure_base_snapshot(&fork_id).await;
        self.ensure_subscription(&fork_id, app_handle).await;

        Ok(ThreadInitialization {
            thread,
            conversation: new_conv,
            reasoning_summary,
        })
    }

    pub async fn fork(
        &self,
        workspace: &WorkspacePath,
        thread_id: &ThreadId,
        fork_point: &ForkPoint,
        options: NewThreadOptions,
        app_handle: AppHandle,
    ) -> AppResult<ForkThreadResult> {
        let mut thread = self.load_thread(workspace, thread_id).await?;
        let base_fork = self
            .find_fork(&thread, &fork_point.fork_id)
            .ok_or(AppError::NotFound { entity: "fork" })?;

        let rollout_path = PathBuf::from(&base_fork.rollout_path);
        let cwd = self.resolve_rollout_cwd(&rollout_path, workspace).await?;

        let mut base_config = self.base_config.as_ref().clone();
        base_config.cwd = cwd;

        let config = self
            .config_deriver
            .derive_for_fork(&base_config, workspace, &options)
            .await?;
        let reasoning_summary = config.model_reasoning_summary;

        let new_conv = self
            .conversations
            .fork_conversation(
                fork_point.after_message as usize,
                config,
                rollout_path.clone(),
            )
            .await
            .map_err(|e| AppError::Codex(format!("Failed to fork conversation: {}", e)))?;

        let timestamp = Utc::now().to_rfc3339();
        let new_fork = Fork {
            id: ForkId(new_conv.conversation_id.to_string()),
            thread_id: thread.id.clone(),
            rollout_path: new_conv
                .session_configured
                .rollout_path
                .to_string_lossy()
                .to_string(),
            created_at: timestamp.clone(),
            label: None,
            fork_point: Some(fork_point.clone()),
        };

        thread.forks.push(new_fork.clone());
        thread.current_fork_id = ForkId(new_conv.conversation_id.to_string());
        thread.updated_at = timestamp;

        self.threads.save(workspace, &thread).await?;

        self.ensure_base_snapshot(&new_fork.id).await;
        self.ensure_subscription(&new_fork.id, app_handle).await;

        Ok(ForkThreadResult {
            thread,
            conversation: new_conv,
            reasoning_summary,
        })
    }

    pub async fn switch_fork(
        &self,
        workspace: &WorkspacePath,
        thread_id: &ThreadId,
        fork_id: &ForkId,
        app_handle: AppHandle,
    ) -> AppResult<SwitchForkResult> {
        let mut thread = self.load_thread(workspace, thread_id).await?;
        let fork = self
            .find_fork(&thread, fork_id)
            .ok_or(AppError::NotFound { entity: "fork" })?;
        let rollout_path = PathBuf::from(&fork.rollout_path);

        let cwd = self.resolve_rollout_cwd(&rollout_path, workspace).await?;
        let conv_id = ConversationId::try_from(fork_id.clone())?;
        let existing_conversation = self.conversations.get_conversation(conv_id.clone()).await;

        let (session_configured, reasoning_summary) = match existing_conversation {
            Ok(_) => {
                self.ensure_subscription(fork_id, app_handle.clone()).await;
                (None, None)
            }
            Err(_) => {
                let mut config = self.base_config.as_ref().clone();
                config.cwd = cwd;
                let reasoning_summary = config.model_reasoning_summary;

                let new_conv = self
                    .conversations
                    .resume_conversation_from_rollout(
                        config,
                        rollout_path.clone(),
                        self.auth_manager.clone(),
                    )
                    .await
                    .map_err(|e| {
                        AppError::Codex(format!("Failed to resume conversation: {}", e))
                    })?;

                self.ensure_subscription(fork_id, app_handle.clone()).await;

                (
                    Some(new_conv.session_configured.clone()),
                    Some(reasoning_summary),
                )
            }
        };

        self.ensure_base_snapshot(fork_id).await;

        thread.current_fork_id = fork_id.clone();
        thread.updated_at = Utc::now().to_rfc3339();

        self.threads.save(workspace, &thread).await?;

        Ok(SwitchForkResult {
            thread,
            session_configured,
            reasoning_summary,
        })
    }

    fn find_fork<'a>(&self, thread: &'a Thread, fork_id: &ForkId) -> Option<&'a Fork> {
        thread.forks.iter().find(|fork| &fork.id == fork_id)
    }

    async fn load_thread(
        &self,
        workspace: &WorkspacePath,
        thread_id: &ThreadId,
    ) -> AppResult<Thread> {
        self.threads
            .get(workspace, thread_id)
            .await?
            .ok_or(AppError::NotFound { entity: "thread" })
    }

    fn current_fork_rollout_path(&self, thread: &Thread) -> AppResult<PathBuf> {
        let fork = thread
            .forks
            .iter()
            .find(|f| f.id == thread.current_fork_id)
            .ok_or(AppError::NotFound { entity: "fork" })?;
        Ok(PathBuf::from(&fork.rollout_path))
    }

    async fn resolve_rollout_cwd(
        &self,
        rollout_path: &Path,
        workspace: &WorkspacePath,
    ) -> AppResult<PathBuf> {
        load_rollout_cwd(rollout_path, Some(Path::new(workspace.as_str()))).await
    }

    async fn ensure_base_snapshot(&self, fork_id: &ForkId) {
        let review_service = self.review.clone();
        if let Err(err) = review_service.ensure_base(fork_id).await {
            log::debug!(
                "Failed to ensure baseline snapshot for conversation {}: {}",
                fork_id,
                err
            );
        }
    }

    async fn ensure_subscription(&self, fork_id: &ForkId, app_handle: AppHandle) {
        let conv_id = match ConversationId::try_from(fork_id.clone()) {
            Ok(conv_id) => conv_id,
            Err(err) => {
                log::debug!(
                    "Unable to subscribe to conversation {}: {}",
                    fork_id.as_str(),
                    err
                );
                return;
            }
        };

        match self.conversations.get_conversation(conv_id).await {
            Ok(conversation) => {
                let _ = self
                    .events
                    .ensure_subscription(
                        fork_id.clone(),
                        conversation,
                        app_handle,
                        fork_id.as_str().to_string(),
                    )
                    .await;
            }
            Err(err) => {
                log::debug!(
                    "Unable to fetch conversation {} for subscription: {}",
                    fork_id,
                    err
                );
            }
        }
    }
}
