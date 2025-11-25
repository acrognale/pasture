use serde::Deserialize;
use serde::Serialize;
use tauri::AppHandle;
use tauri::State;
use tauri::Window;
use ts_rs::TS;

use crate::domain::WorkspaceComposerDefaults;
use crate::errors::{AppError, AppResult};
use crate::services::WorkspaceService;

/// List recently opened workspaces (most recent first).
#[tauri::command]
pub async fn list_recent_workspaces(
    workspace_service: State<'_, WorkspaceService>,
) -> AppResult<Vec<String>> {
    let workspaces = workspace_service.list_recent(10).await?;
    Ok(workspaces
        .into_iter()
        .map(|summary| summary.path.into_string())
        .collect())
}

/// Parameters accepted by workspace navigation commands.
#[derive(Serialize, Deserialize, Debug, Clone, PartialEq, TS)]
#[serde(rename_all = "camelCase")]
pub struct WorkspacePathParams {
    pub workspace_path: String,
}

/// Record workspace access for history tracking. Frontend navigates via router.
#[tauri::command]
pub async fn open_workspace(
    params: WorkspacePathParams,
    workspace_service: State<'_, WorkspaceService>,
) -> AppResult<String> {
    let normalized = workspace_service.canonicalize(&params.workspace_path)?;
    workspace_service.record_access(&normalized).await?;

    Ok(normalized.into_string())
}

/// Create a new window for a workspace (used by native menu).
#[tauri::command]
pub async fn create_workspace_window(
    params: WorkspacePathParams,
    workspace_service: State<'_, WorkspaceService>,
    app_handle: AppHandle,
) -> AppResult<()> {
    let normalized = workspace_service.canonicalize(&params.workspace_path)?;
    workspace_service.record_access(&normalized).await?;

    let title = workspace_service.build_title(&normalized);

    // Create a new window with the workspace route
    let url = format!("/workspaces/{}", urlencoding::encode(normalized.as_str()));

    let mut builder = tauri::WebviewWindowBuilder::new(
        &app_handle,
        format!(
            "workspace-{}",
            std::time::SystemTime::now()
                .duration_since(std::time::UNIX_EPOCH)
                .unwrap()
                .as_millis()
        ),
        tauri::WebviewUrl::App(url.into()),
    )
    .title(&title);

    #[cfg(target_os = "macos")]
    {
        builder = builder
            .title_bar_style(tauri::TitleBarStyle::Overlay)
            .hidden_title(true);
    }

    builder
        .build()
        .map_err(|e| AppError::Internal(anyhow::Error::new(e)))?;

    Ok(())
}

#[derive(Serialize, Deserialize, Debug, Clone, PartialEq, TS)]
#[serde(rename_all = "camelCase")]
pub struct SetWindowTitleParams {
    pub title: String,
}

/// Set the current window's title.
#[tauri::command]
pub async fn set_window_title(params: SetWindowTitleParams, window: Window) -> AppResult<()> {
    window
        .set_title(&params.title)
        .map_err(|e| AppError::Internal(anyhow::Error::new(e)))?;
    Ok(())
}

/// Browse for a workspace directory using the system file dialog.
#[tauri::command]
pub async fn browse_for_workspace(app_handle: AppHandle) -> AppResult<Option<String>> {
    use tauri_plugin_dialog::DialogExt;

    let folder_path = app_handle
        .dialog()
        .file()
        .set_title("Select a Codex workspace")
        .blocking_pick_folder();

    Ok(folder_path.map(|p| p.to_string()))
}

/// Retrieve remembered composer defaults for the specified workspace.
#[tauri::command]
pub async fn get_workspace_composer_defaults(
    params: WorkspacePathParams,
    workspace_service: State<'_, WorkspaceService>,
) -> AppResult<WorkspaceComposerDefaults> {
    let normalized = workspace_service.canonicalize(&params.workspace_path)?;
    let settings = workspace_service.get_settings(&normalized).await?;
    Ok(settings.into())
}
