use tauri::State;

use crate::auth::AuthState;
use crate::errors::AppResult;
use crate::state::AppState;

/// Retrieve the cached authentication state.
#[tauri::command]
pub async fn get_auth_state(app: State<'_, AppState>) -> AppResult<AuthState> {
    app.auth.reload();
    Ok(AuthState::capture(&app.auth, &app.config, None).await)
}
