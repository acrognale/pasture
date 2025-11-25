use chrono::Utc;
use sea_orm::ActiveModelTrait;
use sea_orm::ActiveValue::Set;
use sea_orm::ColumnTrait;
use sea_orm::DatabaseConnection;
use sea_orm::DbErr;
use sea_orm::EntityTrait;
use sea_orm::QueryFilter;
use sea_orm::QueryOrder;
use sea_orm::TransactionTrait;
use std::collections::HashSet;

use crate::db::schema;
use crate::db::workspace;
use crate::errors::{AppError, AppResult};
use crate::workspace_manager::ThreadRecord;

pub async fn get_threads_for_workspace(
    db: &DatabaseConnection,
    normalized_path: &str,
) -> AppResult<Vec<ThreadRecord>> {
    let threads = schema::threads::Entity::find()
        .filter(schema::threads::Column::WorkspacePath.eq(normalized_path))
        .order_by_desc(schema::threads::Column::UpdatedAt)
        .all(db)
        .await
        .map_err(|e| db_error("Failed to list threads", e))?;

    let mut result = Vec::with_capacity(threads.len());

    for thread in threads {
        let rollouts = schema::forks::Entity::find()
            .filter(schema::forks::Column::ThreadId.eq(thread.id.clone()))
            .order_by_asc(schema::forks::Column::CreatedAt)
            .all(db)
            .await
            .map_err(|e| db_error("Failed to list thread rollouts", e))?;
        result.push(schema::decode_thread_record(thread, rollouts));
    }

    Ok(result)
}

pub async fn get_thread(
    db: &DatabaseConnection,
    normalized_path: &str,
    thread_id: &str,
) -> AppResult<Option<ThreadRecord>> {
    let thread = schema::threads::Entity::find_by_id(thread_id.to_string())
        .filter(schema::threads::Column::WorkspacePath.eq(normalized_path))
        .one(db)
        .await
        .map_err(|e| db_error("Failed to load thread", e))?;

    let Some(thread) = thread else {
        return Ok(None);
    };

    let rollouts = schema::forks::Entity::find()
        .filter(schema::forks::Column::ThreadId.eq(thread_id))
        .order_by_asc(schema::forks::Column::CreatedAt)
        .all(db)
        .await
        .map_err(|e| db_error("Failed to load thread rollouts", e))?;

    Ok(Some(schema::decode_thread_record(thread, rollouts)))
}

pub async fn upsert_thread(
    db: &DatabaseConnection,
    normalized_path: &str,
    thread: ThreadRecord,
) -> AppResult<()> {
    workspace::upsert_workspace(db, normalized_path, None).await?;

    let txn = db
        .begin()
        .await
        .map_err(|e| db_error("Failed to begin thread upsert transaction", e))?;

    let models = schema::encode_thread_record(&thread, normalized_path);

    match schema::threads::Entity::find_by_id(thread.thread_id.clone())
        .one(&txn)
        .await
        .map_err(|e| db_error("Failed to fetch existing thread for upsert", e))?
    {
        Some(existing) => {
            let mut active: schema::threads::ActiveModel = existing.into();
            active.workspace_path = models.thread.workspace_path;
            active.created_at = models.thread.created_at.clone();
            active.updated_at = models.thread.updated_at.clone();
            active.current_fork_id = models.thread.current_fork_id.clone();
            active.title = models.thread.title.clone();
            active.preview = models.thread.preview.clone();
            active
                .update(&txn)
                .await
                .map_err(|e| db_error("Failed to update thread", e))?;

            schema::forks::Entity::delete_many()
                .filter(schema::forks::Column::ThreadId.eq(thread.thread_id.clone()))
                .exec(&txn)
                .await
                .map_err(|e| db_error("Failed to delete existing rollouts", e))?;
        }
        None => {
            models
                .thread
                .insert(&txn)
                .await
                .map_err(|e| db_error("Failed to insert thread", e))?;
        }
    }

    for fork in models.forks {
        fork.insert(&txn)
            .await
            .map_err(|e| db_error("Failed to insert rollout", e))?;
    }

    txn.commit()
        .await
        .map_err(|e| db_error("Failed to commit thread upsert", e))?;

    Ok(())
}

pub async fn update_thread_preview_for_conversation(
    db: &DatabaseConnection,
    conversation_id: &str,
    preview: &str,
) -> AppResult<bool> {
    let targets = get_threads_for_conversation(db, conversation_id).await?;
    let mut changed = false;
    let timestamp = Utc::now().to_rfc3339();

    for thread in targets {
        let existing = thread.preview.as_deref().unwrap_or("");
        if !existing.is_empty() && existing != "Untitled session" {
            continue;
        }

        let mut active: schema::threads::ActiveModel = thread.into();
        active.preview = Set(Some(preview.to_string()));
        active.updated_at = Set(timestamp.clone());
        active
            .update(db)
            .await
            .map_err(|e| db_error("Failed to update thread preview", e))?;
        changed = true;
    }

    Ok(changed)
}

pub async fn conversation_has_missing_title(
    db: &DatabaseConnection,
    conversation_id: &str,
) -> AppResult<bool> {
    let threads = get_threads_for_conversation(db, conversation_id).await?;
    Ok(threads.iter().any(|thread| is_missing_title(&thread.title)))
}

pub async fn update_thread_title_for_conversation(
    db: &DatabaseConnection,
    conversation_id: &str,
    title: &str,
) -> AppResult<bool> {
    let normalized_title = title.trim();
    if normalized_title.is_empty() || normalized_title == "Untitled session" {
        return Ok(false);
    }

    let mut changed = false;
    let timestamp = Utc::now().to_rfc3339();
    let targets = get_threads_for_conversation(db, conversation_id).await?;

    for thread in targets {
        if !is_missing_title(&thread.title) {
            continue;
        }

        let mut active: schema::threads::ActiveModel = thread.into();
        active.title = Set(Some(normalized_title.to_string()));
        active.updated_at = Set(timestamp.clone());
        active
            .update(db)
            .await
            .map_err(|e| db_error("Failed to update thread title", e))?;
        changed = true;
    }

    Ok(changed)
}

fn db_error(context: &str, err: DbErr) -> AppError {
    AppError::Database(DbErr::Custom(format!("{context}: {err}")))
}

fn is_missing_title(title: &Option<String>) -> bool {
    match title.as_deref() {
        Some(existing) => existing.trim().is_empty() || existing == "Untitled session",
        None => true,
    }
}

pub async fn get_threads_for_conversation(
    db: &DatabaseConnection,
    conversation_id: &str,
) -> AppResult<Vec<schema::threads::Model>> {
    let mut targets = schema::threads::Entity::find()
        .filter(schema::threads::Column::CurrentForkId.eq(conversation_id))
        .all(db)
        .await
        .map_err(|e| db_error("Failed to find threads for conversation", e))?;

    let rollout_threads: Vec<String> = schema::forks::Entity::find()
        .filter(schema::forks::Column::Id.eq(conversation_id))
        .all(db)
        .await
        .map_err(|e| db_error("Failed to find rollouts for conversation", e))?
        .into_iter()
        .map(|r| r.thread_id)
        .collect();

    let mut seen: HashSet<String> = targets.iter().map(|thread| thread.id.clone()).collect();

    for thread_id in rollout_threads {
        if !seen.insert(thread_id.clone()) {
            continue;
        }
        if let Some(thread) = schema::threads::Entity::find_by_id(thread_id.clone())
            .one(db)
            .await
            .map_err(|e| db_error("Failed to find thread by rollout", e))?
        {
            targets.push(thread);
        }
    }

    Ok(targets)
}
