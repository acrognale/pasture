use serde::Deserialize;
use serde::Serialize;
use tauri::AppHandle;
use tauri::State;
use ts_rs::TS;
use uuid::Uuid;

use crate::domain::WorkspacePath;
use crate::errors::AppError;
use crate::errors::AppResult;
use crate::state::AppState;

#[derive(Serialize, Deserialize, Debug, Clone, PartialEq, TS)]
#[serde(rename_all = "camelCase")]
pub struct StartRepoWatchParams {
    pub workspace_path: String,
}

#[derive(Serialize, Deserialize, Debug, Clone, PartialEq, TS)]
#[serde(rename_all = "camelCase")]
pub struct StartRepoWatchResponse {
    pub subscription_id: String,
}

#[derive(Serialize, Deserialize, Debug, Clone, PartialEq, TS)]
#[serde(rename_all = "camelCase")]
pub struct StopRepoWatchParams {
    pub subscription_id: String,
}

#[tauri::command]
pub async fn start_repo_watch(
    params: StartRepoWatchParams,
    app: State<'_, AppState>,
    app_handle: AppHandle,
) -> AppResult<StartRepoWatchResponse> {
    let workspace = WorkspacePath::canonicalize(&params.workspace_path)?;
    let subscription_id = app
        .repo_watch
        .start(app_handle, workspace)
        .await
        .map_err(|error| AppError::Validation {
            message: error.to_string(),
        })?;

    Ok(StartRepoWatchResponse {
        subscription_id: subscription_id.to_string(),
    })
}

#[tauri::command]
pub async fn stop_repo_watch(
    params: StopRepoWatchParams,
    app: State<'_, AppState>,
) -> AppResult<()> {
    let uuid = Uuid::parse_str(&params.subscription_id).map_err(|error| AppError::Validation {
        message: format!("Invalid subscription ID: {error}"),
    })?;

    app.repo_watch.stop(uuid).await;
    Ok(())
}
