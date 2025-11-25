mod codex_runtime;
mod commands;
mod completions;
mod db;
mod domain;
mod env;
mod errors;
mod events;
mod menu;
mod services;
mod title_generation;
mod workspace_manager;

pub mod ts_export;

use std::sync::Arc;

use services::{
    ConversationConfigDeriver, GitSnapshotter, ReviewService, ThreadService, TurnService,
    WorkspaceService,
};
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

            let codex_runtime = tauri::async_runtime::block_on(async {
                use codex_core::config::Config;
                use codex_core::config::ConfigOverrides;
                let mut cfg = Config::load_with_cli_overrides(vec![], ConfigOverrides::default())
                    .await
                    .map_err(|e| format!("Failed to load config: {}", e))?;
                env::apply_shell_environment_defaults(&mut cfg).await;
                let runtime = crate::codex_runtime::CodexRuntime::with_config(cfg)
                    .await
                    .map_err(|e| format!("Failed to construct runtime: {}", e))?;
                runtime
                    .initialize("Tauri Codex Client".to_string(), "0.1.0".to_string())
                    .await
                    .map_err(|e| format!("Failed to initialize Codex runtime: {}", e))?;
                Ok::<_, String>(runtime)
            })?;
            let conversation_manager = codex_runtime.conversation_manager().clone();
            let auth_manager = codex_runtime.auth_manager().clone();
            let base_config = codex_runtime.config().clone();
            app.manage(codex_runtime);

            // Initialize workspace manager
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

            app.manage(workspace_db.clone());

            let snapshot_repo = db::TurnSnapshotRepo::new(workspace_db.clone());
            let git_snapshotter = Arc::new(GitSnapshotter::new());
            let review_service = Arc::new(ReviewService::new(snapshot_repo, git_snapshotter));
            app.manage(review_service.clone());

            let event_router = Arc::new(crate::events::EventRouter::new());
            app.manage(event_router.clone());

            let turn_service = TurnService::new(conversation_manager.clone(), event_router.clone());
            app.manage(turn_service.clone());

            let workspace_manager = WorkspaceManager::new();
            app.manage(workspace_manager);

            let workspace_repo = db::WorkspaceRepo::new(workspace_db.clone());
            let workspace_settings_repo = db::WorkspaceSettingsRepo::new(workspace_db.clone());
            let workspace_service =
                WorkspaceService::new(workspace_repo.clone(), workspace_settings_repo.clone());
            app.manage(workspace_service.clone());
            let thread_repo = db::ThreadRepo::new(workspace_db.clone());
            let config_deriver = ConversationConfigDeriver::new(workspace_settings_repo.clone());
            let thread_service = ThreadService::new(
                thread_repo,
                workspace_repo,
                conversation_manager,
                auth_manager,
                base_config,
                config_deriver,
            );
            app.manage(thread_service.clone());
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
            commands::conversations::list_threads,
            commands::conversations::list_thread_rollouts,
            commands::conversations::switch_thread_rollout,
            commands::conversations::new_thread,
            commands::conversations::initialize_thread,
            commands::conversations::fork_thread,
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
