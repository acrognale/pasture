use std::path::Path;

use anyhow::Context;
use anyhow::Result;
use sea_orm::Database;
use sea_orm::DatabaseConnection;

use migration::Migrator;
use sea_orm_migration::MigratorTrait;

/// Establish a SQLite connection and run baseline migrations.
pub async fn connect_and_migrate(db_path: &Path) -> Result<DatabaseConnection> {
    if let Some(parent) = db_path.parent() {
        tokio::fs::create_dir_all(parent)
            .await
            .context("Failed to create workspace DB directory")?;
    }

    // Use rw-create mode to create the file if it does not exist.
    let url = format!("sqlite://{}?mode=rwc", db_path.to_string_lossy());
    let db = Database::connect(&url)
        .await
        .with_context(|| format!("Failed to connect to SQLite at {}", db_path.display()))?;

    Migrator::up(&db, None)
        .await
        .context("Failed to run workspace migrations")?;

    Ok(db)
}
