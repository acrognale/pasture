use std::path::Path;

use crate::db::{WorkspaceRepo, WorkspaceSettingsRepo};
use crate::domain::{WorkspacePath, WorkspaceSettings, WorkspaceSummary};
use crate::errors::AppResult;

#[derive(Clone)]
pub struct WorkspaceService {
    workspaces: WorkspaceRepo,
    settings: WorkspaceSettingsRepo,
}

impl WorkspaceService {
    pub fn new(workspaces: WorkspaceRepo, settings: WorkspaceSettingsRepo) -> Self {
        Self {
            workspaces,
            settings,
        }
    }

    pub fn canonicalize(&self, raw: &str) -> AppResult<WorkspacePath> {
        WorkspacePath::canonicalize(raw)
    }

    pub async fn record_access(&self, workspace: &WorkspacePath) -> AppResult<()> {
        self.workspaces.touch(workspace, None).await
    }

    pub async fn list_recent(&self, limit: u64) -> AppResult<Vec<WorkspaceSummary>> {
        self.workspaces.list_recent(limit).await
    }

    pub fn build_title(&self, workspace_path: &WorkspacePath) -> String {
        let path = Path::new(workspace_path.as_str());
        path.file_name()
            .and_then(|name| name.to_str())
            .map(|s| s.to_string())
            .unwrap_or_else(|| workspace_path.to_string())
    }

    pub async fn get_settings(&self, workspace: &WorkspacePath) -> AppResult<WorkspaceSettings> {
        Ok(self.settings.get(workspace).await?.unwrap_or_default())
    }

    pub async fn save_settings(
        &self,
        workspace: &WorkspacePath,
        settings: &WorkspaceSettings,
    ) -> AppResult<()> {
        self.workspaces.touch(workspace, None).await?;
        self.settings.save(workspace, settings).await
    }
}
