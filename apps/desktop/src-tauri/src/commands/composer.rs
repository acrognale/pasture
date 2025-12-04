use codex_protocol::ConversationId;
use codex_protocol::openai_models::ReasoningEffort;
use codex_protocol::config_types::ReasoningSummary;
use codex_protocol::config_types::SandboxMode;
use codex_protocol::protocol::AskForApproval;
use serde::Deserialize;
use serde::Serialize;
use tauri::State;
use ts_rs::TS;

use crate::domain::ThreadId;
use crate::domain::WorkspacePath;
use crate::domain::WorkspaceSettings;
use crate::errors::AppError;
use crate::errors::AppResult;
use crate::state::AppState;
use crate::threads;
use crate::workspace::ComposerSettingsUpdate;
use crate::workspace::{self};

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
    #[serde(skip_serializing_if = "Option::is_none")]
    pub web_search_enabled: Option<bool>,
}

/// Parameters accepted when retrieving composer configuration.
#[derive(Serialize, Deserialize, Debug, Clone, PartialEq, TS)]
#[serde(rename_all = "camelCase")]
pub struct GetComposerConfigParams {
    pub workspace_path: String,
    pub conversation_id: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub thread_id: Option<String>,
}

/// Parameters accepted when updating composer configuration.
#[derive(Serialize, Deserialize, Debug, Clone, PartialEq, TS)]
#[serde(rename_all = "camelCase")]
pub struct UpdateComposerConfigParams {
    pub workspace_path: String,
    pub conversation_id: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub thread_id: Option<String>,
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
    #[serde(skip_serializing_if = "Option::is_none")]
    pub web_search_enabled: Option<bool>,
}

/// Retrieve the stored composer configuration for a conversation.
#[tauri::command]
pub async fn get_composer_config(
    params: GetComposerConfigParams,
    app: State<'_, AppState>,
) -> AppResult<ComposerTurnConfigPayload> {
    let workspace_path = WorkspacePath::canonicalize(&params.workspace_path)?;

    let thread_id = if let Some(raw) = params.thread_id {
        ThreadId(raw)
    } else {
        let conversation_id =
            ConversationId::from_string(&params.conversation_id).map_err(|_| {
                AppError::Validation {
                    message: "Invalid conversation ID".to_string(),
                }
            })?;
        threads::thread_for_conversation(&app.db, &conversation_id)
            .await?
            .ok_or(AppError::NotFound { entity: "thread" })?
    };

    let defaults: WorkspaceSettings = threads::get_thread_composer_config(
        &app.db,
        &workspace_path,
        app.config.as_ref(),
        &thread_id,
    )
    .await?;

    Ok(ComposerTurnConfigPayload {
        model: defaults.model,
        reasoning_effort: defaults.reasoning_effort,
        summary: defaults.reasoning_summary,
        sandbox: defaults.sandbox,
        approval: defaults.approval,
        web_search_enabled: defaults.web_search_enabled,
    })
}

/// Update the composer configuration for a conversation.
#[tauri::command]
pub async fn update_composer_config(
    params: UpdateComposerConfigParams,
    app: State<'_, AppState>,
) -> AppResult<()> {
    let workspace_path = WorkspacePath::canonicalize(&params.workspace_path)?;

    let UpdateComposerConfigParams {
        workspace_path: _,
        conversation_id,
        thread_id,
        model,
        reasoning_effort,
        summary,
        sandbox,
        approval,
        web_search_enabled,
    } = params;

    let thread_id = if let Some(raw) = thread_id {
        ThreadId(raw)
    } else {
        let conversation_id =
            ConversationId::from_string(&conversation_id).map_err(|_| AppError::Validation {
                message: "Invalid conversation ID".to_string(),
            })?;
        threads::thread_for_conversation(&app.db, &conversation_id)
            .await?
            .ok_or(AppError::NotFound { entity: "thread" })?
    };

    let updates = ComposerSettingsUpdate {
        model,
        reasoning_effort,
        reasoning_summary: summary,
        sandbox,
        approval,
        web_search_enabled,
    };

    threads::update_thread_composer_settings(&app.db, &workspace_path, &thread_id, updates.clone())
        .await?;

    workspace::update_composer_defaults(&app.db, &workspace_path, updates).await?;

    Ok(())
}
