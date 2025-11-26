use std::sync::Arc;

use serde::Deserialize;
use serde::Serialize;
use tauri::State;
use ts_rs::TS;

use codex_protocol::config_types::ReasoningEffort;
use codex_protocol::config_types::ReasoningSummary;
use codex_protocol::config_types::SandboxMode;
use codex_protocol::protocol::AskForApproval;

use crate::domain::WorkspaceSettings;
use crate::errors::AppResult;
use crate::services::{ComposerSettingsUpdate, WorkspaceService};
use codex_core::config::Config;

/// Serialized composer configuration for a conversation.
#[derive(Serialize, Deserialize, Debug, Clone, PartialEq, Default, TS)]
#[serde(rename_all = "camelCase")]
pub struct ComposerTurnConfigPayload {
    #[serde(skip_serializing_if = "Option::is_none")]
    pub model: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub reasoning_effort: Option<ReasoningEffort>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub summary: Option<ReasoningSummary>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub sandbox: Option<SandboxMode>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub approval: Option<AskForApproval>,
}

/// Parameters accepted when retrieving composer configuration.
#[derive(Serialize, Deserialize, Debug, Clone, PartialEq, TS)]
#[serde(rename_all = "camelCase")]
pub struct GetComposerConfigParams {
    pub workspace_path: String,
    pub conversation_id: String,
}

/// Parameters accepted when updating composer configuration.
#[derive(Serialize, Deserialize, Debug, Clone, PartialEq, TS)]
#[serde(rename_all = "camelCase")]
pub struct UpdateComposerConfigParams {
    pub workspace_path: String,
    pub conversation_id: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub model: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub reasoning_effort: Option<ReasoningEffort>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub summary: Option<ReasoningSummary>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub sandbox: Option<SandboxMode>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub approval: Option<AskForApproval>,
}

/// Retrieve the stored composer configuration for a conversation.
#[tauri::command]
pub async fn get_composer_config(
    params: GetComposerConfigParams,
    workspace_service: State<'_, WorkspaceService>,
    config: State<'_, Arc<Config>>,
) -> AppResult<ComposerTurnConfigPayload> {
    let workspace_path = workspace_service.canonicalize(&params.workspace_path)?;

    let defaults: WorkspaceSettings = workspace_service
        .get_composer_defaults(&workspace_path, config.inner())
        .await?;

    Ok(ComposerTurnConfigPayload {
        model: defaults.model,
        reasoning_effort: defaults.reasoning_effort,
        summary: defaults.reasoning_summary,
        sandbox: defaults.sandbox,
        approval: defaults.approval,
    })
}

/// Update the composer configuration for a conversation.
#[tauri::command]
pub async fn update_composer_config(
    params: UpdateComposerConfigParams,
    workspace_service: State<'_, WorkspaceService>,
) -> AppResult<()> {
    let workspace_path = workspace_service.canonicalize(&params.workspace_path)?;

    let UpdateComposerConfigParams {
        workspace_path: _,
        conversation_id: _,
        model,
        reasoning_effort,
        summary,
        sandbox,
        approval,
    } = params;

    workspace_service
        .update_composer_defaults(
            &workspace_path,
            ComposerSettingsUpdate {
                model,
                reasoning_effort,
                reasoning_summary: summary,
                sandbox,
                approval,
            },
        )
        .await?;

    Ok(())
}
