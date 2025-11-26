use codex_protocol::ConversationId;
use serde::{Deserialize, Serialize};
use tauri::{AppHandle, State};
use ts_rs::TS;
use uuid::Uuid;

use crate::errors::{AppError, AppResult};
use crate::services::TurnService;

/// Parameters accepted when adding a conversation listener.
#[derive(Serialize, Deserialize, Debug, Clone, PartialEq, TS)]
#[serde(rename_all = "camelCase")]
pub struct AddConversationListenerParams {
    pub conversation_id: String,
}

/// Response returned when subscribing to a conversation.
#[derive(Serialize, Deserialize, Debug, Clone, PartialEq, TS)]
#[serde(rename_all = "camelCase")]
pub struct AddConversationSubscriptionResponse {
    pub subscription_id: Uuid,
}

/// Parameters accepted when removing a conversation listener.
#[derive(Serialize, Deserialize, Debug, Clone, PartialEq, TS)]
#[serde(rename_all = "camelCase")]
pub struct RemoveConversationListenerParams {
    pub subscription_id: String,
}

/// Subscribe to conversation events.
#[tauri::command]
pub async fn add_conversation_listener(
    params: AddConversationListenerParams,
    turn_service: State<'_, TurnService>,
    app_handle: AppHandle,
) -> AppResult<AddConversationSubscriptionResponse> {
    let conv_id =
        ConversationId::from_string(&params.conversation_id).map_err(|e| AppError::Validation {
            message: format!("Invalid conversation ID: {}", e),
        })?;

    let fork_id = ConversationId::from(conv_id);
    let subscription_id = turn_service
        .add_subscription(&fork_id, app_handle, params.conversation_id)
        .await?;

    Ok(AddConversationSubscriptionResponse { subscription_id })
}

/// Unsubscribe from conversation events.
#[tauri::command]
pub async fn remove_conversation_listener(
    params: RemoveConversationListenerParams,
    turn_service: State<'_, TurnService>,
) -> AppResult<()> {
    let uuid = Uuid::parse_str(&params.subscription_id).map_err(|e| AppError::Validation {
        message: format!("Invalid subscription ID: {}", e),
    })?;

    turn_service.remove_subscription(uuid).await
}
