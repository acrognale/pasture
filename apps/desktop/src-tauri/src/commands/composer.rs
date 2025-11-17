use serde::Deserialize;
use serde::Serialize;
use tauri::State;
use ts_rs::TS;

use codex_protocol::config_types::ReasoningEffort;
use codex_protocol::config_types::ReasoningSummary;
use codex_protocol::config_types::SandboxMode;
use codex_protocol::protocol::AskForApproval;

use crate::codex_runtime::CodexRuntime;
use crate::workspace_manager::WorkspaceManager;

use super::util::CommandResult;

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
    workspace_manager: State<'_, WorkspaceManager>,
    runtime: State<'_, CodexRuntime>,
) -> CommandResult<ComposerTurnConfigPayload> {
    let workspace_path = workspace_manager
        .normalize_workspace_path(&params.workspace_path)
        .map_err(|e| e.to_string())?;

    if !runtime.is_initialized().await {
        return Err("Runtime not initialized".to_string());
    }

    let defaults = workspace_manager
        .get_workspace_defaults_for_normalized(&workspace_path)
        .await;

    let mut payload = ComposerTurnConfigPayload::default();
    payload.model = defaults.model;
    payload.reasoning_effort = defaults.reasoning_effort;
    payload.summary = defaults
        .reasoning_summary
        .or(Some(runtime.config().model_reasoning_summary));
    payload.sandbox = defaults.sandbox;
    payload.approval = defaults.approval;

    Ok(payload)
}

/// Update the composer configuration for a conversation.
#[tauri::command]
pub async fn update_composer_config(
    params: UpdateComposerConfigParams,
    workspace_manager: State<'_, WorkspaceManager>,
    runtime: State<'_, CodexRuntime>,
) -> CommandResult<()> {
    let workspace_path = workspace_manager
        .normalize_workspace_path(&params.workspace_path)
        .map_err(|e| e.to_string())?;

    if !runtime.is_initialized().await {
        return Err("Runtime not initialized".to_string());
    }

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
        let mut defaults = workspace_manager
            .get_workspace_defaults_for_normalized(&workspace_path)
            .await;
        let mut changed = false;

        if let Some(value) = model {
            defaults.model = Some(value);
            changed = true;
        }
        if let Some(value) = reasoning_effort {
            defaults.reasoning_effort = Some(value);
            changed = true;
        }
        if let Some(value) = summary {
            defaults.reasoning_summary = Some(value);
            changed = true;
        }
        if let Some(value) = sandbox {
            defaults.sandbox = Some(value);
            changed = true;
        }
        if let Some(value) = approval {
            defaults.approval = Some(value);
            changed = true;
        }

        if changed {
            workspace_manager
                .set_workspace_defaults_for_normalized(&workspace_path, defaults)
                .await
                .map_err(|e| e.to_string())?;
        }
    }

    Ok(())
}
