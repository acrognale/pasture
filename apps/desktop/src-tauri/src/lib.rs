mod auth;
mod codex_config;
mod commands;
mod completions;
mod context;
mod db;
mod domain;
mod env;
mod errors;
mod message_comments;
mod menu;
mod review;
mod rollout;
mod router;
mod state;
mod symbol_index;
mod threads;
mod title_generation;
mod turns;
mod workspace;

pub mod ts_export;

use std::sync::Arc;

use codex_core::AuthManager;
use codex_core::ConversationManager;
use codex_core::config::Config;
use codex_core::config::ConfigOverrides;
use codex_protocol::protocol::SessionSource;
use symbol_index::SymbolIndexManager;
use tauri::Manager;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_decorum::init())
        .plugin(tauri_plugin_updater::Builder::new().build())
        .plugin(tauri_plugin_process::init())
        .plugin(tauri_plugin_clipboard_manager::init())
        .setup(|app| {
            // Set traffic light positioning to match the legacy Electron app (x: 20, y: 22)
            #[cfg(target_os = "macos")]
            {
                use tauri_plugin_decorum::WebviewWindowExt;
                if let Some(window) = app.get_webview_window("main") {
                    let _ = window.set_traffic_lights_inset(20.0, 22.0);
                }
            }

            let base_config: Arc<Config> = tauri::async_runtime::block_on(async {
                let mut cfg = Config::load_with_cli_overrides(vec![], ConfigOverrides::default())
                    .await
                    .map_err(|e| format!("Failed to load config: {}", e))?;
                env::apply_shell_environment_defaults(&mut cfg).await;
                Ok::<_, String>(Arc::new(cfg))
            })?;

            let auth_manager = AuthManager::shared(
                base_config.codex_home.clone(),
                false,
                base_config.cli_auth_credentials_store_mode,
            );

            let conversation_manager = Arc::new(ConversationManager::new(
                auth_manager.clone(),
                SessionSource::VSCode,
            ));

            let app_data_dir = app
                .path()
                .app_data_dir()
                .map_err(|e| format!("Failed to get app data dir: {}", e))?;
            let db_file = if cfg!(debug_assertions) {
                app_data_dir.join("workspace.dev.db")
            } else {
                app_data_dir.join("workspace.db")
            };

            let workspace_db = tauri::async_runtime::block_on(async {
                db::init::connect_and_migrate(&db_file).await
            })
            .map_err(|e| format!("Failed to initialize workspace database: {}", e))?;

            let event_router = Arc::new(router::EventRouter::new());
            let symbol_index = Arc::new(SymbolIndexManager::new());

            let app_state = state::AppState::new(
                workspace_db,
                base_config,
                auth_manager,
                conversation_manager,
                event_router,
                symbol_index,
            );
            app.manage(app_state);

            log::info!("AppState initialized successfully");

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
            commands::threads::list_threads,
            commands::threads::list_thread_conversations,
            commands::threads::switch_conversation,
            commands::threads::new_thread,
            commands::threads::initialize_thread,
            commands::threads::fork_conversation,
            commands::message_comments::list_message_comments,
            commands::message_comments::create_message_comment,
            commands::message_comments::update_message_comment,
            commands::message_comments::set_message_comments_submitted,
            commands::message_comments::delete_message_comment,
            commands::turns::send_user_message,
            commands::turns::interrupt_conversation,
            commands::turns::compact_conversation,
            commands::images::save_pasted_image,
            commands::composer::get_composer_config,
            commands::composer::update_composer_config,
            commands::review::get_turn_diff_range,
            commands::review::list_turn_snapshots,
            commands::subscriptions::add_conversation_listener,
            commands::subscriptions::remove_conversation_listener,
            commands::approvals::respond_approval,
            commands::workspace::get_workspace_composer_defaults,
            commands::workspace::list_recent_workspaces,
            commands::workspace::open_workspace,
            commands::files::search_workspace_files,
            commands::symbols::search_workspace_symbols,
            commands::workspace::create_workspace_window,
            commands::workspace::set_window_title,
            commands::workspace::browse_for_workspace,
            commands::workspace::update_workspace_settings,
            commands::auth::get_auth_state,
            commands::update::check_for_update,
            commands::update::install_update,
        ])
        .on_menu_event(|app, event| {
            menu::handle_menu_event(app, event);
        })
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
