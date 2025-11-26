use std::path::{Path, PathBuf};
use std::sync::Arc;

use chrono::Utc;
use codex_core::AuthManager;
use codex_core::ConversationManager;
use codex_core::NewConversation;
use codex_core::config::Config;
use codex_protocol::ConversationId;
use codex_protocol::config_types::{ReasoningEffort, ReasoningSummary};
use codex_protocol::protocol::SessionConfiguredEvent;
use tauri::AppHandle;
use tauri::Emitter;
use uuid::Uuid;

use crate::codex_config::{NewThreadOptions, derive_config};
use crate::completions;
use crate::db::{ThreadRepo, WorkspaceRepo, WorkspaceSettingsRepo};
use crate::domain::{Fork, ForkId, ForkPoint, Thread, ThreadId, WorkspacePath};
use crate::errors::{AppError, AppResult};
use crate::events::{CodexEvent, EventRouter, ThreadMetadataPayload};
use crate::services::{ReviewService, load_rollout_cwd};
use crate::title_generation;

#[derive(Clone)]
pub struct ThreadService {
    threads: ThreadRepo,
    workspaces: WorkspaceRepo,
    workspace_settings: WorkspaceSettingsRepo,
    conversations: Arc<ConversationManager>,
    auth_manager: Arc<AuthManager>,
    base_config: Arc<Config>,
    events: Arc<EventRouter>,
    review: Arc<ReviewService>,
}

pub struct ThreadInitialization {
    pub conversation: NewConversation,
    pub reasoning_summary: ReasoningSummary,
}

pub struct SwitchForkResult {
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
        workspace_settings: WorkspaceSettingsRepo,
        conversations: Arc<ConversationManager>,
        auth_manager: Arc<AuthManager>,
        base_config: Arc<Config>,
        events: Arc<EventRouter>,
        review: Arc<ReviewService>,
    ) -> Self {
        Self {
            threads,
            workspaces,
            workspace_settings,
            conversations,
            auth_manager,
            base_config,
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

        let settings = self.load_workspace_settings(workspace).await?;
        let config = derive_config(&base_config, &settings, &options).await?;

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

        let fork_id = ForkId::from(new_conv.conversation_id);
        self.ensure_base_snapshot(&fork_id).await;
        self.ensure_subscription(&fork_id, app_handle).await;

        Ok(ThreadInitialization {
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

        let settings = self.load_workspace_settings(workspace).await?;
        let config = derive_config(&base_config, &settings, &options).await?;
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
        let existing_conversation = self.conversations.get_conversation(conv_id).await;

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
            session_configured,
            reasoning_summary,
        })
    }

    /// Update preview metadata for a fork and kick off background title generation.
    /// Best effort: failures are logged and do not affect the user flow.
    pub async fn handle_preview_and_title(
        &self,
        conversation_id: &ConversationId,
        fork_id: &ForkId,
        preview: String,
        app_handle: AppHandle,
    ) {
        let trimmed_preview = preview.trim();
        if trimmed_preview.is_empty() {
            return;
        }

        if let Err(err) = self
            .update_preview_for_fork(fork_id, trimmed_preview, &app_handle)
            .await
        {
            log::debug!(
                "Failed to update thread preview for conversation {}: {}",
                conversation_id,
                err
            );
        }

        let service = self.clone();
        let conversation_id = *conversation_id;
        let fork_id = fork_id.clone();
        let user_message = trimmed_preview.to_string();
        tauri::async_runtime::spawn(async move {
            if let Err(err) = service
                .maybe_generate_thread_title(conversation_id, fork_id, user_message, app_handle)
                .await
            {
                log::debug!("Session title generation skipped: {err}");
            }
        });
    }

    async fn update_preview_for_fork(
        &self,
        fork_id: &ForkId,
        preview: &str,
        app_handle: &AppHandle,
    ) -> AppResult<()> {
        let updated = self
            .threads
            .update_preview_for_fork(fork_id, preview)
            .await?;

        if updated {
            self.emit_thread_metadata_events(fork_id, app_handle, None, Some(preview.to_string()))
                .await;
        }

        Ok(())
    }

    async fn maybe_generate_thread_title(
        &self,
        conversation_id: ConversationId,
        fork_id: ForkId,
        user_message: String,
        app_handle: AppHandle,
    ) -> anyhow::Result<()> {
        let trimmed_message = user_message.trim();
        if trimmed_message.is_empty() {
            log::debug!(
                "Skipping title generation for conversation {}: empty first user text",
                conversation_id
            );
            return Ok(());
        }

        let needs_title = self
            .threads
            .has_missing_title_for_fork(&fork_id)
            .await
            .unwrap_or_else(|err| {
                log::debug!(
                    "Failed to check existing titles for conversation {}: {err}",
                    conversation_id
                );
                false
            });

        if !needs_title {
            log::debug!(
                "Skipping title generation for conversation {}: title already present",
                conversation_id
            );
            return Ok(());
        }

        let prompt = title_generation::build_prompt(trimmed_message);
        let model = completions::ModelConfig {
            model: "gpt-5.1-codex-mini".to_string(),
            reasoning_effort: Some(ReasoningEffort::Low),
        };

        log::info!(
            "Generating session title for conversation {} using model {}",
            conversation_id,
            model.model
        );

        match completions::generate_text(
            self.base_config.clone(),
            self.auth_manager.clone(),
            conversation_id,
            &prompt,
            Some(model),
        )
        .await
        {
            Ok(Some(text)) => {
                log::info!(
                    "Title generation model response for conversation {}: {}",
                    conversation_id,
                    text
                );
                if let Some(title) = title_generation::parse_title_from_text(&text) {
                    match self.threads.update_title_for_fork(&fork_id, &title).await {
                        Ok(updated) => {
                            if updated {
                                self.emit_thread_metadata_events(
                                    &fork_id,
                                    &app_handle,
                                    Some(title),
                                    None,
                                )
                                .await;
                                log::info!(
                                    "Emitted generated session title for conversation {}",
                                    conversation_id
                                );
                            } else {
                                log::info!(
                                    "Generated title for conversation {} but no rows were updated (possibly already set)",
                                    conversation_id
                                );
                            }
                        }
                        Err(err) => {
                            log::info!(
                                "Failed to store generated title for conversation {}: {err}",
                                conversation_id
                            );
                        }
                    }
                } else {
                    log::info!(
                        "Model did not return a usable title for conversation {}",
                        conversation_id
                    );
                }
            }
            Ok(None) => {
                log::info!(
                    "Model did not return a usable title for conversation {}",
                    conversation_id
                );
            }
            Err(err) => {
                log::info!(
                    "Failed to generate title for conversation {}: {err:?}",
                    conversation_id
                );
            }
        }

        Ok(())
    }

    async fn emit_thread_metadata_events(
        &self,
        fork_id: &ForkId,
        app_handle: &AppHandle,
        title: Option<String>,
        preview: Option<String>,
    ) {
        let threads = match self.threads.list_for_fork(fork_id).await {
            Ok(threads) => threads,
            Err(err) => {
                log::debug!(
                    "Failed to load threads for metadata event (conversation {}): {}",
                    fork_id.as_str(),
                    err
                );
                return;
            }
        };

        for thread in threads {
            let payload = ThreadMetadataPayload {
                thread_id: thread.id.as_str().to_string(),
                conversation_id: thread.current_fork_id.as_str().to_string(),
                workspace_path: thread.workspace_path.as_str().to_string(),
                title: title.clone().or(thread.title.clone()),
                preview: preview.clone().or(thread.preview.clone()),
                timestamp: thread.updated_at.clone(),
            };
            log::info!(
                "Emitting thread-metadata-updated for thread {} (conversation {})",
                payload.thread_id,
                payload.conversation_id
            );
            if let Err(err) =
                app_handle.emit("codex-event", CodexEvent::ThreadMetadataUpdated { payload })
            {
                log::debug!("Failed to emit thread metadata event: {}", err);
            }
        }
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

    async fn load_workspace_settings(
        &self,
        workspace: &WorkspacePath,
    ) -> AppResult<crate::domain::WorkspaceSettings> {
        Ok(self
            .workspace_settings
            .get(workspace)
            .await?
            .unwrap_or_default())
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
