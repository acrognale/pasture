pub mod init;
pub mod schema;
pub mod snapshots_repo;
pub mod threads;
pub mod threads_repo;
pub mod workspace;
pub mod workspaces_repo;

pub use snapshots_repo::{TurnSnapshot, TurnSnapshotRepo};
pub use threads_repo::ThreadRepo;
pub use workspaces_repo::{WorkspaceRepo, WorkspaceSettingsRepo};

use sea_orm::DbErr;

use crate::errors::AppError;

pub(crate) fn db_err(context: &str, err: DbErr) -> AppError {
    AppError::Database(DbErr::Custom(format!("{context}: {err}")))
}
