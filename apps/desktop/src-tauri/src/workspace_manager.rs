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

use crate::domain::ids::{ForkId, ThreadId, WorkspacePath};
use crate::domain::thread::{Fork, ForkPoint, Thread};
use crate::domain::workspace::WorkspaceSettings;
use crate::env;
use crate::errors::AppResult;

#[derive(Debug, Clone)]
pub struct ActiveConversation {
    pub rollout_path: PathBuf,
    pub cwd: PathBuf,
    environment: Arc<Mutex<Option<HashMap<String, String>>>>,
}

impl ActiveConversation {
    pub fn new(rollout_path: PathBuf, cwd: PathBuf) -> Self {
        Self {
            rollout_path,
            cwd: cwd.clone(),
            environment: Arc::new(Mutex::new(None)),
        }
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

impl From<WorkspaceComposerDefaults> for WorkspaceSettings {
    fn from(value: WorkspaceComposerDefaults) -> Self {
        WorkspaceSettings {
            model: value.model,
            reasoning_effort: value.reasoning_effort,
            reasoning_summary: value.reasoning_summary,
            sandbox: value.sandbox,
            approval: value.approval,
        }
    }
}

impl From<WorkspaceSettings> for WorkspaceComposerDefaults {
    fn from(value: WorkspaceSettings) -> Self {
        WorkspaceComposerDefaults {
            model: value.model,
            reasoning_effort: value.reasoning_effort,
            reasoning_summary: value.reasoning_summary,
            sandbox: value.sandbox,
            approval: value.approval,
        }
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

impl ThreadRollout {
    pub fn into_domain(self, thread_id: &ThreadId) -> Fork {
        let fork_point = match (
            self.forked_from_conversation_id,
            self.forked_from_nth_user_message,
        ) {
            (Some(fork_id), Some(after_message)) => Some(ForkPoint {
                fork_id: ForkId(fork_id),
                after_message,
            }),
            _ => None,
        };

        Fork {
            id: ForkId(self.conversation_id),
            thread_id: thread_id.clone(),
            rollout_path: self.rollout_path,
            created_at: self.created_at,
            label: self.label,
            fork_point,
        }
    }
}

impl From<&Fork> for ThreadRollout {
    fn from(fork: &Fork) -> Self {
        let (forked_from_conversation_id, forked_from_nth_user_message) = match &fork.fork_point {
            Some(point) => (
                Some(point.fork_id.as_str().to_string()),
                Some(point.after_message),
            ),
            None => (None, None),
        };

        ThreadRollout {
            conversation_id: fork.id.as_str().to_string(),
            rollout_path: fork.rollout_path.clone(),
            created_at: fork.created_at.clone(),
            label: fork.label.clone(),
            forked_from_conversation_id,
            forked_from_nth_user_message,
        }
    }
}

impl ThreadRecord {
    pub fn into_domain(self, workspace_path: WorkspacePath) -> Thread {
        let thread_id = ThreadId(self.thread_id);
        let forks = self
            .rollouts
            .into_iter()
            .map(|rollout| rollout.into_domain(&thread_id))
            .collect();

        Thread {
            id: thread_id,
            current_fork_id: ForkId(self.current_conversation_id),
            forks,
            title: self.title,
            preview: self.preview,
            created_at: self.created_at,
            updated_at: self.updated_at,
            workspace_path,
        }
    }
}

impl From<&Thread> for ThreadRecord {
    fn from(thread: &Thread) -> Self {
        ThreadRecord {
            thread_id: thread.id.as_str().to_string(),
            created_at: thread.created_at.clone(),
            updated_at: thread.updated_at.clone(),
            current_conversation_id: thread.current_fork_id.as_str().to_string(),
            rollouts: thread.forks.iter().map(ThreadRollout::from).collect(),
            title: thread.title.clone(),
            preview: thread.preview.clone(),
        }
    }
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

    pub fn normalize_workspace_path(&self, path: &str) -> AppResult<WorkspacePath> {
        WorkspacePath::canonicalize(path)
    }

    pub fn build_workspace_title(&self, workspace_path: &WorkspacePath) -> String {
        let path = Path::new(workspace_path.as_str());
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
