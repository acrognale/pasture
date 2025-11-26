use std::io;

use sea_orm::DbErr;
use serde::Serialize;
use serde::ser::SerializeStruct;
use thiserror::Error;

pub type AppResult<T> = Result<T, AppError>;

#[derive(Debug, Error)]
pub enum AppError {
    #[error("Database error: {0}")]
    Database(#[from] DbErr),
    #[error("{entity} not found")]
    NotFound { entity: &'static str },
    #[error("Validation failed: {message}")]
    Validation { message: String },
    #[error("Codex error: {0}")]
    Codex(String),
    #[error("I/O error: {0}")]
    Io(#[from] io::Error),
    #[error(transparent)]
    Internal(#[from] anyhow::Error),
}

impl AppError {
    pub fn code(&self) -> &'static str {
        match self {
            AppError::Database(_) => "database",
            AppError::NotFound { .. } => "not_found",
            AppError::Validation { .. } => "validation",
            AppError::Codex(_) => "codex",
            AppError::Io(_) => "io",
            AppError::Internal(_) => "internal",
        }
    }
}

impl Serialize for AppError {
    fn serialize<S>(&self, serializer: S) -> Result<S::Ok, S::Error>
    where
        S: serde::Serializer,
    {
        let mut state = serializer.serialize_struct("AppError", 2)?;
        state.serialize_field("code", self.code())?;
        state.serialize_field("message", &self.to_string())?;
        state.end()
    }
}

impl From<tokio::task::JoinError> for AppError {
    fn from(value: tokio::task::JoinError) -> Self {
        AppError::Internal(anyhow::Error::new(value))
    }
}
