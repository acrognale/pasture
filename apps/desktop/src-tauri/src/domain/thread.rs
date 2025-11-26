use serde::Deserialize;
use serde::Serialize;
use ts_rs::TS;

use crate::domain::ids::ThreadId;
use crate::domain::ids::WorkspacePath;
use codex_protocol::ConversationId;

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, TS)]
#[serde(rename_all = "camelCase")]
pub struct Conversation {
    pub id: ConversationId,
    pub thread_id: ThreadId,
    pub rollout_path: String,
    pub created_at: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub label: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub parent_conversation_id: Option<ConversationId>,
    pub forked_at_nth_user_message: Option<u32>,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct Thread {
    pub id: ThreadId,
    pub current_conversation_id: ConversationId,
    pub conversations: Vec<Conversation>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub title: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub preview: Option<String>,
    pub created_at: String,
    pub updated_at: String,
    pub workspace_path: WorkspacePath,
}
