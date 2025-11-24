use anyhow::Context;
use anyhow::Result;
use chrono::Utc;
use sea_orm::ActiveModelTrait;
use sea_orm::ActiveValue::Set;
use sea_orm::ColumnTrait;
use sea_orm::DatabaseConnection;
use sea_orm::EntityTrait;
use sea_orm::QueryFilter;
use sea_orm::QueryOrder;
use sea_orm::TransactionTrait;

use crate::db::schema;
use crate::db::workspace;
use crate::workspace_manager::ThreadRecord;

pub async fn get_threads_for_workspace(
    db: &DatabaseConnection,
    normalized_path: &str,
) -> Result<Vec<ThreadRecord>> {
    let threads = schema::threads::Entity::find()
        .filter(schema::threads::Column::WorkspacePath.eq(normalized_path))
        .order_by_desc(schema::threads::Column::UpdatedAt)
        .all(db)
        .await
        .context("Failed to list threads")?;

    let mut result = Vec::with_capacity(threads.len());

    for thread in threads {
        let rollouts = schema::thread_rollouts::Entity::find()
            .filter(schema::thread_rollouts::Column::ThreadId.eq(thread.id.clone()))
            .order_by_asc(schema::thread_rollouts::Column::Id)
            .all(db)
            .await
            .context("Failed to list thread rollouts")?;
        result.push(schema::decode_thread_record(thread, rollouts));
    }

    Ok(result)
}

pub async fn get_thread(
    db: &DatabaseConnection,
    normalized_path: &str,
    thread_id: &str,
) -> Result<Option<ThreadRecord>> {
    let thread = schema::threads::Entity::find_by_id(thread_id.to_string())
        .filter(schema::threads::Column::WorkspacePath.eq(normalized_path))
        .one(db)
        .await
        .context("Failed to load thread")?;

    let Some(thread) = thread else {
        return Ok(None);
    };

    let rollouts = schema::thread_rollouts::Entity::find()
        .filter(schema::thread_rollouts::Column::ThreadId.eq(thread_id))
        .order_by_asc(schema::thread_rollouts::Column::Id)
        .all(db)
        .await
        .context("Failed to load thread rollouts")?;

    Ok(Some(schema::decode_thread_record(thread, rollouts)))
}

pub async fn upsert_thread(
    db: &DatabaseConnection,
    normalized_path: &str,
    thread: ThreadRecord,
) -> Result<()> {
    workspace::upsert_workspace(db, normalized_path, None).await?;

    let txn = db
        .begin()
        .await
        .context("Failed to begin thread upsert transaction")?;

    let models = schema::encode_thread_record(&thread, normalized_path);

    match schema::threads::Entity::find_by_id(thread.thread_id.clone())
        .one(&txn)
        .await
        .context("Failed to fetch existing thread for upsert")?
    {
        Some(existing) => {
            let mut active: schema::threads::ActiveModel = existing.into();
            active.workspace_path = models.thread.workspace_path;
            active.created_at = models.thread.created_at.clone();
            active.updated_at = models.thread.updated_at.clone();
            active.current_conversation_id = models.thread.current_conversation_id.clone();
            active.title = models.thread.title.clone();
            active.preview = models.thread.preview.clone();
            active
                .update(&txn)
                .await
                .context("Failed to update thread")?;

            schema::thread_rollouts::Entity::delete_many()
                .filter(schema::thread_rollouts::Column::ThreadId.eq(thread.thread_id.clone()))
                .exec(&txn)
                .await
                .context("Failed to delete existing rollouts")?;
        }
        None => {
            models
                .thread
                .insert(&txn)
                .await
                .context("Failed to insert thread")?;
        }
    }

    for rollout in models.rollouts {
        rollout
            .insert(&txn)
            .await
            .context("Failed to insert rollout")?;
    }

    txn.commit()
        .await
        .context("Failed to commit thread upsert")?;

    Ok(())
}

pub async fn update_thread_preview_for_conversation(
    db: &DatabaseConnection,
    conversation_id: &str,
    preview: &str,
) -> Result<bool> {
    let mut changed = false;
    let timestamp = Utc::now().to_rfc3339();

    let mut targets = schema::threads::Entity::find()
        .filter(schema::threads::Column::CurrentConversationId.eq(conversation_id))
        .all(db)
        .await
        .context("Failed to find threads for preview update")?;

    let rollout_threads: Vec<String> = schema::thread_rollouts::Entity::find()
        .filter(schema::thread_rollouts::Column::ConversationId.eq(conversation_id))
        .all(db)
        .await
        .context("Failed to find rollouts for preview update")?
        .into_iter()
        .map(|r| r.thread_id)
        .collect();

    let mut seen = std::collections::HashSet::new();

    for thread_id in rollout_threads {
        if seen.contains(&thread_id) {
            continue;
        }
        if let Some(thread) = schema::threads::Entity::find_by_id(thread_id.clone())
            .one(db)
            .await
            .ok()
            .flatten()
        {
            targets.push(thread);
            seen.insert(thread_id);
        }
    }

    for thread in targets {
        let existing = thread.preview.as_deref().unwrap_or("");
        if !existing.is_empty() && existing != "Untitled session" {
            continue;
        }

        let mut active: schema::threads::ActiveModel = thread.into();
        active.preview = Set(Some(preview.to_string()));
        active.title = Set(Some(preview.to_string()));
        active.updated_at = Set(timestamp.clone());
        active
            .update(db)
            .await
            .context("Failed to update thread preview")?;
        changed = true;
    }

    Ok(changed)
}
