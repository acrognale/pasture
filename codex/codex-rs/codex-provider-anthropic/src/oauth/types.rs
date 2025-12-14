use serde::Deserialize;
use serde::Serialize;
use thiserror::Error;

#[derive(Error, Debug)]
pub enum OAuthError {
    #[error("network error: {0}")]
    Network(#[from] reqwest::Error),

    #[error("json error: {0}")]
    Serialization(#[from] serde_json::Error),

    #[error("io error: {0}")]
    Io(#[from] std::io::Error),

    #[error("oauth config error: {0}")]
    Config(String),

    #[error("token exchange failed: {0}")]
    TokenExchange(String),

    #[error("token refresh failed: {0}")]
    TokenRefresh(String),

    #[error("no stored OAuth credentials")]
    MissingCredentials,

    #[error("URL parse error: {0}")]
    UrlParse(#[from] url::ParseError),
}

#[derive(Debug, Clone)]
pub struct OAuthConfig {
    pub claude_ai_authorize_url: String,
    pub token_url: String,
    pub api_key_url: String,
    pub client_id: String,
    pub scopes: Vec<String>,
    pub redirect_uri: String,
}

impl Default for OAuthConfig {
    fn default() -> Self {
        Self {
            claude_ai_authorize_url: "https://claude.ai/oauth/authorize".to_string(),
            token_url: "https://console.anthropic.com/v1/oauth/token".to_string(),
            api_key_url: "https://api.anthropic.com/api/oauth/claude_cli/create_api_key"
                .to_string(),
            // Matches Claude Code CLI client id.
            client_id: "9d1c250a-e61b-44d9-88ed-5944d1962f5e".to_string(),
            scopes: vec![
                "org:create_api_key".to_string(),
                "user:profile".to_string(),
                "user:inference".to_string(),
            ],
            redirect_uri: "https://console.anthropic.com/oauth/code/callback".to_string(),
        }
    }
}

#[derive(Debug, Deserialize)]
pub struct ResponseOauthTokens {
    pub access_token: String,
    pub refresh_token: String,
    pub expires_in: u64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ClaudeAiOauth {
    #[serde(rename = "accessToken")]
    pub access_token: String,
    #[serde(rename = "refreshToken")]
    pub refresh_token: String,
    /// Unix epoch milliseconds.
    #[serde(rename = "expiresAt")]
    pub expires_at: i64,
    pub scopes: Vec<String>,
    #[serde(rename = "subscriptionType")]
    pub subscription_type: String,
}

/// Stored OAuth tokens for Claude Code (used by Pasture).
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct StoredOauthTokens {
    #[serde(rename = "claudeAiOauth")]
    pub claude_ai_oauth: ClaudeAiOauth,
}

#[derive(Debug, Clone)]
pub struct AuthorizeResult {
    pub url: String,
    pub verifier: String,
    pub state: String,
}
