use serde::Deserialize;
use serde::Serialize;
use tauri::State;
use ts_rs::TS;

use crate::codex_runtime::CodexRuntime;

use super::util::CommandResult;

/// Response returned from `initialize`.
#[derive(Serialize, Deserialize, Debug, Clone, PartialEq, TS)]
#[serde(rename_all = "camelCase")]
pub struct InitializeResponse {
    pub user_agent: String,
}

/// Initialize the Codex runtime with client information.
#[tauri::command]
pub async fn initialize(runtime: State<'_, CodexRuntime>) -> CommandResult<InitializeResponse> {
    if runtime.is_initialized().await {
        return Ok(InitializeResponse {
            user_agent: codex_core::default_client::get_codex_user_agent(),
        });
    }

    let user_agent = runtime
        .initialize("Tauri Codex Client".to_string(), "0.1.0".to_string())
        .await
        .map_err(|e| e.to_string())?;

    Ok(InitializeResponse { user_agent })
}
