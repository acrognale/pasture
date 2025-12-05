use codex_protocol::ConversationId;
use serde::Deserialize;
use serde::Serialize;
use ts_rs::TS;

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize, TS)]
#[serde(rename_all = "camelCase")]
pub struct MessageComment {
    pub id: String,
    pub conversation_id: ConversationId,
    pub cell_id: String,
    pub selection_text: String,
    pub selection_preview: String,
    pub selection_start_offset: Option<i32>,
    pub selection_end_offset: Option<i32>,
    pub selection_block_index: Option<i32>,
    pub comment_text: String,
    pub created_at: String,
    pub is_submitted: bool,
}
