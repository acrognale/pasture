use std::path::Path;

use crate::db::{WorkspaceRepo, WorkspaceSettingsRepo};
use crate::domain::{WorkspacePath, WorkspaceSettings, WorkspaceSummary};
use crate::errors::AppResult;
use crate::workspace_manager::WorkspaceComposerDefaults;
use codex_core::config::Config;

#[derive(Clone)]
pub struct WorkspaceService {
    workspaces: WorkspaceRepo,
    settings: WorkspaceSettingsRepo,
}

#[derive(Debug, Default)]
pub struct ComposerSettingsUpdate {
    pub model: Option<String>,
    pub reasoning_effort: Option<codex_protocol::config_types::ReasoningEffort>,
    pub reasoning_summary: Option<codex_protocol::config_types::ReasoningSummary>,
    pub sandbox: Option<codex_protocol::config_types::SandboxMode>,
    pub approval: Option<codex_protocol::protocol::AskForApproval>,
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

    pub async fn get_composer_defaults(
        &self,
        workspace: &WorkspacePath,
        config: &Config,
    ) -> AppResult<WorkspaceComposerDefaults> {
        let mut defaults: WorkspaceComposerDefaults = self.get_settings(workspace).await?.into();
        if defaults.reasoning_summary.is_none() {
            defaults.reasoning_summary = Some(config.model_reasoning_summary);
        }
        Ok(defaults)
    }

    pub async fn update_composer_defaults(
        &self,
        workspace: &WorkspacePath,
        updates: ComposerSettingsUpdate,
    ) -> AppResult<()> {
        let ComposerSettingsUpdate {
            model,
            reasoning_effort,
            reasoning_summary,
            sandbox,
            approval,
        } = updates;

        if model.is_none()
            && reasoning_effort.is_none()
            && reasoning_summary.is_none()
            && sandbox.is_none()
            && approval.is_none()
        {
            return Ok(());
        }

        let mut settings = self.get_settings(workspace).await?;
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

        if changed {
            self.save_settings(workspace, &settings).await?;
        }

        Ok(())
    }
}
