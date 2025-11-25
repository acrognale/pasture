use serde::Deserialize;
use serde::Serialize;
use ts_rs::TS;

use codex_protocol::protocol::EventMsg;

use crate::commands::auth::AuthState;

/// Payload emitted over the shared codex event channel.
#[derive(Serialize, Deserialize, Debug, Clone, TS)]
#[serde(rename_all = "camelCase")]
pub struct ConversationEventPayload {
    pub conversation_id: String,
    pub turn_id: String,
    pub event_id: String,
    pub event: EventMsg,
    pub timestamp: String,
}

#[derive(Serialize, Deserialize, Debug, Clone, TS)]
#[serde(rename_all = "camelCase")]
pub struct ThreadMetadataPayload {
    pub thread_id: String,
    pub conversation_id: String,
    pub workspace_path: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub title: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub preview: Option<String>,
    pub timestamp: String,
}

/// Union of events emitted to the renderer.
#[derive(Serialize, Deserialize, Debug, Clone, TS)]
#[serde(tag = "kind", rename_all = "kebab-case")]
pub enum CodexEvent {
    #[serde(rename = "conversation-event")]
    ConversationEvent { payload: ConversationEventPayload },
    #[serde(rename = "auth-updated")]
    AuthUpdated { payload: AuthState },
    #[serde(rename = "thread-metadata-updated")]
    ThreadMetadataUpdated { payload: ThreadMetadataPayload },
}
