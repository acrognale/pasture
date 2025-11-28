use serde::Serialize;
use tauri::AppHandle;
use tauri_plugin_updater::UpdaterExt;
use ts_rs::TS;

use crate::errors::AppError;
use crate::errors::AppResult;

#[derive(Debug, Serialize, TS)]
pub struct UpdateInfo {
    pub version: String,
    pub current_version: String,
    pub body: Option<String>,
    pub date: Option<String>,
}

/// Check for available updates.
/// Returns Some(UpdateInfo) if an update is available, None otherwise.
#[tauri::command]
pub async fn check_for_update(app: AppHandle) -> AppResult<Option<UpdateInfo>> {
    let updater = app
        .updater_builder()
        .build()
        .map_err(|e| AppError::Internal(anyhow::anyhow!("Failed to create updater: {}", e)))?;

    match updater.check().await {
        Ok(Some(update)) => Ok(Some(UpdateInfo {
            version: update.version.clone(),
            current_version: update.current_version.clone(),
            body: update.body.clone(),
            date: update.date.and_then(|d| {
                d.format(&time::format_description::well_known::Rfc3339)
                    .ok()
            }),
        })),
        Ok(None) => Ok(None),
        Err(e) => Err(AppError::Internal(anyhow::anyhow!(
            "Update check failed: {}",
            e
        ))),
    }
}

/// Download and install an available update.
/// The app will need to be restarted after installation.
#[tauri::command]
pub async fn install_update(app: AppHandle) -> AppResult<()> {
    let updater = app
        .updater_builder()
        .build()
        .map_err(|e| AppError::Internal(anyhow::anyhow!("Failed to create updater: {}", e)))?;

    let update = updater
        .check()
        .await
        .map_err(|e| AppError::Internal(anyhow::anyhow!("Failed to check for update: {}", e)))?;

    if let Some(update) = update {
        update
            .download_and_install(|_bytes_downloaded, _total_bytes| {}, || {})
            .await
            .map_err(|e| AppError::Internal(anyhow::anyhow!("Failed to install update: {}", e)))?;
    }

    Ok(())
}
