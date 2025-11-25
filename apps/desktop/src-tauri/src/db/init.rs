use std::path::Path;

use sea_orm::Database;
use sea_orm::DatabaseConnection;
use sea_orm::DbErr;

use migration::Migrator;
use sea_orm_migration::MigratorTrait;

use crate::errors::{AppError, AppResult};

/// Establish a SQLite connection and run baseline migrations.
pub async fn connect_and_migrate(db_path: &Path) -> AppResult<DatabaseConnection> {
    if let Some(parent) = db_path.parent() {
        tokio::fs::create_dir_all(parent).await?;
    }

    // Use rw-create mode to create the file if it does not exist.
    let url = format!("sqlite://{}?mode=rwc", db_path.to_string_lossy());
    let db = Database::connect(&url).await.map_err(|e| {
        AppError::Database(DbErr::Custom(format!(
            "Failed to connect to SQLite at {}: {e}",
            db_path.display()
        )))
    })?;

    Migrator::up(&db, None)
        .await
        .map_err(|e| db_error("Failed to run workspace migrations", e))?;

    Ok(db)
}

fn db_error(context: &str, err: DbErr) -> AppError {
    AppError::Database(DbErr::Custom(format!("{context}: {err}")))
}
