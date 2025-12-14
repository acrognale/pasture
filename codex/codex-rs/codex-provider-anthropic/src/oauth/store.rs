use async_trait::async_trait;

use crate::oauth::types::OAuthError;
use crate::oauth::types::StoredOauthTokens;

#[async_trait]
pub trait TokenStore: Send + Sync {
    async fn load(&self) -> Result<Option<StoredOauthTokens>, OAuthError>;
    async fn save(&self, tokens: &StoredOauthTokens) -> Result<(), OAuthError>;
    async fn clear(&self) -> Result<(), OAuthError>;
}
