//! Review business logic - standalone functions for git snapshot operations.

use std::path::{Path, PathBuf};

use anyhow::Error as AnyhowError;
use chrono::Utc;
use codex_git::{CreateGhostCommitOptions, create_ghost_commit};
use codex_protocol::ConversationId;
use sea_orm::{
    ActiveModelTrait, ActiveValue::NotSet, ActiveValue::Set, ColumnTrait, DatabaseConnection,
    EntityTrait, QueryFilter, QueryOrder,
};

use crate::db::{db_err, schema};
use crate::errors::{AppError, AppResult};
use crate::rollout::load_rollout_cwd;

// ============================================================
// Types
// ============================================================

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct TurnSnapshot {
    pub event_id: String,
    pub commit_sha: String,
    pub created_at: String,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct ConversationSnapshotState {
    pub workspace_path: String,
    pub rollout_path: String,
    pub base_commit: Option<String>,
    pub snapshots_disabled: bool,
}

#[derive(Debug, Clone)]
pub struct SnapshotSummary {
    pub disabled: bool,
    pub base_commit: Option<String>,
    pub snapshots: Vec<TurnSnapshot>,
}

// ============================================================
// Operations
// ============================================================

/// Ensure a base snapshot exists for the conversation.
pub async fn ensure_base(
    db: &DatabaseConnection,
    conversation_id: &ConversationId,
) -> AppResult<()> {
    let state = get_conversation_snapshot_state(db, conversation_id).await?;
    let state = state.ok_or(AppError::NotFound {
        entity: "conversation",
    })?;

    if state.snapshots_disabled {
        return Err(AppError::Validation {
            message: format!("Snapshotting disabled for conversation {}", conversation_id),
        });
    }

    if state.base_commit.is_some() {
        return Ok(());
    }

    let cwd = resolve_snapshot_cwd(&state).await;
    let commit = match capture_snapshot(&cwd).await {
        Ok(commit) => commit,
        Err(err) => {
            disable_snapshots(db, conversation_id).await?;
            return Err(err);
        }
    };
    set_base_commit(db, conversation_id, &commit).await?;
    Ok(())
}

/// Record a turn snapshot after an agent turn completes.
pub async fn record_turn_snapshot(
    db: &DatabaseConnection,
    conversation_id: &ConversationId,
    event_id: &str,
) -> AppResult<Option<String>> {
    let state = get_conversation_snapshot_state(db, conversation_id).await?;
    let state = state.ok_or(AppError::NotFound {
        entity: "conversation",
    })?;

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

    let cwd = resolve_snapshot_cwd(&state).await;
    let commit = match capture_snapshot(&cwd).await {
        Ok(commit) => commit,
        Err(err) => {
            disable_snapshots(db, conversation_id).await?;
            return Err(err);
        }
    };

    let snapshot = TurnSnapshot {
        event_id: event_id.to_string(),
        commit_sha: commit.clone(),
        created_at: Utc::now().to_rfc3339(),
    };
    add_turn_snapshot(db, conversation_id, snapshot).await?;
    Ok(Some(commit))
}

/// Get commits for a diff range.
pub async fn commits_for_range(
    db: &DatabaseConnection,
    conversation_id: &ConversationId,
    base_event_id: Option<&str>,
    target_event_id: &str,
) -> AppResult<Option<(PathBuf, String, String)>> {
    let state = get_conversation_snapshot_state(db, conversation_id).await?;
    let state = state.ok_or(AppError::NotFound {
        entity: "conversation",
    })?;

    if state.snapshots_disabled {
        return Ok(None);
    }

    let cwd = resolve_snapshot_cwd(&state).await;

    let base_commit = match base_event_id {
        Some(event_id) => get_turn_snapshot(db, conversation_id, event_id)
            .await?
            .map(|snapshot| snapshot.commit_sha),
        None => state.base_commit.clone(),
    };

    let Some(base_commit) = base_commit else {
        return Ok(None);
    };

    let target_commit = get_turn_snapshot(db, conversation_id, target_event_id)
        .await?
        .map(|snapshot| snapshot.commit_sha);

    let Some(target_commit) = target_commit else {
        return Ok(None);
    };

    Ok(Some((cwd, base_commit, target_commit)))
}

/// Get a summary of snapshots for a conversation.
pub async fn snapshot_summary(
    db: &DatabaseConnection,
    conversation_id: &ConversationId,
) -> AppResult<SnapshotSummary> {
    let state = get_conversation_snapshot_state(db, conversation_id).await?;
    let state = state.ok_or(AppError::NotFound {
        entity: "conversation",
    })?;

    let snapshots = list_snapshots_for_conversation(db, conversation_id).await?;

    Ok(SnapshotSummary {
        disabled: state.snapshots_disabled,
        base_commit: state.base_commit,
        snapshots,
    })
}

// ============================================================
// Database Operations
// ============================================================

async fn get_conversation_snapshot_state(
    db: &DatabaseConnection,
    conversation_id: &ConversationId,
) -> AppResult<Option<ConversationSnapshotState>> {
    let conversation = schema::conversations::Entity::find_by_id(conversation_id.to_string())
        .one(db)
        .await
        .map_err(|e| db_err("load conversation snapshot state", e))?;

    let Some(conversation) = conversation else {
        return Ok(None);
    };

    let thread = schema::threads::Entity::find_by_id(conversation.thread_id.clone())
        .one(db)
        .await
        .map_err(|e| db_err("load conversation thread", e))?
        .ok_or(AppError::NotFound { entity: "thread" })?;

    Ok(Some(ConversationSnapshotState {
        workspace_path: thread.workspace_path,
        rollout_path: conversation.rollout_path,
        base_commit: conversation.base_commit,
        snapshots_disabled: conversation.snapshots_disabled,
    }))
}

async fn set_base_commit(
    db: &DatabaseConnection,
    conversation_id: &ConversationId,
    commit_sha: &str,
) -> AppResult<()> {
    let existing = schema::conversations::Entity::find_by_id(conversation_id.to_string())
        .one(db)
        .await
        .map_err(|e| db_err("load conversation for base commit update", e))?
        .ok_or(AppError::NotFound {
            entity: "conversation",
        })?;

    let mut active: schema::conversations::ActiveModel = existing.into();
    active.base_commit = Set(Some(commit_sha.to_string()));
    active
        .update(db)
        .await
        .map_err(|e| db_err("update base commit", e))?;

    Ok(())
}

async fn disable_snapshots(
    db: &DatabaseConnection,
    conversation_id: &ConversationId,
) -> AppResult<()> {
    let existing = schema::conversations::Entity::find_by_id(conversation_id.to_string())
        .one(db)
        .await
        .map_err(|e| db_err("load conversation for snapshot disable", e))?
        .ok_or(AppError::NotFound {
            entity: "conversation",
        })?;

    let mut active: schema::conversations::ActiveModel = existing.into();
    active.snapshots_disabled = Set(true);
    active
        .update(db)
        .await
        .map_err(|e| db_err("disable snapshots", e))?;

    Ok(())
}

async fn get_turn_snapshot(
    db: &DatabaseConnection,
    conversation_id: &ConversationId,
    event_id: &str,
) -> AppResult<Option<TurnSnapshot>> {
    let item = schema::turn_snapshots::Entity::find()
        .filter(schema::turn_snapshots::Column::ConversationId.eq(conversation_id.to_string()))
        .filter(schema::turn_snapshots::Column::EventId.eq(event_id))
        .one(db)
        .await
        .map_err(|e| db_err("load turn snapshot", e))?;

    Ok(item.map(|model| TurnSnapshot {
        event_id: model.event_id,
        commit_sha: model.commit_sha,
        created_at: model.created_at,
    }))
}

async fn add_turn_snapshot(
    db: &DatabaseConnection,
    conversation_id: &ConversationId,
    snapshot: TurnSnapshot,
) -> AppResult<()> {
    let existing = schema::turn_snapshots::Entity::find()
        .filter(schema::turn_snapshots::Column::ConversationId.eq(conversation_id.to_string()))
        .filter(schema::turn_snapshots::Column::EventId.eq(snapshot.event_id.clone()))
        .one(db)
        .await
        .map_err(|e| db_err("load turn snapshot", e))?;

    let should_update = existing.is_some();
    let active = match existing {
        Some(model) => {
            let mut active: schema::turn_snapshots::ActiveModel = model.into();
            active.commit_sha = Set(snapshot.commit_sha);
            active.created_at = Set(snapshot.created_at);
            active
        }
        None => schema::turn_snapshots::ActiveModel {
            id: NotSet,
            conversation_id: Set(conversation_id.to_string()),
            event_id: Set(snapshot.event_id),
            commit_sha: Set(snapshot.commit_sha),
            created_at: Set(snapshot.created_at),
        },
    };

    if should_update {
        active
            .update(db)
            .await
            .map_err(|e| db_err("update turn snapshot", e))?;
    } else {
        active
            .insert(db)
            .await
            .map_err(|e| db_err("insert turn snapshot", e))?;
    }

    Ok(())
}

async fn list_snapshots_for_conversation(
    db: &DatabaseConnection,
    conversation_id: &ConversationId,
) -> AppResult<Vec<TurnSnapshot>> {
    let items = schema::turn_snapshots::Entity::find()
        .filter(schema::turn_snapshots::Column::ConversationId.eq(conversation_id.to_string()))
        .order_by_asc(schema::turn_snapshots::Column::CreatedAt)
        .all(db)
        .await
        .map_err(|e| db_err("list turn snapshots", e))?;

    Ok(items
        .into_iter()
        .map(|item| TurnSnapshot {
            event_id: item.event_id,
            commit_sha: item.commit_sha,
            created_at: item.created_at,
        })
        .collect())
}

// ============================================================
// Helper Functions
// ============================================================

async fn resolve_snapshot_cwd(state: &ConversationSnapshotState) -> PathBuf {
    load_rollout_cwd(
        Path::new(&state.rollout_path),
        Some(Path::new(&state.workspace_path)),
    )
    .await
    .unwrap_or_else(|_| PathBuf::from(&state.workspace_path))
}

async fn capture_snapshot(cwd: &Path) -> AppResult<String> {
    let cwd = cwd.to_path_buf();
    let commit = tokio::task::spawn_blocking(move || {
        let options = CreateGhostCommitOptions::new(&cwd);
        create_ghost_commit(&options).map(|commit| commit.id().to_string())
    })
    .await?
    .map_err(|err| AppError::Internal(AnyhowError::new(err)))?;
    Ok(commit)
}
