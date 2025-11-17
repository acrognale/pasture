use codex_core::auth::CodexAuth;
use serde::Deserialize;
use serde::Serialize;
use tauri::State;
use ts_rs::TS;

use crate::codex_runtime::CodexRuntime;

use super::util::CommandResult;

/// Authentication method currently active for the workspace.
#[derive(Serialize, Deserialize, Debug, Clone, PartialEq, Eq, TS)]
#[serde(rename_all = "kebab-case")]
pub enum AuthMode {
    #[serde(rename = "api-key")]
    #[ts(rename = "api-key")]
    ApiKey,
    #[serde(rename = "chatgpt")]
    #[ts(rename = "chatgpt")]
    ChatGpt,
}

/// Authentication status returned to the renderer.
#[derive(Serialize, Deserialize, Debug, Clone, PartialEq, TS)]
#[serde(rename_all = "camelCase")]
pub struct AuthState {
    pub is_authenticated: bool,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub mode: Option<AuthMode>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub email: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub plan_type: Option<String>,
    pub requires_auth: bool,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub last_error: Option<String>,
}

impl AuthState {
    pub(crate) async fn capture(runtime: &CodexRuntime, error: Option<String>) -> Self {
        let auth = runtime.auth_manager().auth();
        let (mode, email, plan_type) = derive_auth_details(auth.clone()).await;
        let requires_auth = runtime.config().model_provider.requires_openai_auth && auth.is_none();

        Self {
            is_authenticated: auth.is_some(),
            mode,
            email,
            plan_type,
            requires_auth,
            last_error: error,
        }
    }
}

async fn derive_auth_details(
    auth: Option<CodexAuth>,
) -> (Option<AuthMode>, Option<String>, Option<String>) {
    match auth {
        None => (None, None, None),
        Some(auth) => {
            let mode = infer_auth_mode(&auth);
            let email = auth.get_account_email();

            let plan_type = match auth.get_token_data().await {
                Ok(token_data) => token_data.id_token.get_chatgpt_plan_type(),
                Err(_) => None,
            };

            (mode, email, plan_type)
        }
    }
}

fn infer_auth_mode(auth: &CodexAuth) -> Option<AuthMode> {
    let label = format!("{:?}", auth.mode);
    if label.eq_ignore_ascii_case("apikey") || label.eq_ignore_ascii_case("api_key") {
        Some(AuthMode::ApiKey)
    } else if label.eq_ignore_ascii_case("chatgpt") {
        Some(AuthMode::ChatGpt)
    } else {
        None
    }
}

/// Retrieve the cached authentication state.
#[tauri::command]
pub async fn get_auth_state(runtime: State<'_, CodexRuntime>) -> CommandResult<AuthState> {
    runtime.auth_manager().reload();
    Ok(AuthState::capture(&runtime, None).await)
}
