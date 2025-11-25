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
use crate::services::WorkspaceService;
use crate::workspace_manager::WorkspaceComposerDefaults;
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

    let defaults: WorkspaceComposerDefaults = workspace_service
        .get_settings(&workspace_path)
        .await?
        .into();
    let config = config.inner();

    let mut payload = ComposerTurnConfigPayload::default();
    payload.model = defaults.model;
    payload.reasoning_effort = defaults.reasoning_effort;
    payload.summary = defaults
        .reasoning_summary
        .or(Some(config.model_reasoning_summary));
    payload.sandbox = defaults.sandbox;
    payload.approval = defaults.approval;

    Ok(payload)
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

    if model.is_some()
        || reasoning_effort.is_some()
        || summary.is_some()
        || sandbox.is_some()
        || approval.is_some()
    {
        let mut settings: WorkspaceSettings =
            workspace_service.get_settings(&workspace_path).await?;
        let mut changed = false;

        if let Some(value) = model {
            settings.model = Some(value);
            changed = true;
        }
        if let Some(value) = reasoning_effort {
            settings.reasoning_effort = Some(value);
            changed = true;
        }
        if let Some(value) = summary {
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
            workspace_service
                .save_settings(&workspace_path, &settings)
                .await?;
        }
    }

    Ok(())
}
