use std::path::PathBuf;

use codex_protocol::ConversationId;
use codex_protocol::openai_models::ReasoningEffort;
use codex_protocol::config_types::ReasoningSummary;
use codex_protocol::config_types::SandboxMode;
use codex_protocol::protocol::AskForApproval;
use codex_protocol::protocol::TurnAbortReason;
use codex_protocol::user_input::UserInput as CoreUserInput;
use serde::Deserialize;
use serde::Serialize;
use tauri::AppHandle;
use tauri::State;
use ts_rs::TS;

use crate::context::WorkspaceContext;
use crate::errors::AppError;
use crate::errors::AppResult;
use crate::state::AppState;
use crate::threads;
use crate::turns::TurnOverrides;
use crate::turns::{self};

/// Wire representation of user-provided inputs.
#[derive(Serialize, Deserialize, Debug, Clone, PartialEq, TS)]
#[serde(rename_all = "camelCase")]
#[serde(tag = "type", content = "data")]
pub enum InputItem {
    Text {
        text: String,
    },
    Image {
        image_url: String,
    },
    LocalImage {
        #[ts(type = "string")]
        path: PathBuf,
    },
}

/// Parameters accepted when sending a user message.
#[derive(Serialize, Deserialize, Debug, Clone, PartialEq, TS)]
#[serde(rename_all = "camelCase")]
pub struct SendUserMessageParams {
    pub conversation_id: String,
    pub items: Vec<InputItem>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub model: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub reasoning_effort: Option<ReasoningEffort>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub summary: Option<ReasoningSummary>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub sandbox: Option<SandboxMode>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub approval_policy: Option<AskForApproval>,
}

/// Parameters accepted when compacting a conversation.
#[derive(Serialize, Deserialize, Debug, Clone, PartialEq, TS)]
#[serde(rename_all = "camelCase")]
pub struct CompactConversationParams {
    pub conversation_id: String,
}

/// Parameters accepted when interrupting a conversation.
#[derive(Serialize, Deserialize, Debug, Clone, PartialEq, TS)]
#[serde(rename_all = "camelCase")]
pub struct InterruptConversationParams {
    pub conversation_id: String,
}

/// Response returned when interrupting a conversation.
#[derive(Serialize, Deserialize, Debug, Clone, PartialEq, TS)]
#[serde(rename_all = "camelCase")]
pub struct InterruptConversationResponse {
    pub abort_reason: TurnAbortReason,
}

/// Send a user message to a conversation.
#[tauri::command]
pub async fn send_user_message(
    params: SendUserMessageParams,
    app: State<'_, AppState>,
    app_handle: AppHandle,
) -> AppResult<()> {
    let SendUserMessageParams {
        conversation_id,
        items,
        model,
        reasoning_effort,
        summary,
        sandbox,
        approval_policy,
    } = params;

    let conversation_id =
        ConversationId::from_string(&conversation_id).map_err(|e| AppError::Validation {
            message: format!("Invalid conversation ID: {}", e),
        })?;

    let mapped_items: Vec<CoreUserInput> = items
        .into_iter()
        .map(|item| match item {
            InputItem::Text { text } => CoreUserInput::Text { text },
            InputItem::Image { image_url } => CoreUserInput::Image { image_url },
            InputItem::LocalImage { path } => CoreUserInput::LocalImage { path },
        })
        .collect();

    // Handle preview and title generation if we can find the workspace for this conversation
    if let Some(workspace_path) =
        threads::workspace_path_for_conversation(&app.db, &conversation_id).await?
    {
        if let Some(preview) = mapped_items
            .iter()
            .find_map(|item| match item {
                CoreUserInput::Text { text } => Some(text.trim()),
                _ => None,
            })
            .filter(|text| !text.is_empty())
        {
            let ctx = WorkspaceContext::new(workspace_path, &app);
            threads::handle_preview_and_title(
                &ctx,
                &conversation_id,
                preview.to_string(),
                app_handle.clone(),
            )
            .await;
        }
    }

    let overrides = TurnOverrides {
        model,
        reasoning_effort,
        summary,
        sandbox,
        approval_policy,
    };

    turns::send(
        &app.conversations,
        &app.events,
        &conversation_id,
        mapped_items,
        overrides,
        &conversation_id.to_string(),
        app_handle,
    )
    .await?;

    Ok(())
}

/// Trigger the compact operation for a conversation.
#[tauri::command]
pub async fn compact_conversation(
    params: CompactConversationParams,
    app: State<'_, AppState>,
    app_handle: AppHandle,
) -> AppResult<()> {
    let conversation_id = params.conversation_id;
    let conv_id =
        ConversationId::from_string(&conversation_id).map_err(|e| AppError::Validation {
            message: format!("Invalid conversation ID: {}", e),
        })?;

    turns::compact(
        &app.conversations,
        &app.events,
        &conv_id,
        &conversation_id,
        app_handle,
    )
    .await?;

    Ok(())
}

/// Interrupt an active conversation.
#[tauri::command]
pub async fn interrupt_conversation(
    params: InterruptConversationParams,
    app: State<'_, AppState>,
) -> AppResult<InterruptConversationResponse> {
    let conv_id =
        ConversationId::from_string(&params.conversation_id).map_err(|e| AppError::Validation {
            message: format!("Invalid conversation ID: {}", e),
        })?;

    turns::interrupt(&app.conversations, &conv_id).await?;

    Ok(InterruptConversationResponse {
        abort_reason: TurnAbortReason::Interrupted,
    })
}
