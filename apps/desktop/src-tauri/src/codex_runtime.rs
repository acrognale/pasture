use std::sync::Arc;
use tokio::sync::Mutex;

use codex_core::AuthManager;
use codex_core::ConversationManager;
use codex_core::config::Config;
use codex_protocol::protocol::SessionSource;

use crate::event_listener::EventSubscriptionManager;

/// Embedded Codex runtime that manages authentication, conversations, and message processing.
#[derive(Clone)]
pub struct CodexRuntime {
    auth_manager: Arc<AuthManager>,
    conversation_manager: Arc<ConversationManager>,
    config: Arc<Config>,
    initialized: Arc<Mutex<bool>>,
    event_manager: Arc<EventSubscriptionManager>,
}

impl CodexRuntime {
    /// Create a new CodexRuntime instance with a specific configuration.
    pub async fn with_config(config: Config) -> anyhow::Result<Self> {
        let config = Arc::new(config);
        let auth_manager = AuthManager::shared(
            config.codex_home.clone(),
            false,
            config.cli_auth_credentials_store_mode,
        );
        let conversation_manager = Arc::new(ConversationManager::new(
            auth_manager.clone(),
            SessionSource::VSCode,
        ));

        Ok(Self {
            auth_manager,
            conversation_manager,
            config,
            initialized: Arc::new(Mutex::new(false)),
            event_manager: Arc::new(EventSubscriptionManager::new()),
        })
    }

    /// Initialize the runtime with client information.
    /// This must be called before any other operations.
    pub async fn initialize(
        &self,
        _client_name: String,
        _client_version: String,
    ) -> anyhow::Result<String> {
        let mut initialized = self.initialized.lock().await;
        if *initialized {
            anyhow::bail!("Runtime already initialized");
        }

        *initialized = true;
        Ok(codex_core::default_client::get_codex_user_agent())
    }

    /// Check if the runtime has been initialized.
    pub async fn is_initialized(&self) -> bool {
        *self.initialized.lock().await
    }

    /// Get a reference to the AuthManager.
    pub fn auth_manager(&self) -> &Arc<AuthManager> {
        &self.auth_manager
    }

    /// Get a reference to the ConversationManager.
    pub fn conversation_manager(&self) -> &Arc<ConversationManager> {
        &self.conversation_manager
    }

    /// Get a reference to the Config.
    pub fn config(&self) -> &Arc<Config> {
        &self.config
    }

    /// Get a reference to the EventSubscriptionManager.
    pub fn event_manager(&self) -> &Arc<EventSubscriptionManager> {
        &self.event_manager
    }
}
