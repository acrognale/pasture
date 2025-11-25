use std::collections::HashMap;
use std::path::PathBuf;
use std::sync::Arc;

use chrono::Utc;
use codex_core::AuthManager;
use codex_core::ConversationManager;
use codex_core::NewConversation;
use codex_core::config::Config;
use uuid::Uuid;

use crate::db::{ThreadRepo, WorkspaceRepo};
use crate::domain::{Fork, ForkId, ForkPoint, Thread, ThreadId, WorkspacePath};
use crate::errors::{AppError, AppResult};
use crate::services::{ConversationConfigDeriver, NewThreadOptions};

#[derive(Clone)]
pub struct ThreadService {
    threads: ThreadRepo,
    workspaces: WorkspaceRepo,
    conversations: Arc<ConversationManager>,
    auth_manager: Arc<AuthManager>,
    base_config: Arc<Config>,
    config_deriver: ConversationConfigDeriver,
}

impl ThreadService {
    pub fn new(
        threads: ThreadRepo,
        workspaces: WorkspaceRepo,
        conversations: Arc<ConversationManager>,
        auth_manager: Arc<AuthManager>,
        base_config: Arc<Config>,
        config_deriver: ConversationConfigDeriver,
    ) -> Self {
        Self {
            threads,
            workspaces,
            conversations,
            auth_manager,
            base_config,
            config_deriver,
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
        env_vars: HashMap<String, String>,
    ) -> AppResult<(Thread, NewConversation)> {
        let mut base_config = self.base_config.as_ref().clone();
        base_config.cwd = PathBuf::from(workspace.as_str());

        let mut config = self
            .config_deriver
            .derive_for_new_thread(&base_config, workspace, &options)
            .await?;
        config.shell_environment_policy.r#set = env_vars;

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
            current_fork_id: fork_id,
            forks: vec![fork],
            title: None,
            preview: Some("Untitled session".to_string()),
            created_at: timestamp.clone(),
            updated_at: timestamp,
            workspace_path: workspace.clone(),
        };

        self.threads.save(workspace, &thread).await?;
        self.workspaces.touch(workspace, None).await?;

        Ok((thread, new_conv))
    }

    pub async fn initialize(
        &self,
        workspace: &WorkspacePath,
        thread_id: &ThreadId,
        rollout_path: PathBuf,
        cwd: PathBuf,
        env_vars: HashMap<String, String>,
    ) -> AppResult<(Thread, NewConversation)> {
        let thread = self.load_thread(workspace, thread_id).await?;

        let mut config = self.base_config.as_ref().clone();
        config.cwd = cwd;
        config.shell_environment_policy.r#set = env_vars;

        let new_conv = self
            .conversations
            .resume_conversation_from_rollout(config, rollout_path, self.auth_manager.clone())
            .await
            .map_err(|e| AppError::Codex(format!("Failed to resume conversation: {}", e)))?;

        Ok((thread, new_conv))
    }

    pub async fn fork(
        &self,
        workspace: &WorkspacePath,
        thread_id: &ThreadId,
        fork_point: &ForkPoint,
        cwd: PathBuf,
        env_vars: HashMap<String, String>,
        options: NewThreadOptions,
    ) -> AppResult<(Thread, NewConversation)> {
        let mut thread = self.load_thread(workspace, thread_id).await?;
        let base_fork = self
            .find_fork(&thread, &fork_point.fork_id)
            .ok_or(AppError::NotFound { entity: "fork" })?;

        let rollout_path = PathBuf::from(&base_fork.rollout_path);

        let mut base_config = self.base_config.as_ref().clone();
        base_config.cwd = cwd;

        let mut config = self
            .config_deriver
            .derive_for_fork(&base_config, workspace, &options)
            .await?;
        config.shell_environment_policy.r#set = env_vars;

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

        thread.forks.push(new_fork);
        thread.current_fork_id = ForkId(new_conv.conversation_id.to_string());
        thread.updated_at = timestamp;

        self.threads.save(workspace, &thread).await?;

        Ok((thread, new_conv))
    }

    pub async fn switch_rollout(
        &self,
        workspace: &WorkspacePath,
        thread_id: &ThreadId,
        fork_id: &ForkId,
    ) -> AppResult<Thread> {
        let mut thread = self.load_thread(workspace, thread_id).await?;
        if self.find_fork(&thread, fork_id).is_none() {
            return Err(AppError::NotFound { entity: "fork" });
        }

        thread.current_fork_id = fork_id.clone();
        thread.updated_at = Utc::now().to_rfc3339();

        self.threads.save(workspace, &thread).await?;
        Ok(thread)
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
}
