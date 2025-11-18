mod codex_runtime;
mod commands;
mod env;
mod event_listener;
mod events;
mod menu;
mod review_snapshots;
mod workspace_manager;

pub mod ts_export;

use tauri::Manager;
use workspace_manager::WorkspaceManager;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_decorum::init())
        .setup(|app| {
            // Set traffic light positioning to match the legacy Electron app (x: 20, y: 22)
            #[cfg(target_os = "macos")]
            {
                use tauri_plugin_decorum::WebviewWindowExt;
                if let Some(window) = app.get_webview_window("main") {
                    let _ = window.set_traffic_lights_inset(20.0, 22.0);
                }
            }
            if cfg!(debug_assertions) {
                app.handle().plugin(
                    tauri_plugin_log::Builder::default()
                        .level(log::LevelFilter::Info)
                        .build(),
                )?;
            }

            let codex_runtime = tauri::async_runtime::block_on(async {
                use codex_core::config::Config;
                use codex_core::config::ConfigOverrides;
                let mut cfg = Config::load_with_cli_overrides(vec![], ConfigOverrides::default())
                    .await
                    .map_err(|e| format!("Failed to load config: {}", e))?;
                env::apply_shell_environment_defaults(&mut cfg).await;
                crate::codex_runtime::CodexRuntime::with_config(cfg)
                    .await
                    .map_err(|e| format!("Failed to construct runtime: {}", e))
            })?;
            app.manage(codex_runtime);

            // Initialize workspace manager
            let app_data_dir = app
                .path()
                .app_data_dir()
                .map_err(|e| format!("Failed to get app data dir: {}", e))?;
            let state_file = if cfg!(debug_assertions) {
                app_data_dir.join("workspace-state.dev.json")
            } else {
                app_data_dir.join("workspace-state.json")
            };

            let workspace_manager = WorkspaceManager::new(state_file);
            tauri::async_runtime::block_on(async { workspace_manager.load_state().await })
                .map_err(|e| {
                    log::error!("Failed to load workspace state: {}", e);
                    e.to_string()
                })?;

            app.manage(workspace_manager);
            log::info!("Workspace manager initialized successfully");

            // Build and install the native menu
            let menu =
                tauri::async_runtime::block_on(async { menu::build_menu(app.handle()).await })
                    .map_err(|e| format!("Failed to build menu: {}", e))?;
            app.set_menu(menu)
                .map_err(|e| format!("Failed to set menu: {}", e))?;
            log::info!("Native menu installed successfully");

            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            commands::initialize::initialize,
            commands::conversations::list_conversations,
            commands::conversations::initialize_conversation,
            commands::conversations::new_conversation,
            commands::conversations::send_user_message,
            commands::conversations::interrupt_conversation,
            commands::conversations::compact_conversation,
            commands::composer::get_composer_config,
            commands::composer::update_composer_config,
            commands::review::get_turn_diff_range,
            commands::review::list_turn_snapshots,
            commands::conversations::add_conversation_listener,
            commands::conversations::remove_conversation_listener,
            commands::approvals::respond_approval,
            commands::workspace::get_workspace_composer_defaults,
            commands::workspace::list_recent_workspaces,
            commands::workspace::open_workspace,
            commands::workspace::create_workspace_window,
            commands::workspace::set_window_title,
            commands::workspace::browse_for_workspace,
            commands::auth::get_auth_state,
        ])
        .on_menu_event(|app, event| {
            menu::handle_menu_event(app, event);
        })
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
