use chrono::Utc;
use reqwest::Client;
use url::Url;

use crate::oauth::pkce::generate_pkce;
use crate::oauth::types::AuthorizeResult;
use crate::oauth::types::ClaudeAiOauth;
use crate::oauth::types::OAuthConfig;
use crate::oauth::types::OAuthError;
use crate::oauth::types::ResponseOauthTokens;
use crate::oauth::types::StoredOauthTokens;

/// Anthropic OAuth service (authorize URL + code exchange + refresh).
#[derive(Clone)]
pub struct OAuthService {
    client: Client,
    config: OAuthConfig,
}

impl OAuthService {
    pub fn new() -> Self {
        Self {
            client: Client::new(),
            config: OAuthConfig::default(),
        }
    }

    pub fn with_config(config: OAuthConfig) -> Self {
        Self {
            client: Client::new(),
            config,
        }
    }

    pub fn with_client(client: Client) -> Self {
        Self {
            client,
            config: OAuthConfig::default(),
        }
    }

    pub fn with_config_and_client(config: OAuthConfig, client: Client) -> Self {
        Self { client, config }
    }

    pub async fn authorize(&self) -> Result<AuthorizeResult, OAuthError> {
        let pkce = generate_pkce(None)?;
        // Keep parity with existing Pasture behavior: use verifier as state.
        let state = pkce.verifier.clone();

        let mut auth_url = Url::parse(&self.config.claude_ai_authorize_url)?;
        auth_url
            .query_pairs_mut()
            .append_pair("code", "true")
            .append_pair("client_id", &self.config.client_id)
            .append_pair("response_type", "code")
            .append_pair("redirect_uri", &self.config.redirect_uri)
            .append_pair("scope", &self.config.scopes.join(" "))
            .append_pair("code_challenge", &pkce.challenge)
            .append_pair("code_challenge_method", "S256")
            .append_pair("state", &state);

        Ok(AuthorizeResult {
            url: auth_url.to_string(),
            verifier: pkce.verifier,
            state,
        })
    }

    pub async fn exchange(
        &self,
        code: &str,
        verifier: &str,
    ) -> Result<StoredOauthTokens, OAuthError> {
        // Some environments send `code#state` — keep parity with prior implementation.
        let splits: Vec<&str> = code.split('#').collect();
        let code_part = splits[0];
        let state_part = splits.get(1).copied().unwrap_or_default();

        let request_body = serde_json::json!({
            "code": code_part,
            "state": state_part,
            "grant_type": "authorization_code",
            "client_id": self.config.client_id,
            "redirect_uri": self.config.redirect_uri,
            "code_verifier": verifier
        });

        let response = self
            .client
            .post(&self.config.token_url)
            .header("Content-Type", "application/json")
            .json(&request_body)
            .send()
            .await?;

        if !response.status().is_success() {
            let error_text = response.text().await.unwrap_or_default();
            return Err(OAuthError::TokenExchange(error_text));
        }

        let tokens: ResponseOauthTokens = response.json().await?;
        Ok(to_stored_tokens(tokens))
    }

    pub async fn refresh(&self, refresh_token: &str) -> Result<StoredOauthTokens, OAuthError> {
        let form_data = [
            ("grant_type", "refresh_token"),
            ("client_id", self.config.client_id.as_str()),
            ("refresh_token", refresh_token),
        ];

        let response = self
            .client
            .post(&self.config.token_url)
            .header("Content-Type", "application/x-www-form-urlencoded")
            .form(&form_data)
            .send()
            .await?;

        if !response.status().is_success() {
            let status = response.status();
            let error_text = response.text().await.unwrap_or_default();
            return Err(OAuthError::TokenRefresh(format!("{status}: {error_text}")));
        }

        let tokens: ResponseOauthTokens = response.json().await?;
        Ok(to_stored_tokens(tokens))
    }

    pub async fn create_api_key(
        &self,
        access_token: &str,
        name: Option<&str>,
    ) -> Result<String, OAuthError> {
        let default_name = format!("Pasture - {}", Utc::now().to_rfc3339());
        let name = name.unwrap_or(&default_name);

        let request_body = serde_json::json!({ "name": name });
        let response = self
            .client
            .post(&self.config.api_key_url)
            .header("Authorization", format!("Bearer {access_token}"))
            .header("Content-Type", "application/json")
            .json(&request_body)
            .send()
            .await?;

        if !response.status().is_success() {
            let status = response.status();
            let error_text = response.text().await.unwrap_or_default();
            return Err(OAuthError::Config(format!(
                "api key creation failed: {status}: {error_text}"
            )));
        }

        let result: serde_json::Value = response.json().await?;
        result
            .get("api_key")
            .and_then(|k| k.as_str())
            .map(|s| s.to_string())
            .ok_or_else(|| OAuthError::Config("no api_key in response".to_string()))
    }
}

impl Default for OAuthService {
    fn default() -> Self {
        Self::new()
    }
}

fn to_stored_tokens(tokens: ResponseOauthTokens) -> StoredOauthTokens {
    StoredOauthTokens {
        claude_ai_oauth: ClaudeAiOauth {
            access_token: tokens.access_token,
            refresh_token: tokens.refresh_token,
            expires_at: Utc::now().timestamp_millis() + (tokens.expires_in as i64 * 1000),
            // Preserve existing Pasture defaults.
            scopes: vec!["user:inference".to_string(), "user:profile".to_string()],
            subscription_type: "max".to_string(),
        },
    }
}
