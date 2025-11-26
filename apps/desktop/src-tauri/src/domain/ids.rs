use std::fmt;
use std::path::Path;

use serde::{Deserialize, Serialize};
use ts_rs::TS;

use crate::errors::{AppError, AppResult};

#[derive(Debug, Clone, PartialEq, Eq, Hash, Serialize, Deserialize, TS)]
#[serde(transparent)]
pub struct ThreadId(pub String);

impl ThreadId {
    pub fn as_str(&self) -> &str {
        &self.0
    }
}

impl From<String> for ThreadId {
    fn from(value: String) -> Self {
        Self(value)
    }
}

impl From<ThreadId> for String {
    fn from(value: ThreadId) -> Self {
        value.0
    }
}

impl fmt::Display for ThreadId {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        write!(f, "{}", self.0)
    }
}

#[derive(Debug, Clone, PartialEq, Eq, Hash, Serialize, Deserialize)]
#[serde(transparent)]
pub struct WorkspacePath(pub String);

impl WorkspacePath {
    pub fn canonicalize(path: &str) -> AppResult<Self> {
        let resolved = Path::new(path)
            .canonicalize()
            .map_err(|e| AppError::Validation {
                message: format!("Failed to resolve workspace path {}: {}", path, e),
            })?;

        if !resolved.is_dir() {
            return Err(AppError::Validation {
                message: format!(
                    "Workspace path must be a directory: {}",
                    resolved.to_string_lossy()
                ),
            });
        }

        Ok(Self(resolved.to_string_lossy().to_string()))
    }

    pub fn as_str(&self) -> &str {
        &self.0
    }

    pub fn into_string(self) -> String {
        self.0
    }
}

impl From<WorkspacePath> for String {
    fn from(value: WorkspacePath) -> Self {
        value.0
    }
}

impl fmt::Display for WorkspacePath {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        write!(f, "{}", self.0)
    }
}
