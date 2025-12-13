use sea_orm_migration::prelude::*;

#[derive(DeriveMigrationName)]
pub struct Migration;

#[async_trait::async_trait]
impl MigrationTrait for Migration {
    async fn up(&self, manager: &SchemaManager) -> Result<(), DbErr> {
        manager
            .alter_table(
                Table::alter()
                    .table(WorkspaceSettings::Table)
                    .add_column(
                        ColumnDef::new(WorkspaceSettings::ModelProviderId)
                            .string()
                            .null(),
                    )
                    .to_owned(),
            )
            .await?;

        manager
            .alter_table(
                Table::alter()
                    .table(Threads::Table)
                    .add_column(ColumnDef::new(Threads::ModelProviderId).string().null())
                    .to_owned(),
            )
            .await?;

        Ok(())
    }

    async fn down(&self, manager: &SchemaManager) -> Result<(), DbErr> {
        manager
            .alter_table(
                Table::alter()
                    .table(Threads::Table)
                    .drop_column(Threads::ModelProviderId)
                    .to_owned(),
            )
            .await?;

        manager
            .alter_table(
                Table::alter()
                    .table(WorkspaceSettings::Table)
                    .drop_column(WorkspaceSettings::ModelProviderId)
                    .to_owned(),
            )
            .await?;

        Ok(())
    }
}

#[derive(DeriveIden)]
enum WorkspaceSettings {
    Table,
    ModelProviderId,
}

#[derive(DeriveIden)]
enum Threads {
    Table,
    ModelProviderId,
}
