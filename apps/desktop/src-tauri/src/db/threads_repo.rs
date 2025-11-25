use std::collections::{HashMap, HashSet};

use chrono::Utc;
use sea_orm::ActiveModelTrait;
use sea_orm::ActiveValue::Set;
use sea_orm::ColumnTrait;
use sea_orm::DatabaseConnection;
use sea_orm::EntityTrait;
use sea_orm::QueryFilter;
use sea_orm::QueryOrder;
use sea_orm::TransactionTrait;

use crate::db::{db_err, schema};
use crate::domain::{Fork, ForkId, ForkPoint, Thread, ThreadId, WorkspacePath};
use crate::errors::{AppError, AppResult};

#[derive(Clone)]
pub struct ThreadRepo {
    db: DatabaseConnection,
}

impl ThreadRepo {
    pub fn new(db: DatabaseConnection) -> Self {
        Self { db }
    }

    pub async fn list_for_workspace(&self, workspace: &WorkspacePath) -> AppResult<Vec<Thread>> {
        let threads = schema::threads::Entity::find()
            .filter(schema::threads::Column::WorkspacePath.eq(workspace.as_str()))
            .order_by_desc(schema::threads::Column::UpdatedAt)
            .all(&self.db)
            .await
            .map_err(|e| db_err("Failed to list threads", e))?;

        let mut result = Vec::with_capacity(threads.len());

        for thread in threads {
            let forks = self.load_forks(thread.id.clone()).await?;
            result.push(decode_thread(thread, forks));
        }

        Ok(result)
    }

    pub async fn get(&self, workspace: &WorkspacePath, id: &ThreadId) -> AppResult<Option<Thread>> {
        let thread = schema::threads::Entity::find_by_id(id.as_str().to_string())
            .filter(schema::threads::Column::WorkspacePath.eq(workspace.as_str()))
            .one(&self.db)
            .await
            .map_err(|e| db_err("Failed to load thread", e))?;

        let Some(thread) = thread else {
            return Ok(None);
        };

        let forks = self.load_forks(id.as_str().to_string()).await?;
        Ok(Some(decode_thread(thread, forks)))
    }

    pub async fn save(&self, workspace: &WorkspacePath, thread: &Thread) -> AppResult<()> {
        let txn = self
            .db
            .begin()
            .await
            .map_err(|e| db_err("Failed to begin thread transaction", e))?;

        let existing = schema::threads::Entity::find_by_id(thread.id.as_str().to_string())
            .filter(schema::threads::Column::WorkspacePath.eq(workspace.as_str()))
            .one(&txn)
            .await
            .map_err(|e| db_err("Failed to fetch existing thread for upsert", e))?;

        let mut thread_active = encode_thread(thread, workspace, existing.as_ref());

        if existing.is_some() {
            thread_active
                .update(&txn)
                .await
                .map_err(|e| db_err("Failed to update thread", e))?;
        } else {
            thread_active
                .insert(&txn)
                .await
                .map_err(|e| db_err("Failed to insert thread", e))?;
        }

        let mut existing_forks: HashMap<String, schema::forks::Model> =
            schema::forks::Entity::find()
                .filter(schema::forks::Column::ThreadId.eq(thread.id.as_str()))
                .all(&txn)
                .await
                .map_err(|e| db_err("Failed to load existing forks", e))?
                .into_iter()
                .map(|fork| (fork.id.clone(), fork))
                .collect();

        for fork in &thread.forks {
            let prior = existing_forks.remove(fork.id.as_str());
            let mut active = encode_fork(fork, &thread.id, prior.as_ref());

            if prior.is_some() {
                active
                    .update(&txn)
                    .await
                    .map_err(|e| db_err("Failed to update fork", e))?;
            } else {
                active
                    .insert(&txn)
                    .await
                    .map_err(|e| db_err("Failed to insert fork", e))?;
            }
        }

        if !existing_forks.is_empty() {
            let obsolete_ids: Vec<String> = existing_forks.into_keys().collect();

            schema::turn_snapshots::Entity::delete_many()
                .filter(schema::turn_snapshots::Column::ForkId.is_in(obsolete_ids.clone()))
                .exec(&txn)
                .await
                .map_err(|e| db_err("Failed to delete turn snapshots for removed forks", e))?;

            schema::forks::Entity::delete_many()
                .filter(schema::forks::Column::Id.is_in(obsolete_ids))
                .exec(&txn)
                .await
                .map_err(|e| db_err("Failed to delete removed forks", e))?;
        }

        txn.commit()
            .await
            .map_err(|e| db_err("Failed to commit thread transaction", e))?;

        Ok(())
    }

    pub async fn update_preview_for_fork(
        &self,
        fork_id: &ForkId,
        preview: &str,
    ) -> AppResult<bool> {
        let threads = self.threads_for_fork(fork_id).await?;
        let mut changed = false;
        let timestamp = Utc::now().to_rfc3339();

        for thread in threads {
            let existing = thread.preview.as_deref().unwrap_or("");
            if !existing.is_empty() && existing != "Untitled session" {
                continue;
            }

            let mut active: schema::threads::ActiveModel = thread.into();
            active.preview = Set(Some(preview.to_string()));
            active.updated_at = Set(timestamp.clone());
            active
                .update(&self.db)
                .await
                .map_err(|e| db_err("Failed to update thread preview", e))?;
            changed = true;
        }

        Ok(changed)
    }

    pub async fn has_missing_title_for_fork(&self, fork_id: &ForkId) -> AppResult<bool> {
        let threads = self.threads_for_fork(fork_id).await?;
        Ok(threads.iter().any(|thread| is_missing_title(&thread.title)))
    }

    pub async fn update_title_for_fork(&self, fork_id: &ForkId, title: &str) -> AppResult<bool> {
        let normalized_title = title.trim();
        if normalized_title.is_empty() || normalized_title == "Untitled session" {
            return Ok(false);
        }

        let mut changed = false;
        let timestamp = Utc::now().to_rfc3339();
        let threads = self.threads_for_fork(fork_id).await?;

        for thread in threads {
            if !is_missing_title(&thread.title) {
                continue;
            }

            let mut active: schema::threads::ActiveModel = thread.into();
            active.title = Set(Some(normalized_title.to_string()));
            active.updated_at = Set(timestamp.clone());
            active
                .update(&self.db)
                .await
                .map_err(|e| db_err("Failed to update thread title", e))?;
            changed = true;
        }

        Ok(changed)
    }

    pub async fn list_for_fork(&self, fork_id: &ForkId) -> AppResult<Vec<Thread>> {
        let models = self.threads_for_fork(fork_id).await?;
        let mut threads = Vec::with_capacity(models.len());

        for model in models {
            let forks = self.load_forks(model.id.clone()).await?;
            threads.push(decode_thread(model, forks));
        }

        Ok(threads)
    }

    async fn load_forks(&self, thread_id: String) -> AppResult<Vec<schema::forks::Model>> {
        schema::forks::Entity::find()
            .filter(schema::forks::Column::ThreadId.eq(thread_id))
            .order_by_asc(schema::forks::Column::CreatedAt)
            .all(&self.db)
            .await
            .map_err(|e| db_err("Failed to load thread forks", e))
    }

    async fn threads_for_fork(&self, fork_id: &ForkId) -> AppResult<Vec<schema::threads::Model>> {
        let mut threads = schema::threads::Entity::find()
            .filter(schema::threads::Column::CurrentForkId.eq(fork_id.as_str()))
            .all(&self.db)
            .await
            .map_err(|e| db_err("Failed to find threads for fork", e))?;

        let fork_threads: Vec<String> = schema::forks::Entity::find()
            .filter(schema::forks::Column::Id.eq(fork_id.as_str()))
            .all(&self.db)
            .await
            .map_err(|e| db_err("Failed to find fork links", e))?
            .into_iter()
            .map(|f| f.thread_id)
            .collect();

        let mut seen: HashSet<String> = threads.iter().map(|thread| thread.id.clone()).collect();
        for thread_id in fork_threads {
            if seen.contains(&thread_id) {
                continue;
            }

            if let Some(thread) = schema::threads::Entity::find_by_id(thread_id.clone())
                .one(&self.db)
                .await
                .map_err(|e| db_err("Failed to load thread by fork", e))?
            {
                seen.insert(thread.id.clone());
                threads.push(thread);
            }
        }

        Ok(threads)
    }
}

fn encode_thread(
    thread: &Thread,
    workspace: &WorkspacePath,
    existing: Option<&schema::threads::Model>,
) -> schema::threads::ActiveModel {
    let mut active = match existing {
        Some(model) => {
            let mut active: schema::threads::ActiveModel = model.clone().into();
            active
        }
        None => schema::threads::ActiveModel {
            id: Set(thread.id.as_str().to_string()),
            workspace_path: Set(workspace.as_str().to_string()),
            created_at: Set(thread.created_at.clone()),
            updated_at: Set(thread.updated_at.clone()),
            current_fork_id: Set(thread.current_fork_id.as_str().to_string()),
            title: Set(thread.title.clone()),
            preview: Set(thread.preview.clone()),
        },
    };

    active.workspace_path = Set(workspace.as_str().to_string());
    active.created_at = Set(thread.created_at.clone());
    active.updated_at = Set(thread.updated_at.clone());
    active.current_fork_id = Set(thread.current_fork_id.as_str().to_string());
    active.title = Set(thread.title.clone());
    active.preview = Set(thread.preview.clone());

    active
}

fn encode_fork(
    fork: &Fork,
    thread_id: &ThreadId,
    existing: Option<&schema::forks::Model>,
) -> schema::forks::ActiveModel {
    let (forked_from_fork_id, forked_from_after_message) = fork
        .fork_point
        .as_ref()
        .map(|point| {
            (
                Some(point.fork_id.as_str().to_string()),
                Some(point.after_message as i32),
            )
        })
        .unwrap_or((None, None));

    match existing {
        Some(model) => {
            let mut active: schema::forks::ActiveModel = model.clone().into();
            active.rollout_path = Set(fork.rollout_path.clone());
            active.created_at = Set(fork.created_at.clone());
            active.label = Set(fork.label.clone());
            active.forked_from_fork_id = Set(forked_from_fork_id);
            active.forked_from_after_message = Set(forked_from_after_message);
            active
        }
        None => schema::forks::ActiveModel {
            id: Set(fork.id.as_str().to_string()),
            thread_id: Set(thread_id.as_str().to_string()),
            rollout_path: Set(fork.rollout_path.clone()),
            created_at: Set(fork.created_at.clone()),
            label: Set(fork.label.clone()),
            forked_from_fork_id: Set(forked_from_fork_id),
            forked_from_after_message: Set(forked_from_after_message),
            base_commit: Set(None),
            snapshots_disabled: Set(false),
        },
    }
}

fn decode_thread(thread: schema::threads::Model, forks: Vec<schema::forks::Model>) -> Thread {
    let workspace_path = WorkspacePath(thread.workspace_path);
    let forks = forks
        .into_iter()
        .map(|fork| decode_fork(&thread.id, fork))
        .collect();

    Thread {
        id: ThreadId(thread.id),
        current_fork_id: ForkId(thread.current_fork_id),
        forks,
        title: thread.title,
        preview: thread.preview,
        created_at: thread.created_at,
        updated_at: thread.updated_at,
        workspace_path,
    }
}

fn decode_fork(thread_id: &str, model: schema::forks::Model) -> Fork {
    let fork_point = match (model.forked_from_fork_id, model.forked_from_after_message) {
        (Some(fork_id), Some(after_message)) => Some(ForkPoint {
            fork_id: ForkId(fork_id),
            after_message: after_message as u32,
        }),
        _ => None,
    };

    Fork {
        id: ForkId(model.id),
        thread_id: ThreadId(thread_id.to_string()),
        rollout_path: model.rollout_path,
        created_at: model.created_at,
        label: model.label,
        fork_point,
    }
}

fn is_missing_title(title: &Option<String>) -> bool {
    match title.as_deref() {
        Some(existing) => existing.trim().is_empty() || existing == "Untitled session",
        None => true,
    }
}
