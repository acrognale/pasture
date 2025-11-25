use std::path::PathBuf;

use codex_protocol::ConversationId;
use codex_protocol::config_types::{ReasoningEffort, ReasoningSummary, SandboxMode};
use codex_protocol::protocol::{AskForApproval, TurnAbortReason};
use codex_protocol::user_input::UserInput as CoreUserInput;
use serde::{Deserialize, Serialize};
use tauri::{AppHandle, State};
use ts_rs::TS;

use crate::domain::ForkId;
use crate::errors::{AppError, AppResult};
use crate::services::{ThreadService, TurnOverrides, TurnService};

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
    thread_service: State<'_, ThreadService>,
    turn_service: State<'_, TurnService>,
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

    let conv_id =
        ConversationId::from_string(&conversation_id).map_err(|e| AppError::Validation {
            message: format!("Invalid conversation ID: {}", e),
        })?;

    let fork_id = ForkId::from(conv_id.clone());

    let mapped_items: Vec<CoreUserInput> = items
        .into_iter()
        .map(|item| match item {
            InputItem::Text { text } => CoreUserInput::Text { text },
            InputItem::Image { image_url } => CoreUserInput::Image { image_url },
            InputItem::LocalImage { path } => CoreUserInput::LocalImage { path },
        })
        .collect();

    if let Some(preview) = mapped_items
        .iter()
        .find_map(|item| match item {
            CoreUserInput::Text { text } => Some(text.trim()),
            _ => None,
        })
        .filter(|text| !text.is_empty())
    {
        thread_service
            .handle_preview_and_title(&conv_id, &fork_id, preview.to_string(), app_handle.clone())
            .await;
    }

    let overrides = TurnOverrides {
        model,
        reasoning_effort,
        summary,
        sandbox,
        approval_policy,
    };

    turn_service
        .send(
            &fork_id,
            mapped_items,
            overrides,
            &conversation_id,
            app_handle.clone(),
        )
        .await?;

    Ok(())
}

/// Trigger the compact operation for a conversation.
#[tauri::command]
pub async fn compact_conversation(
    params: CompactConversationParams,
    turn_service: State<'_, TurnService>,
    app_handle: AppHandle,
) -> AppResult<()> {
    let conversation_id = params.conversation_id;
    let conv_id =
        ConversationId::from_string(&conversation_id).map_err(|e| AppError::Validation {
            message: format!("Invalid conversation ID: {}", e),
        })?;

    let fork_id = ForkId::from(conv_id.clone());
    turn_service
        .compact(&fork_id, &conversation_id, app_handle)
        .await?;

    Ok(())
}

/// Interrupt an active conversation.
#[tauri::command]
pub async fn interrupt_conversation(
    params: InterruptConversationParams,
    turn_service: State<'_, TurnService>,
) -> AppResult<InterruptConversationResponse> {
    let conv_id =
        ConversationId::from_string(&params.conversation_id).map_err(|e| AppError::Validation {
            message: format!("Invalid conversation ID: {}", e),
        })?;

    let fork_id = ForkId::from(conv_id.clone());
    turn_service.interrupt(&fork_id).await?;

    Ok(InterruptConversationResponse {
        abort_reason: TurnAbortReason::Interrupted,
    })
}
