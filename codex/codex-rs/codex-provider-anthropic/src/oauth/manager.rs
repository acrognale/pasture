use chrono::Utc;

use crate::oauth::service::OAuthService;
use crate::oauth::store::TokenStore;
use crate::oauth::types::OAuthError;
use crate::oauth::types::StoredOauthTokens;

/// Refreshing token manager for Anthropic OAuth credentials.
pub struct TokenManager<S> {
    store: S,
    service: OAuthService,
    /// Refresh slightly before expiry to avoid clock skew.
    refresh_leeway_seconds: i64,
}

impl<S> TokenManager<S>
where
    S: TokenStore,
{
    pub fn new(store: S, service: OAuthService) -> Self {
        Self {
            store,
            service,
            refresh_leeway_seconds: 60,
        }
    }

    pub fn with_refresh_leeway_seconds(mut self, seconds: i64) -> Self {
        self.refresh_leeway_seconds = seconds;
        self
    }

    pub async fn load(&self) -> Result<Option<StoredOauthTokens>, OAuthError> {
        self.store.load().await
    }

    pub async fn clear(&self) -> Result<(), OAuthError> {
        self.store.clear().await
    }

    pub async fn save(&self, tokens: &StoredOauthTokens) -> Result<(), OAuthError> {
        self.store.save(tokens).await
    }

    /// Returns a valid access token if OAuth is configured in the store.
    pub async fn get_access_token(&self) -> Result<Option<String>, OAuthError> {
        let Some(tokens) = self.store.load().await? else {
            return Ok(None);
        };

        if !is_expired(&tokens, self.refresh_leeway_seconds) {
            return Ok(Some(tokens.claude_ai_oauth.access_token));
        }

        let refreshed = self
            .service
            .refresh(&tokens.claude_ai_oauth.refresh_token)
            .await;

        match refreshed {
            Ok(new_tokens) => {
                self.store.save(&new_tokens).await?;
                Ok(Some(new_tokens.claude_ai_oauth.access_token))
            }
            Err(err) => {
                // Refresh failed: clear stored credentials so callers can prompt re-login.
                let _ = self.store.clear().await;
                Err(err)
            }
        }
    }
}

fn is_expired(tokens: &StoredOauthTokens, leeway_seconds: i64) -> bool {
    let now_ms = Utc::now().timestamp_millis();
    let leeway_ms = leeway_seconds.saturating_mul(1000);
    tokens.claude_ai_oauth.expires_at <= now_ms + leeway_ms
}
