use anyhow::Context;
use anyhow::Result;
use chrono::Utc;
use sea_orm::ActiveModelTrait;
use sea_orm::ActiveValue::Set;
use sea_orm::DatabaseConnection;
use sea_orm::EntityTrait;
use sea_orm::QueryOrder;
use sea_orm::QuerySelect;

use crate::db::schema;
use crate::workspace_manager::WorkspaceComposerDefaults;

pub async fn upsert_workspace(
    db: &DatabaseConnection,
    path: &str,
    last_accessed: Option<String>,
) -> Result<()> {
    let existing = schema::workspaces::Entity::find_by_id(path.to_string())
        .one(db)
        .await
        .context("Failed to fetch workspace for upsert")?;

    let timestamp = last_accessed.unwrap_or_else(|| Utc::now().to_rfc3339());

    if let Some(model) = existing {
        let mut active: schema::workspaces::ActiveModel = model.into();
        active.last_accessed = Set(timestamp);
        active
            .update(db)
            .await
            .context("Failed to update workspace")?;
    } else {
        schema::workspaces::ActiveModel {
            path: Set(path.to_string()),
            last_accessed: Set(timestamp),
        }
        .insert(db)
        .await
        .context("Failed to insert workspace")?;
    }

    Ok(())
}

pub async fn list_recent_workspaces(db: &DatabaseConnection, limit: u64) -> Result<Vec<String>> {
    let items = schema::workspaces::Entity::find()
        .order_by_desc(schema::workspaces::Column::LastAccessed)
        .limit(limit)
        .all(db)
        .await
        .context("Failed to list recent workspaces")?;

    Ok(items.into_iter().map(|w| w.path).collect())
}

pub async fn get_workspace_defaults(
    db: &DatabaseConnection,
    workspace_path: &str,
) -> Result<WorkspaceComposerDefaults> {
    let defaults = schema::workspace_defaults::Entity::find_by_id(workspace_path.to_string())
        .one(db)
        .await
        .context("Failed to load workspace defaults")?
        .and_then(|model| schema::decode_workspace_defaults(model).ok())
        .unwrap_or_default();

    Ok(defaults)
}

pub async fn set_workspace_defaults(
    db: &DatabaseConnection,
    workspace_path: &str,
    defaults: WorkspaceComposerDefaults,
) -> Result<()> {
    if defaults.is_empty() {
        schema::workspace_defaults::Entity::delete_by_id(workspace_path.to_string())
            .exec(db)
            .await
            .context("Failed to delete workspace defaults")?;
        return Ok(());
    }

    upsert_workspace(db, workspace_path, None).await?;

    let active = schema::encode_workspace_defaults(workspace_path, &defaults)?;
    match schema::workspace_defaults::Entity::find_by_id(workspace_path.to_string())
        .one(db)
        .await
        .context("Failed to load workspace defaults for upsert")?
    {
        Some(existing) => {
            let mut model: schema::workspace_defaults::ActiveModel = existing.into();
            model.model = active.model;
            model.reasoning_effort = active.reasoning_effort;
            model.reasoning_summary = active.reasoning_summary;
            model.sandbox = active.sandbox;
            model.approval = active.approval;
            model
                .update(db)
                .await
                .context("Failed to update workspace defaults")?;
        }
        None => {
            active
                .insert(db)
                .await
                .context("Failed to insert workspace defaults")?;
        }
    }

    Ok(())
}
