use serde::Deserialize;
use serde::Serialize;
use tauri::State;
use ts_rs::TS;

use crate::codex_runtime::CodexRuntime;

use super::util::CommandResult;

/// Parameters accepted when loading initial runtime state.
#[derive(Serialize, Deserialize, Debug, Clone, PartialEq, TS)]
#[serde(rename_all = "camelCase")]
pub struct LoadInitialRuntimeStateParams {
    pub conversation_id: String,
}

/// Snapshot of runtime metadata for a conversation stream.
#[derive(Serialize, Deserialize, Debug, Clone, PartialEq, Default, TS)]
#[serde(rename_all = "camelCase")]
pub struct ConversationRuntimeSnapshot {
    #[serde(skip_serializing_if = "Option::is_none")]
    pub active_turn_started_at: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub context_tokens_in_window: Option<u64>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub max_context_window: Option<u64>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub status_header: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub latest_turn_diff: Option<TurnDiffSnapshot>,
}

/// Snapshot of the most recent turn diff emitted by the runtime.
#[derive(Serialize, Deserialize, Debug, Clone, PartialEq, Default, TS)]
#[serde(rename_all = "camelCase")]
pub struct TurnDiffSnapshot {
    pub event_id: String,
    pub timestamp: String,
    pub unified_diff: String,
    pub turn_number: u32,
}

/// Load initial runtime state for a conversation.
/// This provides a point-in-time snapshot when opening/switching conversations.
/// Real-time updates are delivered via streaming events.
#[tauri::command]
pub async fn load_initial_runtime_state(
    _params: LoadInitialRuntimeStateParams,
    runtime: State<'_, CodexRuntime>,
) -> CommandResult<ConversationRuntimeSnapshot> {
    if !runtime.is_initialized().await {
        return Err("Runtime not initialized".to_string());
    }

    Ok(ConversationRuntimeSnapshot::default())
}
