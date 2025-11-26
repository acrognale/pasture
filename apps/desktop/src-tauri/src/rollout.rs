use std::path::Path;
use std::path::PathBuf;

use serde_json::Value;
use tokio::fs::File;
use tokio::io::AsyncBufReadExt;
use tokio::io::BufReader;

use crate::errors::AppError;
use crate::errors::AppResult;

/// Load the cwd recorded in a rollout header, falling back to the workspace path when missing.
pub(crate) async fn load_rollout_cwd(
    rollout_path: &Path,
    fallback_workspace: Option<&Path>,
) -> AppResult<PathBuf> {
    let file = match File::open(rollout_path).await {
        Ok(file) => file,
        Err(err) => {
            if let Some(workspace) = fallback_workspace {
                log::debug!(
                    "Falling back to workspace cwd {} for rollout {}: {}",
                    workspace.display(),
                    rollout_path.display(),
                    err
                );
                return Ok(PathBuf::from(workspace));
            }
            return Err(AppError::Io(err));
        }
    };

    let mut reader = BufReader::new(file);
    let mut first_line = String::new();
    let bytes_read = reader
        .read_line(&mut first_line)
        .await
        .map_err(AppError::Io)?;

    if bytes_read == 0 {
        if let Some(workspace) = fallback_workspace {
            log::debug!(
                "Rollout {} did not contain a session header, falling back to workspace cwd {}",
                rollout_path.display(),
                workspace.display()
            );
            return Ok(PathBuf::from(workspace));
        }
        return Err(AppError::Validation {
            message: format!(
                "Rollout {} did not contain a session header",
                rollout_path.display()
            ),
        });
    }

    let value: Value = match serde_json::from_str(&first_line) {
        Ok(value) => value,
        Err(err) => {
            if let Some(workspace) = fallback_workspace {
                log::debug!(
                    "Failed to parse rollout header {} ({}), falling back to workspace cwd {}",
                    rollout_path.display(),
                    err,
                    workspace.display()
                );
                return Ok(PathBuf::from(workspace));
            }
            return Err(AppError::Validation {
                message: format!("Failed to parse rollout header: {}", err),
            });
        }
    };

    if let Some(cwd_str) = value.get("cwd").and_then(|value| value.as_str()) {
        return Ok(PathBuf::from(cwd_str));
    }

    if let Some(workspace) = fallback_workspace {
        log::debug!(
            "Rollout {} header missing cwd, falling back to workspace cwd {}",
            rollout_path.display(),
            workspace.display()
        );
        return Ok(PathBuf::from(workspace));
    }

    Err(AppError::Validation {
        message: format!("Rollout {} header missing cwd", rollout_path.display()),
    })
}
