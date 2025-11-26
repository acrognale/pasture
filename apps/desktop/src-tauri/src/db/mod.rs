pub mod init;
pub mod schema;

use sea_orm::DbErr;

use crate::errors::AppError;

pub(crate) fn db_err(context: &str, err: DbErr) -> AppError {
    AppError::Database(DbErr::Custom(format!("{context}: {err}")))
}
