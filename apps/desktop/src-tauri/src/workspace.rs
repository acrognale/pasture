//! Workspace business logic - standalone functions for workspace operations.

use std::path::Path;

use chrono::Utc;
use codex_core::config::Config;
use codex_protocol::config_types::ReasoningSummary;
use codex_protocol::config_types::SandboxMode;
use codex_protocol::openai_models::ReasoningEffort;
use codex_protocol::protocol::AskForApproval;
use codex_protocol::protocol::SandboxPolicy;
use sea_orm::ActiveModelTrait;
use sea_orm::ActiveValue::Set;
use sea_orm::ColumnTrait;
use sea_orm::DatabaseConnection;
use sea_orm::EntityTrait;
use sea_orm::QueryFilter;
use sea_orm::QueryOrder;
use sea_orm::QuerySelect;

use crate::db::db_err;
use crate::db::schema;
use crate::domain::WorkspacePath;
use crate::domain::WorkspaceSettings;
use crate::domain::WorkspaceSummary;
use crate::errors::AppResult;

// ============================================================
// Queries
// ============================================================

/// List recent workspaces ordered by last accessed time.
pub async fn list_recent(db: &DatabaseConnection, limit: u64) -> AppResult<Vec<WorkspaceSummary>> {
    let items = schema::workspaces::Entity::find()
        .order_by_desc(schema::workspaces::Column::LastAccessed)
        .limit(limit)
        .all(db)
        .await
        .map_err(|e| db_err("list recent workspaces", e))?;

    Ok(items
        .into_iter()
        .map(|item| WorkspaceSummary {
            path: WorkspacePath(item.path),
            last_accessed: item.last_accessed,
        })
        .collect())
}

/// Load workspace settings from the database.
pub async fn load_settings(
    db: &DatabaseConnection,
    path: &WorkspacePath,
) -> AppResult<WorkspaceSettings> {
    let model = schema::workspace_settings::Entity::find()
        .filter(schema::workspace_settings::Column::WorkspacePath.eq(path.as_str()))
        .one(db)
        .await
        .map_err(|e| db_err("load workspace settings", e))?;

    match model {
        Some(m) => schema::decode_workspace_settings(m).map_err(Into::into),
        None => Ok(WorkspaceSettings::default()),
    }
}

/// Get composer defaults for a workspace, applying config defaults where not set.
pub async fn get_composer_defaults(
    db: &DatabaseConnection,
    path: &WorkspacePath,
    config: &Config,
) -> AppResult<WorkspaceSettings> {
    let mut settings = load_settings(db, path).await?;
    if settings.model.is_none() {
        settings.model = config.model.clone();
    }
    if settings.reasoning_effort.is_none() {
        settings.reasoning_effort = config.model_reasoning_effort;
    }
    if settings.reasoning_summary.is_none() {
        settings.reasoning_summary = Some(config.model_reasoning_summary);
    }
    if settings.sandbox.is_none() {
        settings.sandbox = Some(sandbox_policy_to_mode(&config.sandbox_policy));
    }
    if settings.approval.is_none() {
        settings.approval = Some(config.approval_policy.value());
    }
    if settings.web_search_enabled.is_none() {
        settings.web_search_enabled = Some(config.tools_web_search_request);
    }
    Ok(settings)
}

// ============================================================
// Mutations
// ============================================================

/// Touch workspace to update last_accessed timestamp.
pub async fn touch(db: &DatabaseConnection, workspace: &WorkspacePath) -> AppResult<()> {
    touch_with_timestamp(db, workspace, None).await
}

/// Touch workspace with an optional custom timestamp.
pub async fn touch_with_timestamp(
    db: &DatabaseConnection,
    workspace: &WorkspacePath,
    last_accessed: Option<String>,
) -> AppResult<()> {
    let existing = schema::workspaces::Entity::find_by_id(workspace.as_str().to_string())
        .one(db)
        .await
        .map_err(|e| db_err("load workspace", e))?;

    let timestamp = last_accessed.unwrap_or_else(|| Utc::now().to_rfc3339());

    if let Some(model) = existing {
        let mut active: schema::workspaces::ActiveModel = model.into();
        active.last_accessed = Set(timestamp);
        active
            .update(db)
            .await
            .map_err(|e| db_err("update workspace", e))?;
    } else {
        schema::workspaces::ActiveModel {
            path: Set(workspace.as_str().to_string()),
            last_accessed: Set(timestamp),
        }
        .insert(db)
        .await
        .map_err(|e| db_err("insert workspace", e))?;
    }

    Ok(())
}

/// Save workspace settings.
pub async fn save_settings(
    db: &DatabaseConnection,
    workspace: &WorkspacePath,
    settings: &WorkspaceSettings,
) -> AppResult<()> {
    if settings.is_empty() {
        schema::workspace_settings::Entity::delete_by_id(workspace.as_str().to_string())
            .exec(db)
            .await
            .map_err(|e| db_err("delete workspace settings", e))?;
        return Ok(());
    }

    let active = schema::encode_workspace_settings(workspace, settings)?;

    match schema::workspace_settings::Entity::find_by_id(workspace.as_str().to_string())
        .one(db)
        .await
        .map_err(|e| db_err("load workspace settings for upsert", e))?
    {
        Some(existing) => {
            let mut model: schema::workspace_settings::ActiveModel = existing.into();
            model.model = active.model;
            model.reasoning_effort = active.reasoning_effort;
            model.reasoning_summary = active.reasoning_summary;
            model.sandbox = active.sandbox;
            model.approval = active.approval;
            model.web_search_enabled = active.web_search_enabled;
            model
                .update(db)
                .await
                .map_err(|e| db_err("update workspace settings", e))?;
        }
        None => {
            active
                .insert(db)
                .await
                .map_err(|e| db_err("insert workspace settings", e))?;
        }
    }

    Ok(())
}

/// Updates to apply to composer settings.
#[derive(Debug, Default, Clone)]
pub struct ComposerSettingsUpdate {
    pub model: Option<String>,
    pub reasoning_effort: Option<ReasoningEffort>,
    pub reasoning_summary: Option<ReasoningSummary>,
    pub sandbox: Option<SandboxMode>,
    pub approval: Option<AskForApproval>,
    pub web_search_enabled: Option<bool>,
}

/// Update composer defaults for a workspace with partial updates.
pub async fn update_composer_defaults(
    db: &DatabaseConnection,
    workspace: &WorkspacePath,
    updates: ComposerSettingsUpdate,
) -> AppResult<()> {
    let ComposerSettingsUpdate {
        model,
        reasoning_effort,
        reasoning_summary,
        sandbox,
        approval,
        web_search_enabled,
    } = updates;

    if model.is_none()
        && reasoning_effort.is_none()
        && reasoning_summary.is_none()
        && sandbox.is_none()
        && approval.is_none()
        && web_search_enabled.is_none()
    {
        return Ok(());
    }

    let mut settings = load_settings(db, workspace).await?;
    let mut changed = false;

    if let Some(value) = model {
        settings.model = Some(value);
        changed = true;
    }
    if let Some(value) = reasoning_effort {
        settings.reasoning_effort = Some(value);
        changed = true;
    }
    if let Some(value) = reasoning_summary {
        settings.reasoning_summary = Some(value);
        changed = true;
    }
    if let Some(value) = sandbox {
        settings.sandbox = Some(value);
        changed = true;
    }
    if let Some(value) = approval {
        settings.approval = Some(value);
        changed = true;
    }
    if let Some(value) = web_search_enabled {
        settings.web_search_enabled = Some(value);
        changed = true;
    }

    if changed {
        touch(db, workspace).await?;
        save_settings(db, workspace, &settings).await?;
    }

    Ok(())
}

// ============================================================
// Pure Functions
// ============================================================

/// Build a display title from a workspace path.
pub fn build_title(workspace_path: &WorkspacePath) -> String {
    let path = Path::new(workspace_path.as_str());
    path.file_name()
        .and_then(|name| name.to_str())
        .map(|s| s.to_string())
        .unwrap_or_else(|| workspace_path.to_string())
}

fn sandbox_policy_to_mode(policy: &SandboxPolicy) -> SandboxMode {
    match policy {
        SandboxPolicy::ReadOnly => SandboxMode::ReadOnly,
        SandboxPolicy::WorkspaceWrite { .. } => SandboxMode::WorkspaceWrite,
        SandboxPolicy::DangerFullAccess => SandboxMode::DangerFullAccess,
        SandboxPolicy::ExternalSandbox { .. } => SandboxMode::WorkspaceWrite,
    }
}
