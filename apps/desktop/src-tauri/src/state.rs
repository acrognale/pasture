use std::sync::Arc;

use codex_core::AuthManager;
use codex_core::ConversationManager;
use codex_core::config::Config;
use sea_orm::DatabaseConnection;

use crate::router::EventRouter;

/// Central application state containing all shared dependencies.
///
/// This is the single struct managed by Tauri's `State<>`. Commands create
/// a `WorkspaceContext` from this for workspace-scoped operations.
pub struct AppState {
    pub db: DatabaseConnection,
    pub config: Arc<Config>,
    pub auth: Arc<AuthManager>,
    pub conversations: Arc<ConversationManager>,
    pub events: Arc<EventRouter>,
}

impl AppState {
    pub fn new(
        db: DatabaseConnection,
        config: Arc<Config>,
        auth: Arc<AuthManager>,
        conversations: Arc<ConversationManager>,
        events: Arc<EventRouter>,
    ) -> Self {
        Self {
            db,
            config,
            auth,
            conversations,
            events,
        }
    }
}
