use sea_orm::DatabaseConnection;
use serde::Deserialize;
use serde::Serialize;
use tauri::AppHandle;
use tauri::State;
use tauri::Window;
use ts_rs::TS;

use crate::errors::{AppError, AppResult};
use crate::workspace_manager::WorkspaceComposerDefaults;
use crate::workspace_manager::WorkspaceManager;

/// List recently opened workspaces (most recent first).
#[tauri::command]
pub async fn list_recent_workspaces(db: State<'_, DatabaseConnection>) -> AppResult<Vec<String>> {
    let workspaces = crate::db::workspace::list_recent_workspaces(&db, 10).await?;
    Ok(workspaces)
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
    workspace_manager: State<'_, WorkspaceManager>,
    db: State<'_, DatabaseConnection>,
) -> AppResult<String> {
    let normalized = workspace_manager.normalize_workspace_path(&params.workspace_path)?;

    crate::db::workspace::upsert_workspace(&db, normalized.as_str(), None).await?;

    Ok(normalized.into_string())
}

/// Create a new window for a workspace (used by native menu).
#[tauri::command]
pub async fn create_workspace_window(
    params: WorkspacePathParams,
    workspace_manager: State<'_, WorkspaceManager>,
    db: State<'_, DatabaseConnection>,
    app_handle: AppHandle,
) -> AppResult<()> {
    let normalized = workspace_manager.normalize_workspace_path(&params.workspace_path)?;

    crate::db::workspace::upsert_workspace(&db, normalized.as_str(), None).await?;

    let title = workspace_manager.build_workspace_title(&normalized);

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
    workspace_manager: State<'_, WorkspaceManager>,
    db: State<'_, DatabaseConnection>,
) -> AppResult<WorkspaceComposerDefaults> {
    let normalized = workspace_manager.normalize_workspace_path(&params.workspace_path)?;
    let defaults = crate::db::workspace::get_workspace_defaults(&db, normalized.as_str()).await?;
    Ok(defaults)
}
