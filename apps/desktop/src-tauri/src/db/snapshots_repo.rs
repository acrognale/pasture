use sea_orm::ActiveModelTrait;
use sea_orm::ActiveValue::{NotSet, Set};
use sea_orm::ColumnTrait;
use sea_orm::DatabaseConnection;
use sea_orm::EntityTrait;
use sea_orm::QueryFilter;
use sea_orm::QueryOrder;

use crate::db::{db_err, schema};
use crate::domain::ForkId;
use crate::errors::{AppError, AppResult};

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct TurnSnapshot {
    pub event_id: String,
    pub commit_sha: String,
    pub created_at: String,
}

#[derive(Clone)]
pub struct TurnSnapshotRepo {
    db: DatabaseConnection,
}

impl TurnSnapshotRepo {
    pub fn new(db: DatabaseConnection) -> Self {
        Self { db }
    }

    pub async fn get_base_commit(&self, fork_id: &ForkId) -> AppResult<Option<String>> {
        let fork = schema::forks::Entity::find_by_id(fork_id.as_str().to_string())
            .one(&self.db)
            .await
            .map_err(|e| db_err("Failed to load fork base commit", e))?;

        Ok(fork.and_then(|f| f.base_commit))
    }

    pub async fn set_base_commit(&self, fork_id: &ForkId, commit_sha: &str) -> AppResult<()> {
        let Some(existing) = schema::forks::Entity::find_by_id(fork_id.as_str().to_string())
            .one(&self.db)
            .await
            .map_err(|e| db_err("Failed to load fork for base commit update", e))?
        else {
            return Err(AppError::NotFound { entity: "fork" });
        };

        let mut active: schema::forks::ActiveModel = existing.into();
        active.base_commit = Set(Some(commit_sha.to_string()));
        active
            .update(&self.db)
            .await
            .map_err(|e| db_err("Failed to update base commit", e))?;

        Ok(())
    }

    pub async fn snapshots_disabled(&self, fork_id: &ForkId) -> AppResult<bool> {
        let fork = schema::forks::Entity::find_by_id(fork_id.as_str().to_string())
            .one(&self.db)
            .await
            .map_err(|e| db_err("Failed to load fork snapshot flag", e))?;

        Ok(fork.map(|f| f.snapshots_disabled).unwrap_or(false))
    }

    pub async fn disable_snapshots(&self, fork_id: &ForkId) -> AppResult<()> {
        let Some(existing) = schema::forks::Entity::find_by_id(fork_id.as_str().to_string())
            .one(&self.db)
            .await
            .map_err(|e| db_err("Failed to load fork for snapshot disable", e))?
        else {
            return Err(AppError::NotFound { entity: "fork" });
        };

        let mut active: schema::forks::ActiveModel = existing.into();
        active.snapshots_disabled = Set(true);
        active
            .update(&self.db)
            .await
            .map_err(|e| db_err("Failed to disable snapshots", e))?;

        Ok(())
    }

    pub async fn add_turn_snapshot(
        &self,
        fork_id: &ForkId,
        snapshot: TurnSnapshot,
    ) -> AppResult<()> {
        let existing = schema::turn_snapshots::Entity::find()
            .filter(schema::turn_snapshots::Column::ForkId.eq(fork_id.as_str()))
            .filter(schema::turn_snapshots::Column::EventId.eq(snapshot.event_id.clone()))
            .one(&self.db)
            .await
            .map_err(|e| db_err("Failed to load turn snapshot", e))?;

        let mut active = match existing {
            Some(model) => {
                let mut active: schema::turn_snapshots::ActiveModel = model.into();
                active.commit_sha = Set(snapshot.commit_sha);
                active.created_at = Set(snapshot.created_at);
                active
            }
            None => schema::turn_snapshots::ActiveModel {
                id: NotSet,
                fork_id: Set(fork_id.as_str().to_string()),
                event_id: Set(snapshot.event_id),
                commit_sha: Set(snapshot.commit_sha),
                created_at: Set(snapshot.created_at),
            },
        };

        if existing.is_some() {
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

    pub async fn list_for_fork(&self, fork_id: &ForkId) -> AppResult<Vec<TurnSnapshot>> {
        let items = schema::turn_snapshots::Entity::find()
            .filter(schema::turn_snapshots::Column::ForkId.eq(fork_id.as_str()))
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

    pub async fn delete_for_fork(&self, fork_id: &ForkId) -> AppResult<()> {
        schema::turn_snapshots::Entity::delete_many()
            .filter(schema::turn_snapshots::Column::ForkId.eq(fork_id.as_str()))
            .exec(&self.db)
            .await
            .map_err(|e| db_err("Failed to delete turn snapshots", e))?;

        Ok(())
    }
}
