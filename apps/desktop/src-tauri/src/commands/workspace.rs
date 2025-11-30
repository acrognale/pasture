use serde::Deserialize;
use serde::Serialize;
use tauri::AppHandle;
use tauri::State;
use tauri::WebviewWindowBuilder;
use tauri::Window;
use ts_rs::TS;

use crate::domain::WorkspacePath;
use crate::domain::WorkspaceSettings;
use crate::errors::AppError;
use crate::errors::AppResult;
use crate::state::AppState;
use crate::workspace;
use crate::workspace::ComposerSettingsUpdate;

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
    let label = format!(
        "workspace-{}",
        std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .unwrap()
            .as_millis()
    );

    // Clone the primary window configuration so new workspace windows match
    // the initial Tauri window (size, min size, title bar style, background, etc.).
    let mut window_config = app_handle
        .config()
        .app
        .windows
        .first()
        .cloned()
        .unwrap_or_default();

    window_config.label = label.clone();
    window_config.title = title.clone();
    window_config.url = tauri::WebviewUrl::App(url.into());

    let builder = WebviewWindowBuilder::from_config(&app_handle, &window_config)
        .map_err(|e| AppError::Internal(anyhow::Error::new(e)))?;

    let window = builder
        .build()
        .map_err(|e| AppError::Internal(anyhow::Error::new(e)))?;

    #[cfg(target_os = "macos")]
    {
        use tauri_plugin_decorum::WebviewWindowExt;
        let _ = window.set_traffic_lights_inset(20.0, 22.0);
    }

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

#[derive(Serialize, Deserialize, Debug, Clone, PartialEq, TS)]
#[serde(rename_all = "camelCase")]
pub struct UpdateWorkspaceSettingsParams {
    pub workspace_path: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub web_search_enabled: Option<bool>,
}

/// Update workspace-level settings (applies to new threads created after the change).
#[tauri::command]
pub async fn update_workspace_settings(
    params: UpdateWorkspaceSettingsParams,
    app: State<'_, AppState>,
) -> AppResult<WorkspaceSettings> {
    let normalized = WorkspacePath::canonicalize(&params.workspace_path)?;

    workspace::update_composer_defaults(
        &app.db,
        &normalized,
        ComposerSettingsUpdate {
            web_search_enabled: params.web_search_enabled,
            ..ComposerSettingsUpdate::default()
        },
    )
    .await?;

    workspace::get_composer_defaults(&app.db, &normalized, &app.config).await
}
