use anyhow::Context;
use anyhow::Result;
use serde::Deserialize;
use serde::Serialize;
use std::collections::HashMap;
use std::path::Path;
use std::path::PathBuf;
use std::sync::Arc;
use tokio::sync::Mutex;
use ts_rs::TS;

use codex_protocol::config_types::ReasoningEffort;
use codex_protocol::config_types::ReasoningSummary;
use codex_protocol::config_types::SandboxMode;
use codex_protocol::protocol::AskForApproval;

use crate::env;
use crate::review_snapshots::ReviewSnapshots;

#[derive(Debug, Clone)]
pub struct ActiveConversation {
    pub rollout_path: PathBuf,
    pub cwd: PathBuf,
    environment: Arc<Mutex<Option<HashMap<String, String>>>>,
    review_snapshots: ReviewSnapshots,
}

impl ActiveConversation {
    pub fn new(rollout_path: PathBuf, cwd: PathBuf) -> Self {
        Self {
            rollout_path,
            cwd: cwd.clone(),
            environment: Arc::new(Mutex::new(None)),
            review_snapshots: ReviewSnapshots::new(cwd),
        }
    }

    pub fn review_snapshots(&self) -> ReviewSnapshots {
        self.review_snapshots.clone()
    }

    pub async fn workspace_environment(
        &self,
        fallback_env: &HashMap<String, String>,
    ) -> HashMap<String, String> {
        {
            let env_guard = self.environment.lock().await;
            if let Some(env) = env_guard.clone() {
                return env;
            }
        }

        let captured = env::capture_login_shell_environment(Some(self.cwd.as_path())).await;
        let env_map = captured.unwrap_or_else(|| fallback_env.clone());

        let mut env_guard = self.environment.lock().await;
        *env_guard = Some(env_map.clone());
        env_map
    }

    pub async fn refresh_paths(&mut self, rollout_path: PathBuf, cwd: PathBuf) {
        self.rollout_path = rollout_path;
        self.cwd = cwd.clone();
        self.review_snapshots.update_cwd(cwd.as_path()).await;
        let mut env_guard = self.environment.lock().await;
        *env_guard = None;
    }

    pub async fn set_environment_cache(&self, env_map: HashMap<String, String>) {
        let mut env_guard = self.environment.lock().await;
        *env_guard = Some(env_map);
    }
}

/// Remembered per-workspace defaults applied to new conversations.
#[derive(Debug, Clone, Serialize, Deserialize, TS, PartialEq, Default)]
#[serde(rename_all = "camelCase")]
pub struct WorkspaceComposerDefaults {
    #[serde(skip_serializing_if = "Option::is_none")]
    pub model: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub reasoning_effort: Option<ReasoningEffort>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub reasoning_summary: Option<ReasoningSummary>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub sandbox: Option<SandboxMode>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub approval: Option<AskForApproval>,
}

impl WorkspaceComposerDefaults {
    pub fn is_empty(&self) -> bool {
        self.model.is_none()
            && self.reasoning_effort.is_none()
            && self.reasoning_summary.is_none()
            && self.sandbox.is_none()
            && self.approval.is_none()
    }
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, TS)]
#[serde(rename_all = "camelCase")]
pub struct ThreadRollout {
    pub conversation_id: String,
    pub rollout_path: String,
    pub created_at: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub label: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub forked_from_conversation_id: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub forked_from_nth_user_message: Option<u32>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct ThreadRecord {
    pub thread_id: String,
    pub created_at: String,
    pub updated_at: String,
    pub current_conversation_id: String,
    pub rollouts: Vec<ThreadRollout>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub title: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub preview: Option<String>,
}

#[derive(Clone)]
pub struct WorkspaceManager {
    active_conversations: Arc<Mutex<HashMap<String, ActiveConversation>>>,
}

impl WorkspaceManager {
    pub fn new() -> Self {
        Self {
            active_conversations: Arc::new(Mutex::new(HashMap::new())),
        }
    }

    pub fn normalize_workspace_path(&self, path: &str) -> Result<String> {
        let path = Path::new(path);
        let canonical = path
            .canonicalize()
            .with_context(|| format!("Failed to resolve workspace path: {}", path.display()))?;
        Ok(canonical.to_string_lossy().to_string())
    }

    pub fn build_workspace_title(&self, workspace_path: &str) -> String {
        let path = Path::new(workspace_path);
        path.file_name()
            .and_then(|name| name.to_str())
            .map(|s| s.to_string())
            .unwrap_or_else(|| workspace_path.to_string())
    }

    pub async fn store_active_conversation(
        &self,
        conversation_id: String,
        rollout_path: PathBuf,
        cwd: PathBuf,
    ) -> ActiveConversation {
        let existing = {
            let conversations = self.active_conversations.lock().await;
            conversations.get(&conversation_id).cloned()
        };

        if let Some(mut conversation) = existing {
            conversation.refresh_paths(rollout_path, cwd).await;
            let mut conversations = self.active_conversations.lock().await;
            conversations.insert(conversation_id, conversation.clone());
            conversation
        } else {
            let conversation = ActiveConversation::new(rollout_path, cwd);
            let mut conversations = self.active_conversations.lock().await;
            conversations.insert(conversation_id, conversation.clone());
            conversation
        }
    }

    pub async fn get_active_conversation(
        &self,
        conversation_id: &str,
    ) -> Option<ActiveConversation> {
        let conversations = self.active_conversations.lock().await;
        conversations.get(conversation_id).cloned()
    }
}
