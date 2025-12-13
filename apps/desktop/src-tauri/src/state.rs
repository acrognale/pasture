use std::sync::Arc;

use codex_core::AuthManager;
use codex_core::ConversationManager;
use codex_core::config::Config;
use sea_orm::DatabaseConnection;

use crate::router::EventRouter;
use crate::symbol_index::SymbolIndexManager;
use crate::thread_search::ThreadSearchManager;

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
    pub symbol_index: Arc<SymbolIndexManager>,
    pub thread_search: Arc<ThreadSearchManager>,
}

impl AppState {
    pub fn new(
        db: DatabaseConnection,
        config: Arc<Config>,
        auth: Arc<AuthManager>,
        conversations: Arc<ConversationManager>,
        events: Arc<EventRouter>,
        symbol_index: Arc<SymbolIndexManager>,
        thread_search: Arc<ThreadSearchManager>,
    ) -> Self {
        Self {
            db,
            config,
            auth,
            conversations,
            events,
            symbol_index,
            thread_search,
        }
    }
}
