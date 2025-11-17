use anyhow::Context;
use anyhow::Result;
use serde::Deserialize;
use serde::Serialize;
use std::collections::HashMap;
use std::path::Path;
use std::path::PathBuf;
use std::sync::Arc;
use tokio::fs;
use tokio::sync::Mutex;
use tokio::sync::RwLock;
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

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
pub struct WorkspacePersistenceState {
    pub recent: Vec<String>,
    #[serde(default)]
    pub workspace_defaults: HashMap<String, WorkspaceComposerDefaults>,
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
    fn is_empty(&self) -> bool {
        self.model.is_none()
            && self.reasoning_effort.is_none()
            && self.reasoning_summary.is_none()
            && self.sandbox.is_none()
            && self.approval.is_none()
    }
}

#[derive(Clone)]
pub struct WorkspaceManager {
    state: Arc<RwLock<WorkspacePersistenceState>>,
    state_path: PathBuf,
    active_conversations: Arc<Mutex<HashMap<String, ActiveConversation>>>,
}

impl WorkspaceManager {
    pub fn new(state_path: PathBuf) -> Self {
        Self {
            state: Arc::new(RwLock::new(WorkspacePersistenceState::default())),
            state_path,
            active_conversations: Arc::new(Mutex::new(HashMap::new())),
        }
    }

    pub async fn load_state(&self) -> Result<()> {
        let content = match fs::read_to_string(&self.state_path).await {
            Ok(content) => content,
            Err(e) if e.kind() == std::io::ErrorKind::NotFound => {
                return Ok(());
            }
            Err(e) => {
                return Err(e).context("Failed to read workspace state file");
            }
        };

        let loaded_state: WorkspacePersistenceState =
            serde_json::from_str(&content).context("Failed to parse workspace state JSON")?;

        let mut state = self.state.write().await;
        *state = loaded_state;

        Ok(())
    }

    pub async fn save_state(&self) -> Result<()> {
        let state = self.state.read().await;
        let json =
            serde_json::to_string_pretty(&*state).context("Failed to serialize workspace state")?;

        if let Some(parent) = self.state_path.parent() {
            fs::create_dir_all(parent)
                .await
                .context("Failed to create state directory")?;
        }

        fs::write(&self.state_path, json)
            .await
            .context("Failed to write workspace state file")?;

        Ok(())
    }

    pub async fn record_workspace_access(&self, workspace_path: String) -> Result<String> {
        let normalized = self.normalize_workspace_path(&workspace_path)?;

        let mut state = self.state.write().await;
        self.touch_recent_workspace(&mut state, &normalized);

        drop(state);
        self.save_state().await?;

        Ok(normalized)
    }

    pub async fn get_recent_workspaces(&self) -> Vec<String> {
        let state = self.state.read().await;
        state.recent.clone()
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

    fn touch_recent_workspace(&self, state: &mut WorkspacePersistenceState, path: &str) {
        state.recent.retain(|p| p != path);
        state.recent.insert(0, path.to_string());
        state.recent.truncate(10);
    }

    pub async fn get_workspace_defaults_for_normalized(
        &self,
        workspace_path: &str,
    ) -> WorkspaceComposerDefaults {
        let state = self.state.read().await;
        state
            .workspace_defaults
            .get(workspace_path)
            .cloned()
            .unwrap_or_default()
    }

    pub async fn set_workspace_defaults_for_normalized(
        &self,
        workspace_path: &str,
        defaults: WorkspaceComposerDefaults,
    ) -> Result<()> {
        let mut state = self.state.write().await;

        if defaults.is_empty() {
            state.workspace_defaults.remove(workspace_path);
        } else {
            state
                .workspace_defaults
                .insert(workspace_path.to_string(), defaults);
        }

        drop(state);
        self.save_state().await?;

        Ok(())
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
