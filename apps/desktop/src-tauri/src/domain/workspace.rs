use codex_protocol::config_types::ReasoningEffort;
use codex_protocol::config_types::ReasoningSummary;
use codex_protocol::config_types::SandboxMode;
use codex_protocol::protocol::AskForApproval;
use serde::{Deserialize, Serialize};
use ts_rs::TS;

use crate::domain::ids::WorkspacePath;

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct WorkspaceSettings {
    #[serde(skip_serializing_if = "Option::is_none")]
    pub model: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub reasoning_effort: Option<ReasoningEffort>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub reasoning_summary: Option<ReasoningSummary>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub sandbox: Option<SandboxMode>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub approval: Option<AskForApproval>,
}

impl WorkspaceSettings {
    pub fn is_empty(&self) -> bool {
        self.model.is_none()
            && self.reasoning_effort.is_none()
            && self.reasoning_summary.is_none()
            && self.sandbox.is_none()
            && self.approval.is_none()
    }
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct WorkspaceSummary {
    pub path: WorkspacePath,
    pub last_accessed: String,
}

/// Wire representation of per-workspace composer defaults stored for the renderer.
#[derive(Debug, Clone, Serialize, Deserialize, TS, PartialEq, Default)]
#[serde(rename_all = "camelCase")]
pub struct WorkspaceComposerDefaults {
    #[serde(skip_serializing_if = "Option::is_none")]
    pub model: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub reasoning_effort: Option<ReasoningEffort>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub reasoning_summary: Option<ReasoningSummary>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub sandbox: Option<SandboxMode>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub approval: Option<AskForApproval>,
}

impl From<WorkspaceComposerDefaults> for WorkspaceSettings {
    fn from(value: WorkspaceComposerDefaults) -> Self {
        WorkspaceSettings {
            model: value.model,
            reasoning_effort: value.reasoning_effort,
            reasoning_summary: value.reasoning_summary,
            sandbox: value.sandbox,
            approval: value.approval,
        }
    }
}

impl From<WorkspaceSettings> for WorkspaceComposerDefaults {
    fn from(value: WorkspaceSettings) -> Self {
        WorkspaceComposerDefaults {
            model: value.model,
            reasoning_effort: value.reasoning_effort,
            reasoning_summary: value.reasoning_summary,
            sandbox: value.sandbox,
            approval: value.approval,
        }
    }
}
