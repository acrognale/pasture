use sea_orm_migration::prelude::*;

#[derive(DeriveMigrationName)]
pub struct Migration;

#[async_trait::async_trait]
impl MigrationTrait for Migration {
    async fn up(&self, manager: &SchemaManager) -> Result<(), DbErr> {
        manager
            .alter_table(
                Table::alter()
                    .table(Conversations::Table)
                    .modify_column(ColumnDef::new(Conversations::RolloutPath).string().null())
                    .to_owned(),
            )
            .await?;
        Ok(())
    }

    async fn down(&self, manager: &SchemaManager) -> Result<(), DbErr> {
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
        Ok(())
    }
}

#[derive(DeriveIden)]
enum Conversations {
    Table,
    RolloutPath,
}
