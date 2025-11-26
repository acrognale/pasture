use std::path::{Path, PathBuf};
use std::sync::Arc;

use anyhow::Error as AnyhowError;
use chrono::Utc;
use codex_git::{CreateGhostCommitOptions, create_ghost_commit};
use codex_protocol::ConversationId;

use crate::db::{ConversationSnapshotState, TurnSnapshot, TurnSnapshotRepo};
use crate::errors::{AppError, AppResult};
use crate::services::load_rollout_cwd;

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

    pub async fn ensure_base(&self, conversation_id: &ConversationId) -> AppResult<()> {
        let state = self.conversation_state(conversation_id).await?;

        if state.snapshots_disabled {
            return Err(AppError::Validation {
                message: format!("Snapshotting disabled for conversation {}", conversation_id),
            });
        }

        if state.base_commit.is_some() {
            return Ok(());
        }

        let cwd = self.resolve_snapshot_cwd(&state).await;
        let commit = self.capture_snapshot(conversation_id, &cwd).await?;
        self.repo.set_base_commit(conversation_id, &commit).await?;
        Ok(())
    }

    pub async fn record_turn_snapshot(
        &self,
        conversation_id: &ConversationId,
        event_id: &str,
    ) -> AppResult<Option<String>> {
        let state = self.conversation_state(conversation_id).await?;

        if state.snapshots_disabled {
            return Ok(None);
        }

        if state.base_commit.is_none() {
            return Err(AppError::Validation {
                message: format!(
                    "Base snapshot unavailable for conversation {}",
                    conversation_id
                ),
            });
        }

        let cwd = self.resolve_snapshot_cwd(&state).await;
        let commit = self.capture_snapshot(conversation_id, &cwd).await?;
        let snapshot = TurnSnapshot {
            event_id: event_id.to_string(),
            commit_sha: commit.clone(),
            created_at: Utc::now().to_rfc3339(),
        };
        self.repo
            .add_turn_snapshot(conversation_id, snapshot)
            .await?;
        Ok(Some(commit))
    }

    pub async fn commits_for_range(
        &self,
        conversation_id: &ConversationId,
        base_event_id: Option<&str>,
        target_event_id: &str,
    ) -> AppResult<Option<(PathBuf, String, String)>> {
        let state = self.conversation_state(conversation_id).await?;

        if state.snapshots_disabled {
            return Ok(None);
        }

        let cwd = self.resolve_snapshot_cwd(&state).await;

        let base_commit = match base_event_id {
            Some(event_id) => self
                .repo
                .get_turn_snapshot(conversation_id, event_id)
                .await?
                .map(|snapshot| snapshot.commit_sha),
            None => state.base_commit.clone(),
        };

        let Some(base_commit) = base_commit else {
            return Ok(None);
        };

        let target_commit = self
            .repo
            .get_turn_snapshot(conversation_id, target_event_id)
            .await?
            .map(|snapshot| snapshot.commit_sha);

        let Some(target_commit) = target_commit else {
            return Ok(None);
        };

        Ok(Some((cwd, base_commit, target_commit)))
    }

    pub async fn snapshot_summary(
        &self,
        conversation_id: &ConversationId,
    ) -> AppResult<SnapshotSummary> {
        let state = self
            .repo
            .get_conversation_snapshot_state(conversation_id)
            .await?
            .ok_or(AppError::NotFound {
                entity: "conversation",
            })?;
        let snapshots = self.repo.list_for_conversation(conversation_id).await?;

        Ok(SnapshotSummary {
            disabled: state.snapshots_disabled,
            base_commit: state.base_commit,
            snapshots,
        })
    }

    async fn conversation_state(
        &self,
        conversation_id: &ConversationId,
    ) -> AppResult<ConversationSnapshotState> {
        self.repo
            .get_conversation_snapshot_state(conversation_id)
            .await?
            .ok_or(AppError::NotFound {
                entity: "conversation",
            })
    }

    async fn capture_snapshot(
        &self,
        conversation_id: &ConversationId,
        cwd: &Path,
    ) -> AppResult<String> {
        match self.snapshotter.capture(cwd).await {
            Ok(commit) => Ok(commit),
            Err(err) => {
                self.repo.disable_snapshots(conversation_id).await?;
                Err(err)
            }
        }
    }

    async fn resolve_snapshot_cwd(&self, state: &ConversationSnapshotState) -> PathBuf {
        load_rollout_cwd(
            Path::new(&state.rollout_path),
            Some(Path::new(&state.workspace_path)),
        )
        .await
        .unwrap_or_else(|_| PathBuf::from(&state.workspace_path))
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
