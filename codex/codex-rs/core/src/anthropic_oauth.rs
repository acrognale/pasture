use std::path::Path;
use std::path::PathBuf;
use std::sync::Arc;

use chrono::Utc;
use codex_keyring_store::DefaultKeyringStore;
use codex_keyring_store::KeyringStore;
use sha2::Digest;
use sha2::Sha256;
use tokio::fs;
use tracing::warn;

use crate::auth::AuthCredentialsStoreMode;
use codex_provider_anthropic::oauth::AuthorizeResult;
use codex_provider_anthropic::oauth::OAuthError;
use codex_provider_anthropic::oauth::OAuthService;
use codex_provider_anthropic::oauth::StoredOauthTokens;
use codex_provider_anthropic::oauth::TokenManager;
use codex_provider_anthropic::oauth::TokenStore;

const KEYRING_SERVICE: &str = "Codex Anthropic OAuth";

pub struct AnthropicOAuth {
    manager: TokenManager<AnthropicOAuthStore>,
    service: OAuthService,
}

impl AnthropicOAuth {
    pub fn new(codex_home: PathBuf, mode: AuthCredentialsStoreMode) -> Self {
        let service = OAuthService::new();
        let store = AnthropicOAuthStore::new(codex_home, mode, Arc::new(DefaultKeyringStore));
        let manager = TokenManager::new(store, service.clone());
        Self { manager, service }
    }

    pub async fn authorize(&self) -> Result<AuthorizeResult, OAuthError> {
        self.service.authorize().await
    }

    pub async fn exchange_and_store(
        &self,
        code: &str,
        verifier: &str,
    ) -> Result<StoredOauthTokens, OAuthError> {
        let tokens = self.service.exchange(code, verifier).await?;
        self.manager.save(&tokens).await?;
        Ok(tokens)
    }

    pub async fn get_access_token(&self) -> Result<Option<String>, OAuthError> {
        self.manager.get_access_token().await
    }

    pub async fn status(&self) -> Result<Option<AnthropicOauthStatus>, OAuthError> {
        let tokens = self.manager.load().await?;
        Ok(tokens.map(|t| AnthropicOauthStatus {
            expires_at: t.claude_ai_oauth.expires_at,
        }))
    }

    pub async fn logout(&self) -> Result<(), OAuthError> {
        self.manager.clear().await
    }
}

#[derive(Debug, Clone)]
pub struct AnthropicOauthStatus {
    pub expires_at: i64,
}

#[derive(Clone)]
pub struct AnthropicOAuthStore {
    codex_home: PathBuf,
    mode: AuthCredentialsStoreMode,
    keyring_store: Arc<dyn KeyringStore>,
}

impl AnthropicOAuthStore {
    pub fn new(
        codex_home: PathBuf,
        mode: AuthCredentialsStoreMode,
        keyring_store: Arc<dyn KeyringStore>,
    ) -> Self {
        Self {
            codex_home,
            mode,
            keyring_store,
        }
    }

    fn file_path(&self) -> PathBuf {
        self.codex_home.join("anthropic_oauth.json")
    }

    fn store_key(&self) -> Result<String, OAuthError> {
        let canonical = self
            .codex_home
            .canonicalize()
            .unwrap_or_else(|_| self.codex_home.clone());
        Ok(compute_store_key(&canonical, "anthropic"))
    }

    async fn load_from_file(&self) -> Result<Option<StoredOauthTokens>, OAuthError> {
        let path = self.file_path();
        if !path.exists() {
            return Ok(None);
        }
        let contents = fs::read_to_string(&path).await.map_err(OAuthError::Io)?;
        let tokens = serde_json::from_str::<StoredOauthTokens>(&contents)?;
        Ok(Some(tokens))
    }

    async fn save_to_file(&self, tokens: &StoredOauthTokens) -> Result<(), OAuthError> {
        let path = self.file_path();
        if let Some(parent) = path.parent() {
            fs::create_dir_all(parent).await.map_err(OAuthError::Io)?;
        }
        let json = serde_json::to_string_pretty(tokens)?;
        fs::write(path, json).await.map_err(OAuthError::Io)?;
        Ok(())
    }

    async fn clear_file(&self) -> Result<(), OAuthError> {
        let path = self.file_path();
        if path.exists() {
            let _ = fs::remove_file(path).await;
        }
        Ok(())
    }

    fn load_from_keyring(&self, key: &str) -> Result<Option<StoredOauthTokens>, OAuthError> {
        match self.keyring_store.load(KEYRING_SERVICE, key) {
            Ok(Some(serialized)) => serde_json::from_str(&serialized)
                .map(Some)
                .map_err(Into::into),
            Ok(None) => Ok(None),
            Err(error) => Err(OAuthError::Config(format!(
                "failed to load Anthropic OAuth from keyring: {}",
                error.message()
            ))),
        }
    }

    fn save_to_keyring(&self, key: &str, tokens: &StoredOauthTokens) -> Result<(), OAuthError> {
        let serialized = serde_json::to_string(tokens)?;
        match self.keyring_store.save(KEYRING_SERVICE, key, &serialized) {
            Ok(()) => Ok(()),
            Err(error) => Err(OAuthError::Config(format!(
                "failed to write Anthropic OAuth to keyring: {}",
                error.message()
            ))),
        }
    }

    fn clear_keyring(&self, key: &str) -> Result<(), OAuthError> {
        match self.keyring_store.delete(KEYRING_SERVICE, key) {
            Ok(_) => Ok(()),
            Err(error) => Err(OAuthError::Config(format!(
                "failed to delete Anthropic OAuth from keyring: {}",
                error.message()
            ))),
        }
    }
}

#[async_trait::async_trait]
impl TokenStore for AnthropicOAuthStore {
    async fn load(&self) -> Result<Option<StoredOauthTokens>, OAuthError> {
        match self.mode {
            AuthCredentialsStoreMode::File => self.load_from_file().await?,
            AuthCredentialsStoreMode::Keyring => {
                let key = self.store_key()?;
                self.load_from_keyring(&key)?
            }
            AuthCredentialsStoreMode::Auto => {
                let key = self.store_key()?;
                match self.load_from_keyring(&key) {
                    Ok(Some(tokens)) => Some(tokens),
                    Ok(None) => self.load_from_file().await?,
                    Err(err) => {
                        warn!("keyring load failed, falling back to file: {err}");
                        self.load_from_file().await?
                    }
                }
            }
        }
    }

    async fn save(&self, tokens: &StoredOauthTokens) -> Result<(), OAuthError> {
        match self.mode {
            AuthCredentialsStoreMode::File => self.save_to_file(tokens).await,
            AuthCredentialsStoreMode::Keyring => {
                let key = self.store_key()?;
                self.save_to_keyring(&key, tokens)?;
                // Best-effort remove file fallback
                let _ = self.clear_file().await;
                Ok(())
            }
            AuthCredentialsStoreMode::Auto => {
                let key = self.store_key()?;
                match self.save_to_keyring(&key, tokens) {
                    Ok(()) => {
                        let _ = self.clear_file().await;
                        Ok(())
                    }
                    Err(err) => {
                        warn!("keyring save failed, falling back to file: {err}");
                        self.save_to_file(tokens).await
                    }
                }
            }
        }
    }

    async fn clear(&self) -> Result<(), OAuthError> {
        match self.mode {
            AuthCredentialsStoreMode::File => self.clear_file().await,
            AuthCredentialsStoreMode::Keyring => {
                let key = self.store_key()?;
                self.clear_keyring(&key)?;
                let _ = self.clear_file().await;
                Ok(())
            }
            AuthCredentialsStoreMode::Auto => {
                let key = self.store_key()?;
                let _ = self.clear_keyring(&key);
                let _ = self.clear_file().await;
                Ok(())
            }
        }
    }
}

fn compute_store_key(codex_home: &Path, prefix: &str) -> String {
    let path_str = codex_home.to_string_lossy();
    let mut hasher = Sha256::new();
    hasher.update(path_str.as_bytes());
    let digest = hasher.finalize();
    let hex = format!("{digest:x}");
    let truncated = hex.get(..16).unwrap_or(&hex);
    format!("{prefix}|{truncated}")
}

pub fn is_token_expired(expires_at_ms: i64) -> bool {
    let now = Utc::now().timestamp_millis();
    expires_at_ms <= now
}
