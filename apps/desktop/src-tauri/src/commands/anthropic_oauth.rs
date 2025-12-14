use serde::Deserialize;
use serde::Serialize;
use tauri::State;
use ts_rs::TS;

use crate::errors::AppError;
use crate::errors::AppResult;
use crate::state::AppState;

#[derive(Debug, Clone, Serialize, Deserialize, TS)]
#[serde(rename_all = "camelCase")]
pub struct AnthropicOauthAuthorizeResponse {
    pub url: String,
    pub verifier: String,
}

#[derive(Debug, Clone, Serialize, Deserialize, TS)]
#[serde(rename_all = "camelCase")]
pub struct AnthropicOauthExchangeParams {
    pub code: String,
    pub verifier: String,
}

#[derive(Debug, Clone, Serialize, Deserialize, TS)]
#[serde(rename_all = "camelCase")]
pub struct AnthropicOauthStatus {
    pub is_authenticated: bool,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub expires_at: Option<i64>,
    pub is_expired: bool,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub last_error: Option<String>,
}

#[tauri::command]
pub async fn anthropic_oauth_authorize(
    app: State<'_, AppState>,
) -> AppResult<AnthropicOauthAuthorizeResponse> {
    let oauth = codex_core::anthropic_oauth::AnthropicOAuth::new(
        app.config.codex_home.clone(),
        app.config.cli_auth_credentials_store_mode,
    );

    let result = oauth
        .authorize()
        .await
        .map_err(|e| AppError::Codex(format!("Failed to start Anthropic OAuth: {e}")))?;

    Ok(AnthropicOauthAuthorizeResponse {
        url: result.url,
        verifier: result.verifier,
    })
}

#[tauri::command]
pub async fn anthropic_oauth_exchange(
    app: State<'_, AppState>,
    params: AnthropicOauthExchangeParams,
) -> AppResult<AnthropicOauthStatus> {
    let oauth = codex_core::anthropic_oauth::AnthropicOAuth::new(
        app.config.codex_home.clone(),
        app.config.cli_auth_credentials_store_mode,
    );

    let tokens = oauth
        .exchange_and_store(&params.code, &params.verifier)
        .await
        .map_err(|e| AppError::Codex(format!("Failed to complete Anthropic OAuth: {e}")))?;

    let expires_at = tokens.claude_ai_oauth.expires_at;
    Ok(AnthropicOauthStatus {
        is_authenticated: true,
        expires_at: Some(expires_at),
        is_expired: codex_core::anthropic_oauth::is_token_expired(expires_at),
        last_error: None,
    })
}

#[tauri::command]
pub async fn anthropic_oauth_status(app: State<'_, AppState>) -> AppResult<AnthropicOauthStatus> {
    let oauth = codex_core::anthropic_oauth::AnthropicOAuth::new(
        app.config.codex_home.clone(),
        app.config.cli_auth_credentials_store_mode,
    );

    match oauth.status().await {
        Ok(Some(status)) => Ok(AnthropicOauthStatus {
            is_authenticated: true,
            expires_at: Some(status.expires_at),
            is_expired: codex_core::anthropic_oauth::is_token_expired(status.expires_at),
            last_error: None,
        }),
        Ok(None) => Ok(AnthropicOauthStatus {
            is_authenticated: false,
            expires_at: None,
            is_expired: true,
            last_error: None,
        }),
        Err(err) => Ok(AnthropicOauthStatus {
            is_authenticated: false,
            expires_at: None,
            is_expired: true,
            last_error: Some(err.to_string()),
        }),
    }
}

#[tauri::command]
pub async fn anthropic_oauth_logout(app: State<'_, AppState>) -> AppResult<()> {
    let oauth = codex_core::anthropic_oauth::AnthropicOAuth::new(
        app.config.codex_home.clone(),
        app.config.cli_auth_credentials_store_mode,
    );
    oauth
        .logout()
        .await
        .map_err(|e| AppError::Codex(format!("Failed to log out of Anthropic OAuth: {e}")))?;
    Ok(())
}
