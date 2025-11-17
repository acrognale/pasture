use std::collections::HashMap;
use std::collections::HashSet;
use std::path::Path;
use std::path::PathBuf;
use std::sync::Arc;

use anyhow::Context;
use anyhow::Result;
use anyhow::anyhow;
use codex_git::CreateGhostCommitOptions;
use codex_git::create_ghost_commit;
use tokio::sync::Mutex;

#[derive(Debug, Clone)]
pub struct ReviewSnapshots {
    inner: Arc<Mutex<ConversationSnapshotState>>,
}

#[derive(Debug)]
struct ConversationSnapshotState {
    cwd: PathBuf,
    base_commit: Option<String>,
    disabled: bool,
    capturing_base: bool,
    inflight_turns: HashSet<String>,
    turn_commits: HashMap<String, String>,
}

impl ConversationSnapshotState {
    fn new(cwd: PathBuf) -> Self {
        Self {
            cwd,
            base_commit: None,
            disabled: false,
            capturing_base: false,
            inflight_turns: HashSet::new(),
            turn_commits: HashMap::new(),
        }
    }
}

#[derive(Debug, Clone)]
pub struct ConversationSnapshotSummary {
    pub disabled: bool,
    pub base_commit: Option<String>,
    pub turn_commits: Vec<(String, String)>,
}

impl ReviewSnapshots {
    pub fn new(cwd: PathBuf) -> Self {
        Self {
            inner: Arc::new(Mutex::new(ConversationSnapshotState::new(cwd))),
        }
    }

    pub async fn update_cwd(&self, cwd: &Path) {
        let mut guard = self.inner.lock().await;
        guard.cwd = cwd.to_path_buf();
    }

    pub async fn ensure_base(&self) -> Result<()> {
        let snapshot_cwd = {
            let mut guard = self.inner.lock().await;

            if guard.disabled {
                return Err(anyhow!("Snapshotting disabled for conversation"));
            }

            if guard.base_commit.is_some() || guard.capturing_base {
                return Ok(());
            }

            guard.capturing_base = true;
            guard.cwd.clone()
        };

        let snapshot_result = Self::create_snapshot(snapshot_cwd).await;

        let mut guard = self.inner.lock().await;
        guard.capturing_base = false;

        match snapshot_result {
            Ok(commit_id) => {
                guard.base_commit.get_or_insert(commit_id);
                Ok(())
            }
            Err(err) => {
                guard.disabled = true;
                Err(err)
            }
        }
    }

    pub async fn record_turn_snapshot(&self, event_id: &str) -> Result<Option<String>> {
        let snapshot_cwd = {
            let mut guard = self.inner.lock().await;

            if guard.disabled {
                return Ok(None);
            }

            if guard.base_commit.is_none() {
                return Err(anyhow!("Base snapshot unavailable for conversation"));
            }

            if !guard.inflight_turns.insert(event_id.to_string()) {
                return Ok(None);
            }

            guard.cwd.clone()
        };

        let snapshot_result = Self::create_snapshot(snapshot_cwd).await;

        let mut guard = self.inner.lock().await;
        guard.inflight_turns.remove(event_id);

        match snapshot_result {
            Ok(commit_id) => {
                guard
                    .turn_commits
                    .insert(event_id.to_string(), commit_id.clone());
                Ok(Some(commit_id))
            }
            Err(err) => {
                guard.disabled = true;
                Err(err)
            }
        }
    }

    pub async fn commits_for_range(
        &self,
        base_event_id: Option<&str>,
        target_event_id: &str,
    ) -> Result<Option<(PathBuf, String, String)>> {
        let guard = self.inner.lock().await;

        if guard.disabled {
            return Ok(None);
        }

        let base_commit = match base_event_id {
            Some(event_id) => guard.turn_commits.get(event_id).cloned(),
            None => guard.base_commit.clone(),
        };
        let target_commit = guard.turn_commits.get(target_event_id).cloned();

        let Some(base_commit) = base_commit else {
            return Ok(None);
        };
        let Some(target_commit) = target_commit else {
            return Ok(None);
        };

        Ok(Some((guard.cwd.clone(), base_commit, target_commit)))
    }

    pub async fn snapshot_summary(&self) -> ConversationSnapshotSummary {
        let guard = self.inner.lock().await;
        let turn_commits = guard
            .turn_commits
            .iter()
            .map(|(event_id, commit)| (event_id.clone(), commit.clone()))
            .collect();

        ConversationSnapshotSummary {
            disabled: guard.disabled,
            base_commit: guard.base_commit.clone(),
            turn_commits,
        }
    }

    async fn create_snapshot(cwd: PathBuf) -> Result<String> {
        tokio::task::spawn_blocking(move || {
            let options = CreateGhostCommitOptions::new(&cwd);
            create_ghost_commit(&options)
                .map(|commit| commit.id().to_string())
                .map_err(|err| anyhow!(err))
        })
        .await
        .context("failed to capture snapshot task")?
    }
}
