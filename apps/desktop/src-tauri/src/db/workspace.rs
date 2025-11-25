use chrono::Utc;
use sea_orm::ActiveModelTrait;
use sea_orm::ActiveValue::Set;
use sea_orm::DatabaseConnection;
use sea_orm::DbErr;
use sea_orm::EntityTrait;
use sea_orm::QueryOrder;
use sea_orm::QuerySelect;

use crate::db::schema;
use crate::errors::{AppError, AppResult};
use crate::workspace_manager::WorkspaceComposerDefaults;

pub async fn upsert_workspace(
    db: &DatabaseConnection,
    path: &str,
    last_accessed: Option<String>,
) -> AppResult<()> {
    let existing = schema::workspaces::Entity::find_by_id(path.to_string())
        .one(db)
        .await
        .map_err(|e| db_error("Failed to fetch workspace for upsert", e))?;

    let timestamp = last_accessed.unwrap_or_else(|| Utc::now().to_rfc3339());

    if let Some(model) = existing {
        let mut active: schema::workspaces::ActiveModel = model.into();
        active.last_accessed = Set(timestamp);
        active
            .update(db)
            .await
            .map_err(|e| db_error("Failed to update workspace", e))?;
    } else {
        schema::workspaces::ActiveModel {
            path: Set(path.to_string()),
            last_accessed: Set(timestamp),
        }
        .insert(db)
        .await
        .map_err(|e| db_error("Failed to insert workspace", e))?;
    }

    Ok(())
}

fn db_error(context: &str, err: DbErr) -> AppError {
    AppError::Database(DbErr::Custom(format!("{context}: {err}")))
}

pub async fn list_recent_workspaces(db: &DatabaseConnection, limit: u64) -> AppResult<Vec<String>> {
    let items = schema::workspaces::Entity::find()
        .order_by_desc(schema::workspaces::Column::LastAccessed)
        .limit(limit)
        .all(db)
        .await
        .map_err(|e| db_error("Failed to list recent workspaces", e))?;

    Ok(items.into_iter().map(|w| w.path).collect())
}

pub async fn get_workspace_defaults(
    db: &DatabaseConnection,
    workspace_path: &str,
) -> AppResult<WorkspaceComposerDefaults> {
    let defaults = schema::workspace_settings::Entity::find_by_id(workspace_path.to_string())
        .one(db)
        .await
        .map_err(|e| db_error("Failed to load workspace defaults", e))?
        .and_then(|model| schema::decode_workspace_defaults(model).ok())
        .unwrap_or_default();

    Ok(defaults)
}

pub async fn set_workspace_defaults(
    db: &DatabaseConnection,
    workspace_path: &str,
    defaults: WorkspaceComposerDefaults,
) -> AppResult<()> {
    if defaults.is_empty() {
        schema::workspace_settings::Entity::delete_by_id(workspace_path.to_string())
            .exec(db)
            .await
            .map_err(|e| db_error("Failed to delete workspace defaults", e))?;
        return Ok(());
    }

    upsert_workspace(db, workspace_path, None).await?;

    let active = schema::encode_workspace_defaults(workspace_path, &defaults)?;
    match schema::workspace_settings::Entity::find_by_id(workspace_path.to_string())
        .one(db)
        .await
        .map_err(|e| db_error("Failed to load workspace defaults for upsert", e))?
    {
        Some(existing) => {
            let mut model: schema::workspace_settings::ActiveModel = existing.into();
            model.model = active.model;
            model.reasoning_effort = active.reasoning_effort;
            model.reasoning_summary = active.reasoning_summary;
            model.sandbox = active.sandbox;
            model.approval = active.approval;
            model
                .update(db)
                .await
                .map_err(|e| db_error("Failed to update workspace defaults", e))?;
        }
        None => {
            active
                .insert(db)
                .await
                .map_err(|e| db_error("Failed to insert workspace defaults", e))?;
        }
    }

    Ok(())
}
