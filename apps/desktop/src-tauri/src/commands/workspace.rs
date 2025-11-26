use serde::Deserialize;
use serde::Serialize;
use tauri::AppHandle;
use tauri::State;
use tauri::Window;
use ts_rs::TS;

use crate::domain::{WorkspacePath, WorkspaceSettings};
use crate::errors::{AppError, AppResult};
use crate::state::AppState;
use crate::workspace;

/// List recently opened workspaces (most recent first).
#[tauri::command]
pub async fn list_recent_workspaces(app: State<'_, AppState>) -> AppResult<Vec<String>> {
    let workspaces = workspace::list_recent(&app.db, 10).await?;
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
    app: State<'_, AppState>,
) -> AppResult<String> {
    let normalized = WorkspacePath::canonicalize(&params.workspace_path)?;
    workspace::touch(&app.db, &normalized).await?;

    Ok(normalized.into_string())
}

/// Create a new window for a workspace (used by native menu).
#[tauri::command]
pub async fn create_workspace_window(
    params: WorkspacePathParams,
    app: State<'_, AppState>,
    app_handle: AppHandle,
) -> AppResult<()> {
    let normalized = WorkspacePath::canonicalize(&params.workspace_path)?;
    workspace::touch(&app.db, &normalized).await?;

    let title = workspace::build_title(&normalized);

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
    app: State<'_, AppState>,
) -> AppResult<WorkspaceSettings> {
    let normalized = WorkspacePath::canonicalize(&params.workspace_path)?;
    workspace::get_composer_defaults(&app.db, &normalized, &app.config).await
}
