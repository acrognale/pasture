use codex_protocol::openai_models::ReasoningEffort;
use codex_protocol::config_types::ReasoningSummary;
use codex_protocol::config_types::SandboxMode;
use codex_protocol::protocol::AskForApproval;
use serde::Deserialize;
use serde::Serialize;
use ts_rs::TS;

use crate::domain::ids::WorkspacePath;

/// Per-workspace settings for model, reasoning, sandbox, and approval defaults.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize, Default, TS)]
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
    #[serde(skip_serializing_if = "Option::is_none")]
    pub web_search_enabled: Option<bool>,
}

impl WorkspaceSettings {
    pub fn is_empty(&self) -> bool {
        self.model.is_none()
            && self.reasoning_effort.is_none()
            && self.reasoning_summary.is_none()
            && self.sandbox.is_none()
            && self.approval.is_none()
            && self.web_search_enabled.is_none()
    }
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct WorkspaceSummary {
    pub path: WorkspacePath,
    pub last_accessed: String,
}
