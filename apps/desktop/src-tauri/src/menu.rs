use crate::commands::workspace::WorkspacePathParams;
use crate::workspace_manager::WorkspaceManager;
use tauri::AppHandle;
use tauri::Manager;
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

/// Build the native application menu
pub async fn build_menu(app: &AppHandle) -> Result<Menu<Wry>, tauri::Error> {
    let workspace_manager = app.state::<WorkspaceManager>();

    // Get workspace state asynchronously
    let recent_workspaces = workspace_manager.get_recent_workspaces().await;

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

    #[cfg(target_os = "macos")]
    {
        file_menu = file_menu.item(&PredefinedMenuItem::close_window(app, None)?);
    }

    #[cfg(not(target_os = "macos"))]
    {
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

    #[cfg(not(target_os = "macos"))]
    {
        window_menu = window_menu.item(&PredefinedMenuItem::close_window(app, None)?);
    }

    window_menu.build()
}

/// Handle menu events
pub fn handle_menu_event(app: &AppHandle, event: MenuEvent) {
    let event_id = event.id().as_ref();
    let app_handle = app.clone();

    match event_id {
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
                    let workspace_manager = app_handle.state::<WorkspaceManager>();
                    let recent = workspace_manager.get_recent_workspaces().await;

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

async fn open_workspace_via_menu(
    app_handle: &AppHandle,
    workspace_path: String,
) -> Result<(), String> {
    let workspace_manager = app_handle.state::<WorkspaceManager>();

    // Create a new window for the workspace
    crate::commands::workspace::create_workspace_window(
        WorkspacePathParams { workspace_path },
        workspace_manager,
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
