use codex_protocol::ConversationId;
use serde::Deserialize;
use serde::Serialize;
use tauri::State;
use ts_rs::TS;
use uuid::Uuid;

use crate::domain::MessageComment;
use crate::errors::AppResult;
use crate::message_comments;
use crate::state::AppState;

#[derive(Serialize, Deserialize, Debug, Clone, PartialEq, TS)]
#[serde(rename_all = "camelCase")]
pub struct ListMessageCommentsParams {
    pub conversation_id: ConversationId,
}

#[derive(Serialize, Deserialize, Debug, Clone, PartialEq, TS)]
#[serde(rename_all = "camelCase")]
pub struct ListMessageCommentsResponse {
    pub comments: Vec<MessageComment>,
}

#[derive(Serialize, Deserialize, Debug, Clone, PartialEq, TS)]
#[serde(rename_all = "camelCase")]
pub struct CreateMessageCommentParams {
    #[serde(skip_serializing_if = "Option::is_none")]
    pub id: Option<String>,
    pub conversation_id: ConversationId,
    pub cell_id: String,
    pub selection_text: String,
    pub selection_preview: String,
    pub selection_start_offset: Option<i32>,
    pub selection_end_offset: Option<i32>,
    pub selection_block_index: Option<i32>,
    pub comment_text: String,
}

#[derive(Serialize, Deserialize, Debug, Clone, PartialEq, TS)]
#[serde(rename_all = "camelCase")]
pub struct CreateMessageCommentResponse {
    pub comment: MessageComment,
}

#[derive(Serialize, Deserialize, Debug, Clone, PartialEq, TS)]
#[serde(rename_all = "camelCase")]
pub struct UpdateMessageCommentParams {
    pub id: String,
    pub comment_text: Option<String>,
    pub is_submitted: Option<bool>,
}

#[derive(Serialize, Deserialize, Debug, Clone, PartialEq, TS)]
#[serde(rename_all = "camelCase")]
pub struct SetMessageCommentsSubmittedParams {
    pub ids: Vec<String>,
    pub is_submitted: bool,
}

#[derive(Serialize, Deserialize, Debug, Clone, PartialEq, TS)]
#[serde(rename_all = "camelCase")]
pub struct DeleteMessageCommentParams {
    pub id: String,
}

#[tauri::command]
pub async fn list_message_comments(
    app: State<'_, AppState>,
    params: ListMessageCommentsParams,
) -> AppResult<ListMessageCommentsResponse> {
    let comments =
        message_comments::list_for_conversation(&app.db, &params.conversation_id).await?;
    Ok(ListMessageCommentsResponse { comments })
}

#[tauri::command]
pub async fn create_message_comment(
    app: State<'_, AppState>,
    params: CreateMessageCommentParams,
) -> AppResult<CreateMessageCommentResponse> {
    let comment = MessageComment {
        id: params.id.unwrap_or_else(|| Uuid::new_v4().to_string()),
        conversation_id: params.conversation_id,
        cell_id: params.cell_id,
        selection_text: params.selection_text,
        selection_preview: params.selection_preview,
        selection_start_offset: params.selection_start_offset,
        selection_end_offset: params.selection_end_offset,
        selection_block_index: params.selection_block_index,
        comment_text: params.comment_text.trim().to_string(),
        created_at: chrono::Utc::now().to_rfc3339(),
        is_submitted: false,
    };

    message_comments::insert(&app.db, &comment).await?;

    Ok(CreateMessageCommentResponse { comment })
}

#[tauri::command]
pub async fn update_message_comment(
    app: State<'_, AppState>,
    params: UpdateMessageCommentParams,
) -> AppResult<()> {
    let trimmed = params
        .comment_text
        .as_ref()
        .map(|text| text.trim().to_string());
    message_comments::update_comment(&app.db, &params.id, trimmed.as_deref(), params.is_submitted)
        .await
}

#[tauri::command]
pub async fn set_message_comments_submitted(
    app: State<'_, AppState>,
    params: SetMessageCommentsSubmittedParams,
) -> AppResult<()> {
    message_comments::set_submitted(&app.db, &params.ids, params.is_submitted).await
}

#[tauri::command]
pub async fn delete_message_comment(
    app: State<'_, AppState>,
    params: DeleteMessageCommentParams,
) -> AppResult<()> {
    message_comments::delete(&app.db, &params.id).await
}
