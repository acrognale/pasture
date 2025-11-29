use std::path::Path;
use std::path::PathBuf;

use base64::Engine;
use base64::engine::general_purpose::STANDARD as BASE64_STANDARD;
use chrono::Utc;
use serde::Deserialize;
use serde::Serialize;
use ts_rs::TS;
use uuid::Uuid;

use crate::errors::AppError;
use crate::errors::AppResult;

#[derive(Serialize, Deserialize, Debug, Clone, PartialEq, TS)]
#[serde(rename_all = "camelCase")]
pub struct SavePastedImageParams {
    pub workspace_path: String,
    pub data_base64: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub file_name: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub mime_type: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub width: Option<u32>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub height: Option<u32>,
}

#[derive(Serialize, Deserialize, Debug, Clone, PartialEq, TS)]
#[serde(rename_all = "camelCase")]
pub struct SavePastedImageResponse {
    #[ts(type = "string")]
    pub path: PathBuf,
    pub width: u32,
    pub height: u32,
    pub file_name: String,
}

#[tauri::command]
pub async fn save_pasted_image(
    params: SavePastedImageParams,
) -> AppResult<SavePastedImageResponse> {
    let SavePastedImageParams {
        workspace_path,
        data_base64,
        file_name,
        mime_type,
        width,
        height,
    } = params;

    let workspace = PathBuf::from(&workspace_path);
    if !workspace.is_dir() {
        return Err(AppError::Validation {
            message: format!("Invalid workspace path: {}", workspace_path),
        });
    }

    let target_dir = workspace.join(".codex-images");
    if let Err(error) = tokio::fs::create_dir_all(&target_dir).await {
        return Err(AppError::Io(error));
    }

    let image_bytes = decode_image_bytes(&data_base64)?;
    let extension = resolve_extension(file_name.as_deref(), mime_type.as_deref());
    let unique_name = unique_file_name(file_name.as_deref(), &extension);
    let full_path = target_dir.join(unique_name);
    let resolved_file_name = full_path
        .file_name()
        .and_then(|name| name.to_str())
        .unwrap_or("pasted-image")
        .to_string();

    tokio::fs::write(&full_path, image_bytes).await?;

    Ok(SavePastedImageResponse {
        path: full_path,
        width: width.unwrap_or(0),
        height: height.unwrap_or(0),
        file_name: resolved_file_name,
    })
}

fn decode_image_bytes(value: &str) -> AppResult<Vec<u8>> {
    let trimmed = value.trim();
    let payload = match trimmed.split_once(',') {
        Some((_, data)) if trimmed.starts_with("data:") => data,
        _ => trimmed,
    };

    BASE64_STANDARD
        .decode(payload)
        .map_err(|error| AppError::Validation {
            message: format!("Failed to decode image data: {}", error),
        })
}

fn resolve_extension(file_name: Option<&str>, mime_type: Option<&str>) -> String {
    if let Some(name) = file_name {
        if let Some(ext) = Path::new(name)
            .extension()
            .and_then(|ext| ext.to_str())
            .filter(|ext| !ext.is_empty())
        {
            return ext.trim_start_matches('.').to_ascii_lowercase();
        }
    }

    match mime_type
        .and_then(|mime| mime.split(';').next())
        .map(|mime| mime.trim().to_ascii_lowercase())
        .as_deref()
    {
        Some("image/jpeg") | Some("image/jpg") => "jpg".to_string(),
        Some("image/webp") => "webp".to_string(),
        Some("image/gif") => "gif".to_string(),
        Some("image/bmp") => "bmp".to_string(),
        Some("image/tiff") => "tiff".to_string(),
        _ => "png".to_string(),
    }
}

fn unique_file_name(file_name: Option<&str>, extension: &str) -> String {
    let stem = file_name
        .and_then(|name| Path::new(name).file_stem())
        .and_then(|stem| stem.to_str())
        .map(|stem| stem.replace(['/', '\\'], "_"))
        .filter(|stem| !stem.trim().is_empty())
        .unwrap_or_else(|| "pasted-image".to_string());

    let timestamp = Utc::now().timestamp_millis();
    let suffix = Uuid::new_v4();
    format!("{stem}-{timestamp}-{suffix}.{extension}")
}
