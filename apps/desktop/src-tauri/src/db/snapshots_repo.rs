use codex_protocol::ConversationId;
use sea_orm::ActiveModelTrait;
use sea_orm::ActiveValue::{NotSet, Set};
use sea_orm::ColumnTrait;
use sea_orm::DatabaseConnection;
use sea_orm::EntityTrait;
use sea_orm::QueryFilter;
use sea_orm::QueryOrder;

use crate::db::{db_err, schema};
use crate::errors::{AppError, AppResult};

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

#[derive(Clone)]
pub struct TurnSnapshotRepo {
    db: DatabaseConnection,
}

impl TurnSnapshotRepo {
    pub fn new(db: DatabaseConnection) -> Self {
        Self { db }
    }

    pub async fn get_conversation_snapshot_state(
        &self,
        conversation_id: &ConversationId,
    ) -> AppResult<Option<ConversationSnapshotState>> {
        let conversation = schema::conversations::Entity::find_by_id(conversation_id.to_string())
            .one(&self.db)
            .await
            .map_err(|e| db_err("Failed to load conversation snapshot state", e))?;

        let Some(conversation) = conversation else {
            return Ok(None);
        };

        let thread = schema::threads::Entity::find_by_id(conversation.thread_id.clone())
            .one(&self.db)
            .await
            .map_err(|e| db_err("Failed to load conversation thread", e))?
            .ok_or(AppError::NotFound { entity: "thread" })?;

        Ok(Some(ConversationSnapshotState {
            workspace_path: thread.workspace_path,
            rollout_path: conversation.rollout_path,
            base_commit: conversation.base_commit,
            snapshots_disabled: conversation.snapshots_disabled,
        }))
    }

    pub async fn set_base_commit(
        &self,
        conversation_id: &ConversationId,
        commit_sha: &str,
    ) -> AppResult<()> {
        let Some(existing) = schema::conversations::Entity::find_by_id(conversation_id.to_string())
            .one(&self.db)
            .await
            .map_err(|e| db_err("Failed to load conversation for base commit update", e))?
        else {
            return Err(AppError::NotFound {
                entity: "conversation",
            });
        };

        let mut active: schema::conversations::ActiveModel = existing.into();
        active.base_commit = Set(Some(commit_sha.to_string()));
        active
            .update(&self.db)
            .await
            .map_err(|e| db_err("Failed to update base commit", e))?;

        Ok(())
    }

    pub async fn disable_snapshots(&self, conversation_id: &ConversationId) -> AppResult<()> {
        let Some(existing) = schema::conversations::Entity::find_by_id(conversation_id.to_string())
            .one(&self.db)
            .await
            .map_err(|e| db_err("Failed to load conversation for snapshot disable", e))?
        else {
            return Err(AppError::NotFound {
                entity: "conversation",
            });
        };

        let mut active: schema::conversations::ActiveModel = existing.into();
        active.snapshots_disabled = Set(true);
        active
            .update(&self.db)
            .await
            .map_err(|e| db_err("Failed to disable snapshots", e))?;

        Ok(())
    }

    pub async fn get_turn_snapshot(
        &self,
        conversation_id: &ConversationId,
        event_id: &str,
    ) -> AppResult<Option<TurnSnapshot>> {
        let item = schema::turn_snapshots::Entity::find()
            .filter(schema::turn_snapshots::Column::ConversationId.eq(conversation_id.to_string()))
            .filter(schema::turn_snapshots::Column::EventId.eq(event_id))
            .one(&self.db)
            .await
            .map_err(|e| db_err("Failed to load turn snapshot", e))?;

        Ok(item.map(|model| TurnSnapshot {
            event_id: model.event_id,
            commit_sha: model.commit_sha,
            created_at: model.created_at,
        }))
    }

    pub async fn add_turn_snapshot(
        &self,
        conversation_id: &ConversationId,
        snapshot: TurnSnapshot,
    ) -> AppResult<()> {
        let existing = schema::turn_snapshots::Entity::find()
            .filter(schema::turn_snapshots::Column::ConversationId.eq(conversation_id.to_string()))
            .filter(schema::turn_snapshots::Column::EventId.eq(snapshot.event_id.clone()))
            .one(&self.db)
            .await
            .map_err(|e| db_err("Failed to load turn snapshot", e))?;

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
                .update(&self.db)
                .await
                .map_err(|e| db_err("Failed to update turn snapshot", e))?;
        } else {
            active
                .insert(&self.db)
                .await
                .map_err(|e| db_err("Failed to insert turn snapshot", e))?;
        }

        Ok(())
    }

    pub async fn list_for_conversation(
        &self,
        conversation_id: &ConversationId,
    ) -> AppResult<Vec<TurnSnapshot>> {
        let items = schema::turn_snapshots::Entity::find()
            .filter(schema::turn_snapshots::Column::ConversationId.eq(conversation_id.to_string()))
            .order_by_asc(schema::turn_snapshots::Column::CreatedAt)
            .all(&self.db)
            .await
            .map_err(|e| db_err("Failed to list turn snapshots", e))?;

        Ok(items
            .into_iter()
            .map(|item| TurnSnapshot {
                event_id: item.event_id,
                commit_sha: item.commit_sha,
                created_at: item.created_at,
            })
            .collect())
    }
}
