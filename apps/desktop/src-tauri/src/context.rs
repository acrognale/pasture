use std::sync::Arc;

use codex_core::config::Config;
use codex_core::{AuthManager, ConversationManager};
use sea_orm::DatabaseConnection;
use tokio::sync::OnceCell;

use crate::domain::{WorkspacePath, WorkspaceSettings};
use crate::errors::AppResult;
use crate::router::EventRouter;
use crate::state::AppState;
use crate::workspace;

/// Per-operation context scoped to a single workspace.
///
/// Created from `AppState` at the start of each command. Provides lazy-loaded
/// workspace settings via `OnceCell` to avoid loading them when not needed.
pub struct WorkspaceContext {
    pub path: WorkspacePath,
    db: DatabaseConnection,
    config: Arc<Config>,
    auth: Arc<AuthManager>,
    conversations: Arc<ConversationManager>,
    events: Arc<EventRouter>,
    settings: OnceCell<WorkspaceSettings>,
}

impl WorkspaceContext {
    pub fn new(path: WorkspacePath, app: &AppState) -> Self {
        Self {
            path,
            db: app.db.clone(),
            config: app.config.clone(),
            auth: app.auth.clone(),
            conversations: app.conversations.clone(),
            events: app.events.clone(),
            settings: OnceCell::new(),
        }
    }

    pub fn db(&self) -> &DatabaseConnection {
        &self.db
    }

    pub fn config(&self) -> &Config {
        &self.config
    }

    pub fn auth(&self) -> Arc<AuthManager> {
        self.auth.clone()
    }

    pub fn conversations(&self) -> &ConversationManager {
        &self.conversations
    }

    pub fn events(&self) -> &EventRouter {
        &self.events
    }

    /// Get workspace settings, loading from the database on first access.
    pub async fn settings(&self) -> AppResult<&WorkspaceSettings> {
        self.settings
            .get_or_try_init(|| async { workspace::load_settings(&self.db, &self.path).await })
            .await
    }
}
