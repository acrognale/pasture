use crate::commands::workspace::WorkspacePathParams;
use crate::errors::AppError;
use crate::errors::AppResult;
use crate::state::AppState;
use crate::workspace;
use log::warn;
use tauri::AppHandle;
use tauri::Emitter;
use tauri::Manager;
use tauri::WebviewWindowBuilder;
use tauri::Wry;
use tauri::menu::Menu;
use tauri::menu::MenuBuilder;
use tauri::menu::MenuEvent;
use tauri::menu::MenuItem;
use tauri::menu::PredefinedMenuItem;
use tauri::menu::Submenu;
use tauri::menu::SubmenuBuilder;

const MENU_OPEN_WORKSPACE: &str = "open_workspace";
const MENU_RECENT_WORKSPACE_PREFIX: &str = "recent_workspace_";
const MENU_CHECK_FOR_UPDATES: &str = "check_for_updates";
const MENU_CLOSE_FOCUSED_PANEL_OR_WINDOW: &str = "close_focused_panel_or_window";
const MENU_NEW_WINDOW: &str = "new_window";

/// Build the native application menu
pub async fn build_menu(app: &AppHandle) -> Result<Menu<Wry>, tauri::Error> {
    let app_state = app.state::<AppState>();

    // Get workspace state asynchronously
    let recent_workspaces = match workspace::list_recent(&app_state.db, 10).await {
        Ok(items) => items,
        Err(err) => {
            warn!("Failed to load recent workspaces: {}", err);
            Vec::new()
        }
    };

    let recent_workspaces = recent_workspaces
        .into_iter()
        .map(|summary| summary.path.into_string())
        .collect::<Vec<_>>();

    let menu = MenuBuilder::new(app)
        .items(&[
            &build_app_menu(app)?,
            &build_file_menu(app, &recent_workspaces)?,
            &build_edit_menu(app)?,
            &build_window_menu(app)?,
        ])
        .build()?;

    Ok(menu)
}

/// Build the app menu (macOS only)
fn build_app_menu(app: &AppHandle) -> Result<Submenu<Wry>, tauri::Error> {
    let app_name = "Codex";

    SubmenuBuilder::new(app, app_name)
        .item(&PredefinedMenuItem::about(app, None, None)?)
        .item(&MenuItem::with_id(
            app,
            MENU_CHECK_FOR_UPDATES,
            "Check for Updates…",
            true,
            None::<&str>,
        )?)
        .separator()
        .item(&PredefinedMenuItem::services(app, None)?)
        .separator()
        .item(&PredefinedMenuItem::hide(app, None)?)
        .item(&PredefinedMenuItem::hide_others(app, None)?)
        .item(&PredefinedMenuItem::show_all(app, None)?)
        .separator()
        .item(&PredefinedMenuItem::quit(app, None)?)
        .build()
}

/// Build the File menu with workspace operations
fn build_file_menu(
    app: &AppHandle,
    recent_workspaces: &[String],
) -> Result<Submenu<Wry>, tauri::Error> {
    let mut file_menu = SubmenuBuilder::new(app, "File");

    // New Window
    file_menu = file_menu.item(&MenuItem::with_id(
        app,
        MENU_NEW_WINDOW,
        "New Window",
        true,
        Some("CmdOrCtrl+Shift+N"),
    )?);

    // Open Workspace
    file_menu = file_menu.item(&MenuItem::with_id(
        app,
        MENU_OPEN_WORKSPACE,
        "Open Workspace…",
        true,
        Some("CmdOrCtrl+Shift+O"),
    )?);

    // Recent Workspaces submenu
    file_menu = file_menu.item(&build_recent_workspaces_submenu(app, recent_workspaces)?);

    // Separator and Close
    file_menu = file_menu.separator();

    file_menu = file_menu.item(&MenuItem::with_id(
        app,
        MENU_CLOSE_FOCUSED_PANEL_OR_WINDOW,
        "Close",
        true,
        Some("CmdOrCtrl+W"),
    )?);

    #[cfg(not(target_os = "macos"))]
    {
        file_menu = file_menu.separator();
        file_menu = file_menu.item(&PredefinedMenuItem::quit(app, None)?);
    }

    file_menu.build()
}

/// Build Recent Workspaces submenu
fn build_recent_workspaces_submenu(
    app: &AppHandle,
    recent_workspaces: &[String],
) -> Result<Submenu<Wry>, tauri::Error> {
    let mut submenu = SubmenuBuilder::new(app, "Recent Workspaces");

    if recent_workspaces.is_empty() {
        submenu = submenu.item(&MenuItem::new(
            app,
            "No Recent Workspaces",
            false,
            None::<&str>,
        )?);
    } else {
        for (idx, workspace_path) in recent_workspaces.iter().enumerate() {
            let label = format_workspace_label(workspace_path);
            let id = format!("{}{}", MENU_RECENT_WORKSPACE_PREFIX, idx);

            submenu = submenu.item(&MenuItem::with_id(app, id, label, true, None::<&str>)?);
        }
    }

    submenu.build()
}

/// Build the Edit menu
fn build_edit_menu(app: &AppHandle) -> Result<Submenu<Wry>, tauri::Error> {
    SubmenuBuilder::new(app, "Edit")
        .item(&PredefinedMenuItem::undo(app, None)?)
        .item(&PredefinedMenuItem::redo(app, None)?)
        .separator()
        .item(&PredefinedMenuItem::cut(app, None)?)
        .item(&PredefinedMenuItem::copy(app, None)?)
        .item(&PredefinedMenuItem::paste(app, None)?)
        .item(&PredefinedMenuItem::select_all(app, None)?)
        .build()
}

/// Build the Window menu
fn build_window_menu(app: &AppHandle) -> Result<Submenu<Wry>, tauri::Error> {
    let mut window_menu = SubmenuBuilder::new(app, "Window")
        .item(&PredefinedMenuItem::minimize(app, None)?)
        .item(&PredefinedMenuItem::maximize(app, None)?);

    #[cfg(target_os = "macos")]
    {
        window_menu = window_menu.separator();
        // Note: bring_all_to_front is not available in this version
    }

    window_menu.build()
}

/// Handle menu events
pub fn handle_menu_event(app: &AppHandle, event: MenuEvent) {
    let event_id = event.id().as_ref();
    let app_handle = app.clone();

    match event_id {
        MENU_NEW_WINDOW => {
            if let Err(err) = open_new_window(&app_handle) {
                log::error!("Failed to open new window: {}", err);
            }
        }
        MENU_CLOSE_FOCUSED_PANEL_OR_WINDOW => {
            if let Some((_, window)) = app_handle
                .webview_windows()
                .into_iter()
                .find(|(_, window)| window.is_focused().unwrap_or(false))
            {
                if let Err(e) = window.emit("app:close-requested", ()) {
                    log::error!("Failed to emit close request event: {}", e);
                }
            } else if let Err(e) = app_handle.emit("app:close-requested", ()) {
                log::error!("Failed to emit close request event: {}", e);
            }
        }
        MENU_CHECK_FOR_UPDATES => {
            // Emit event for frontend to handle update check
            if let Err(e) = app_handle.emit("update:check-requested", ()) {
                log::error!("Failed to emit update check event: {}", e);
            }
        }
        MENU_OPEN_WORKSPACE => {
            tauri::async_runtime::spawn(async move {
                match crate::commands::workspace::browse_for_workspace(app_handle.clone()).await {
                    Ok(Some(workspace_path)) => {
                        if let Err(err) =
                            open_workspace_via_menu(&app_handle, workspace_path.clone()).await
                        {
                            log::error!("Failed to open workspace {}: {}", workspace_path, err);
                        }
                    }
                    Ok(None) => {
                        log::debug!("User cancelled workspace selection");
                    }
                    Err(e) => {
                        log::error!("Failed to browse for workspace: {}", e);
                    }
                }
            });
        }
        id if id.starts_with(MENU_RECENT_WORKSPACE_PREFIX) => {
            let idx_str = id.strip_prefix(MENU_RECENT_WORKSPACE_PREFIX).unwrap();
            if let Ok(idx) = idx_str.parse::<usize>() {
                let app_clone = app_handle.clone();
                tauri::async_runtime::spawn(async move {
                    let app_handle = app_clone;
                    let app_state = app_handle.state::<AppState>();
                    let recent = match workspace::list_recent(&app_state.db, 10).await {
                        Ok(items) => items,
                        Err(err) => {
                            warn!("Failed to load recent workspaces: {}", err);
                            Vec::new()
                        }
                    };

                    let recent = recent
                        .into_iter()
                        .map(|summary| summary.path.into_string())
                        .collect::<Vec<_>>();

                    if let Some(workspace_path) = recent.get(idx)
                        && let Err(err) =
                            open_workspace_via_menu(&app_handle, workspace_path.clone()).await
                    {
                        log::error!(
                            "Failed to open recent workspace {}: {}",
                            workspace_path,
                            err
                        );
                    }
                });
            }
        }
        _ => {
            log::debug!("Unhandled menu event: {}", event_id);
        }
    }
}

async fn open_workspace_via_menu(app_handle: &AppHandle, workspace_path: String) -> AppResult<()> {
    let app_state = app_handle.state::<AppState>();

    // Create a new window for the workspace
    crate::commands::workspace::create_workspace_window(
        WorkspacePathParams { workspace_path },
        app_state,
        app_handle.clone(),
    )
    .await?;

    // Rebuild menu to update recent workspaces
    if let Err(err) = rebuild_menu(app_handle).await {
        log::warn!("Failed to rebuild menu: {}", err);
    }

    Ok(())
}

/// Format a workspace path to a readable label
fn format_workspace_label(workspace_path: &str) -> String {
    let normalized = workspace_path.trim_end_matches('/');

    if normalized.is_empty() {
        return "Workspace".to_string();
    }

    let segments: Vec<&str> = normalized.split('/').filter(|s| !s.is_empty()).collect();

    segments
        .last()
        .map(|s| s.to_string())
        .unwrap_or_else(|| normalized.to_string())
}

/// Rebuild the menu (called when workspace state changes)
pub async fn rebuild_menu(app: &AppHandle) -> Result<(), tauri::Error> {
    let menu = build_menu(app).await?;
    app.set_menu(menu)?;
    Ok(())
}

pub fn open_new_window(app_handle: &AppHandle) -> AppResult<()> {
    let label = format!(
        "window-{}",
        std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .unwrap()
            .as_millis()
    );

    let mut window_config = app_handle
        .config()
        .app
        .windows
        .first()
        .cloned()
        .unwrap_or_default();

    window_config.label = label.clone();
    window_config.url = tauri::WebviewUrl::App("/".into());

    let builder = WebviewWindowBuilder::from_config(app_handle, &window_config)
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
