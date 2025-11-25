use std::fmt;
use std::path::Path;

use codex_protocol::ConversationId;
use serde::{Deserialize, Serialize};

use crate::errors::{AppError, AppResult};

#[derive(Debug, Clone, PartialEq, Eq, Hash, Serialize, Deserialize)]
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
pub struct ForkId(pub String);

impl ForkId {
    pub fn as_str(&self) -> &str {
        &self.0
    }
}

impl From<ConversationId> for ForkId {
    fn from(value: ConversationId) -> Self {
        Self(value.to_string())
    }
}

impl TryFrom<ForkId> for ConversationId {
    type Error = AppError;

    fn try_from(value: ForkId) -> AppResult<Self> {
        ConversationId::from_string(&value.0).map_err(|e| AppError::Validation {
            message: format!("Invalid fork id: {e}"),
        })
    }
}

impl TryFrom<&ForkId> for ConversationId {
    type Error = AppError;

    fn try_from(value: &ForkId) -> AppResult<Self> {
        ConversationId::from_string(value.as_str()).map_err(|e| AppError::Validation {
            message: format!("Invalid fork id: {e}"),
        })
    }
}

impl From<String> for ForkId {
    fn from(value: String) -> Self {
        Self(value)
    }
}

impl From<ForkId> for String {
    fn from(value: ForkId) -> Self {
        value.0
    }
}

impl fmt::Display for ForkId {
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
