use std::path::{Path, PathBuf};
use std::sync::Arc;

use anyhow::Error as AnyhowError;
use chrono::Utc;
use codex_git::{CreateGhostCommitOptions, create_ghost_commit};
use serde_json::Value;
use tokio::fs::File;
use tokio::io::{AsyncBufReadExt, BufReader};

use crate::db::{ForkSnapshotState, TurnSnapshot, TurnSnapshotRepo};
use crate::domain::ForkId;
use crate::errors::{AppError, AppResult};

#[derive(Clone)]
pub struct ReviewService {
    repo: TurnSnapshotRepo,
    snapshotter: Arc<GitSnapshotter>,
}

#[derive(Debug, Clone)]
pub struct SnapshotSummary {
    pub disabled: bool,
    pub base_commit: Option<String>,
    pub snapshots: Vec<TurnSnapshot>,
}

impl ReviewService {
    pub fn new(repo: TurnSnapshotRepo, snapshotter: Arc<GitSnapshotter>) -> Self {
        Self { repo, snapshotter }
    }

    pub async fn ensure_base(&self, fork_id: &ForkId) -> AppResult<()> {
        let state = self.fork_state(fork_id).await?;

        if state.snapshots_disabled {
            return Err(AppError::Validation {
                message: format!("Snapshotting disabled for fork {}", fork_id),
            });
        }

        if state.base_commit.is_some() {
            return Ok(());
        }

        let cwd = self.resolve_snapshot_cwd(&state).await;
        let commit = self.capture_snapshot(fork_id, &cwd).await?;
        self.repo.set_base_commit(fork_id, &commit).await?;
        Ok(())
    }

    pub async fn record_turn_snapshot(
        &self,
        fork_id: &ForkId,
        event_id: &str,
    ) -> AppResult<Option<String>> {
        let state = self.fork_state(fork_id).await?;

        if state.snapshots_disabled {
            return Ok(None);
        }

        if state.base_commit.is_none() {
            return Err(AppError::Validation {
                message: format!("Base snapshot unavailable for fork {}", fork_id),
            });
        }

        let cwd = self.resolve_snapshot_cwd(&state).await;
        let commit = self.capture_snapshot(fork_id, &cwd).await?;
        let snapshot = TurnSnapshot {
            event_id: event_id.to_string(),
            commit_sha: commit.clone(),
            created_at: Utc::now().to_rfc3339(),
        };
        self.repo.add_turn_snapshot(fork_id, snapshot).await?;
        Ok(Some(commit))
    }

    pub async fn commits_for_range(
        &self,
        fork_id: &ForkId,
        base_event_id: Option<&str>,
        target_event_id: &str,
    ) -> AppResult<Option<(PathBuf, String, String)>> {
        let state = self.fork_state(fork_id).await?;

        if state.snapshots_disabled {
            return Ok(None);
        }

        let cwd = self.resolve_snapshot_cwd(&state).await;

        let base_commit = match base_event_id {
            Some(event_id) => self
                .repo
                .get_turn_snapshot(fork_id, event_id)
                .await?
                .map(|snapshot| snapshot.commit_sha),
            None => state.base_commit.clone(),
        };

        let Some(base_commit) = base_commit else {
            return Ok(None);
        };

        let target_commit = self
            .repo
            .get_turn_snapshot(fork_id, target_event_id)
            .await?
            .map(|snapshot| snapshot.commit_sha);

        let Some(target_commit) = target_commit else {
            return Ok(None);
        };

        Ok(Some((cwd, base_commit, target_commit)))
    }

    pub async fn snapshot_summary(&self, fork_id: &ForkId) -> AppResult<SnapshotSummary> {
        let state = self
            .repo
            .get_fork_snapshot_state(fork_id)
            .await?
            .ok_or(AppError::NotFound { entity: "fork" })?;
        let snapshots = self.repo.list_for_fork(fork_id).await?;

        Ok(SnapshotSummary {
            disabled: state.snapshots_disabled,
            base_commit: state.base_commit,
            snapshots,
        })
    }

    async fn fork_state(&self, fork_id: &ForkId) -> AppResult<ForkSnapshotState> {
        self.repo
            .get_fork_snapshot_state(fork_id)
            .await?
            .ok_or(AppError::NotFound { entity: "fork" })
    }

    async fn capture_snapshot(&self, fork_id: &ForkId, cwd: &Path) -> AppResult<String> {
        match self.snapshotter.capture(cwd).await {
            Ok(commit) => Ok(commit),
            Err(err) => {
                self.repo.disable_snapshots(fork_id).await?;
                Err(err)
            }
        }
    }

    async fn resolve_snapshot_cwd(&self, state: &ForkSnapshotState) -> PathBuf {
        match load_rollout_cwd(Path::new(&state.rollout_path)).await {
            Ok(path) => path,
            Err(err) => {
                log::debug!(
                    "Falling back to workspace cwd {} for rollout {}: {}",
                    state.workspace_path,
                    state.rollout_path,
                    err
                );
                PathBuf::from(&state.workspace_path)
            }
        }
    }
}

#[derive(Debug, Default)]
pub struct GitSnapshotter;

impl GitSnapshotter {
    pub fn new() -> Self {
        Self
    }

    pub async fn capture(&self, cwd: &Path) -> AppResult<String> {
        let cwd = cwd.to_path_buf();
        let commit = tokio::task::spawn_blocking(move || {
            let options = CreateGhostCommitOptions::new(&cwd);
            create_ghost_commit(&options).map(|commit| commit.id().to_string())
        })
        .await?
        .map_err(|err| AppError::Internal(AnyhowError::new(err)))?;
        Ok(commit)
    }
}

async fn load_rollout_cwd(path: &Path) -> AppResult<PathBuf> {
    let file = File::open(path).await?;
    let mut reader = BufReader::new(file);
    let mut first_line = String::new();
    let bytes_read = reader.read_line(&mut first_line).await?;

    if bytes_read == 0 {
        return Err(AppError::Validation {
            message: format!(
                "Rollout {} did not contain a session header",
                path.display()
            ),
        });
    }

    let value: Value = serde_json::from_str(&first_line).map_err(|e| AppError::Validation {
        message: format!("Failed to parse rollout header: {}", e),
    })?;

    if let Some(cwd_str) = value.get("cwd").and_then(|v| v.as_str()) {
        return Ok(PathBuf::from(cwd_str));
    }

    Err(AppError::Validation {
        message: format!(
            "Rollout {} did not specify a cwd in the session header",
            path.display()
        ),
    })
}
