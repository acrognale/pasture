use sea_orm_migration::prelude::*;
use sea_orm_migration::sea_orm::DbBackend;

const TEMP_TABLE: &str = "conversations__rollout_path_nullable_migration";

#[derive(DeriveMigrationName)]
pub struct Migration;

#[async_trait::async_trait]
impl MigrationTrait for Migration {
    async fn up(&self, manager: &SchemaManager) -> Result<(), DbErr> {
        match manager.get_database_backend() {
            DbBackend::Sqlite => rebuild_conversations_table(manager, true).await?,
            _ => {
                manager
                    .alter_table(
                        Table::alter()
                            .table(Conversations::Table)
                            .modify_column(
                                ColumnDef::new(Conversations::RolloutPath).string().null(),
                            )
                            .to_owned(),
                    )
                    .await?;
            }
        }
        Ok(())
    }

    async fn down(&self, manager: &SchemaManager) -> Result<(), DbErr> {
        match manager.get_database_backend() {
            DbBackend::Sqlite => rebuild_conversations_table(manager, false).await?,
            _ => {
                // Ensure the rollback doesn't fail due to NULL values.
                manager
                    .get_connection()
                    .execute_unprepared(
                        "UPDATE conversations SET rollout_path = '' WHERE rollout_path IS NULL",
                    )
                    .await?;

                manager
                    .alter_table(
                        Table::alter()
                            .table(Conversations::Table)
                            .modify_column(
                                ColumnDef::new(Conversations::RolloutPath)
                                    .string()
                                    .not_null()
                                    .default(""),
                            )
                            .to_owned(),
                    )
                    .await?;
            }
        }
        Ok(())
    }
}

async fn rebuild_conversations_table(
    manager: &SchemaManager<'_>,
    rollout_nullable: bool,
) -> Result<(), DbErr> {
    let rollout_column = if rollout_nullable {
        "rollout_path TEXT NULL"
    } else {
        "rollout_path TEXT NOT NULL DEFAULT ''"
    };

    let connection = manager.get_connection();

    // SQLite cannot modify a column in-place; rebuild the table.
    connection
        .execute_unprepared("PRAGMA foreign_keys=OFF")
        .await?;
    connection
        .execute_unprepared(&format!("DROP TABLE IF EXISTS {TEMP_TABLE}"))
        .await?;
    connection
        .execute_unprepared(&format!(
            "CREATE TABLE {TEMP_TABLE} (
                id TEXT NOT NULL PRIMARY KEY,
                thread_id TEXT NOT NULL,
                {rollout_column},
                created_at TEXT NOT NULL,
                label TEXT NULL,
                parent_conversation_id TEXT NULL,
                forked_at_nth_user_message INTEGER NULL,
                base_commit TEXT NULL,
                snapshots_disabled INTEGER NOT NULL DEFAULT 0,
                FOREIGN KEY(thread_id) REFERENCES threads(id) ON DELETE CASCADE
            )"
        ))
        .await?;

    let select_rollout_path = if rollout_nullable {
        "rollout_path"
    } else {
        "COALESCE(rollout_path, '')"
    };

    connection
        .execute_unprepared(&format!(
            "INSERT INTO {TEMP_TABLE} (
                id,
                thread_id,
                rollout_path,
                created_at,
                label,
                parent_conversation_id,
                forked_at_nth_user_message,
                base_commit,
                snapshots_disabled
            )
            SELECT
                id,
                thread_id,
                {select_rollout_path},
                created_at,
                label,
                parent_conversation_id,
                forked_at_nth_user_message,
                base_commit,
                snapshots_disabled
            FROM conversations"
        ))
        .await?;

    connection
        .execute_unprepared("DROP TABLE conversations")
        .await?;
    connection
        .execute_unprepared(&format!("ALTER TABLE {TEMP_TABLE} RENAME TO conversations"))
        .await?;
    connection
        .execute_unprepared("PRAGMA foreign_keys=ON")
        .await?;

    Ok(())
}

#[derive(DeriveIden)]
enum Conversations {
    Table,
    RolloutPath,
}
