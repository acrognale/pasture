use chrono::Utc;
use sea_orm::ActiveModelTrait;
use sea_orm::ActiveValue::Set;
use sea_orm::DatabaseConnection;
use sea_orm::EntityTrait;
use sea_orm::QueryOrder;

use crate::db::{db_err, schema};
use crate::domain::{WorkspacePath, WorkspaceSettings, WorkspaceSummary};
use crate::errors::AppResult;

#[derive(Clone)]
pub struct WorkspaceRepo {
    db: DatabaseConnection,
}

impl WorkspaceRepo {
    pub fn new(db: DatabaseConnection) -> Self {
        Self { db }
    }

    pub async fn touch(
        &self,
        workspace: &WorkspacePath,
        last_accessed: Option<String>,
    ) -> AppResult<()> {
        let existing = schema::workspaces::Entity::find_by_id(workspace.as_str().to_string())
            .one(&self.db)
            .await
            .map_err(|e| db_err("Failed to load workspace", e))?;

        let timestamp = last_accessed.unwrap_or_else(|| Utc::now().to_rfc3339());

        if let Some(model) = existing {
            let mut active: schema::workspaces::ActiveModel = model.into();
            active.last_accessed = Set(timestamp);
            active
                .update(&self.db)
                .await
                .map_err(|e| db_err("Failed to update workspace", e))?;
        } else {
            schema::workspaces::ActiveModel {
                path: Set(workspace.as_str().to_string()),
                last_accessed: Set(timestamp),
            }
            .insert(&self.db)
            .await
            .map_err(|e| db_err("Failed to insert workspace", e))?;
        }

        Ok(())
    }

    pub async fn list_recent(&self, limit: u64) -> AppResult<Vec<WorkspaceSummary>> {
        let items = schema::workspaces::Entity::find()
            .order_by_desc(schema::workspaces::Column::LastAccessed)
            .limit(limit)
            .all(&self.db)
            .await
            .map_err(|e| db_err("Failed to list recent workspaces", e))?;

        Ok(items
            .into_iter()
            .map(|item| WorkspaceSummary {
                path: WorkspacePath(item.path),
                last_accessed: item.last_accessed,
            })
            .collect())
    }
}

#[derive(Clone)]
pub struct WorkspaceSettingsRepo {
    db: DatabaseConnection,
}

impl WorkspaceSettingsRepo {
    pub fn new(db: DatabaseConnection) -> Self {
        Self { db }
    }

    pub async fn get(&self, workspace: &WorkspacePath) -> AppResult<Option<WorkspaceSettings>> {
        let model = schema::workspace_settings::Entity::find_by_id(workspace.as_str().to_string())
            .one(&self.db)
            .await
            .map_err(|e| db_err("Failed to load workspace settings", e))?;

        model
            .map(schema::decode_workspace_settings)
            .transpose()
            .map_err(Into::into)
    }

    pub async fn save(
        &self,
        workspace: &WorkspacePath,
        settings: &WorkspaceSettings,
    ) -> AppResult<()> {
        if settings.is_empty() {
            schema::workspace_settings::Entity::delete_by_id(workspace.as_str().to_string())
                .exec(&self.db)
                .await
                .map_err(|e| db_err("Failed to delete workspace settings", e))?;
            return Ok(());
        }

        let active = schema::encode_workspace_settings(workspace, settings)?;

        match schema::workspace_settings::Entity::find_by_id(workspace.as_str().to_string())
            .one(&self.db)
            .await
            .map_err(|e| db_err("Failed to load workspace settings for upsert", e))?
        {
            Some(existing) => {
                let mut model: schema::workspace_settings::ActiveModel = existing.into();
                model.model = active.model;
                model.reasoning_effort = active.reasoning_effort;
                model.reasoning_summary = active.reasoning_summary;
                model.sandbox = active.sandbox;
                model.approval = active.approval;
                model
                    .update(&self.db)
                    .await
                    .map_err(|e| db_err("Failed to update workspace settings", e))?;
            }
            None => {
                active
                    .insert(&self.db)
                    .await
                    .map_err(|e| db_err("Failed to insert workspace settings", e))?;
            }
        }

        Ok(())
    }
}
