use serde::Deserialize;
use serde::Serialize;
use tauri::AppHandle;
use tauri::State;
use tauri::Window;
use ts_rs::TS;

use crate::workspace_manager::WorkspaceComposerDefaults;
use crate::workspace_manager::WorkspaceManager;

use super::util::CommandResult;

/// List recently opened workspaces (most recent first).
#[tauri::command]
pub async fn list_recent_workspaces(
    workspace_manager: State<'_, WorkspaceManager>,
) -> CommandResult<Vec<String>> {
    Ok(workspace_manager.get_recent_workspaces().await)
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
) -> CommandResult<String> {
    let normalized = workspace_manager
        .record_workspace_access(params.workspace_path)
        .await
        .map_err(|e| e.to_string())?;

    Ok(normalized)
}

/// Create a new window for a workspace (used by native menu).
#[tauri::command]
pub async fn create_workspace_window(
    params: WorkspacePathParams,
    workspace_manager: State<'_, WorkspaceManager>,
    app_handle: AppHandle,
) -> CommandResult<()> {
    let normalized = workspace_manager
        .record_workspace_access(params.workspace_path)
        .await
        .map_err(|e| e.to_string())?;

    let title = workspace_manager.build_workspace_title(&normalized);

    // Create a new window with the workspace route
    let url = format!("/workspaces/{}", urlencoding::encode(&normalized));

    tauri::WebviewWindowBuilder::new(
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
    .title(&title)
    .title_bar_style(tauri::TitleBarStyle::Overlay)
    .hidden_title(true)
    .build()
    .map_err(|e| e.to_string())?;

    Ok(())
}

#[derive(Serialize, Deserialize, Debug, Clone, PartialEq, TS)]
#[serde(rename_all = "camelCase")]
pub struct SetWindowTitleParams {
    pub title: String,
}

/// Set the current window's title.
#[tauri::command]
pub async fn set_window_title(params: SetWindowTitleParams, window: Window) -> CommandResult<()> {
    window.set_title(&params.title).map_err(|e| e.to_string())?;
    Ok(())
}

/// Browse for a workspace directory using the system file dialog.
#[tauri::command]
pub async fn browse_for_workspace(app_handle: AppHandle) -> CommandResult<Option<String>> {
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
) -> CommandResult<WorkspaceComposerDefaults> {
    let normalized = workspace_manager
        .normalize_workspace_path(&params.workspace_path)
        .map_err(|e| e.to_string())?;
    Ok(workspace_manager
        .get_workspace_defaults_for_normalized(&normalized)
        .await)
}
