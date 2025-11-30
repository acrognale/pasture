use sea_orm_migration::prelude::*;

#[derive(DeriveMigrationName)]
pub struct Migration;

#[async_trait::async_trait]
impl MigrationTrait for Migration {
    async fn up(&self, manager: &SchemaManager) -> Result<(), DbErr> {
        // SQLite only permits one alter operation per statement, so add columns individually.
        manager
            .alter_table(
                Table::alter()
                    .table(Threads::Table)
                    .add_column(ColumnDef::new(Threads::Model).string().null())
                    .to_owned(),
            )
            .await?;

        manager
            .alter_table(
                Table::alter()
                    .table(Threads::Table)
                    .add_column(ColumnDef::new(Threads::ReasoningEffort).string().null())
                    .to_owned(),
            )
            .await?;

        manager
            .alter_table(
                Table::alter()
                    .table(Threads::Table)
                    .add_column(ColumnDef::new(Threads::ReasoningSummary).string().null())
                    .to_owned(),
            )
            .await?;

        manager
            .alter_table(
                Table::alter()
                    .table(Threads::Table)
                    .add_column(ColumnDef::new(Threads::Sandbox).string().null())
                    .to_owned(),
            )
            .await?;

        manager
            .alter_table(
                Table::alter()
                    .table(Threads::Table)
                    .add_column(ColumnDef::new(Threads::Approval).string().null())
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
                    .drop_column(Threads::Model)
                    .drop_column(Threads::ReasoningEffort)
                    .drop_column(Threads::ReasoningSummary)
                    .drop_column(Threads::Sandbox)
                    .drop_column(Threads::Approval)
                    .to_owned(),
            )
            .await?;

        Ok(())
    }
}

#[derive(DeriveIden)]
enum Threads {
    Table,
    Model,
    ReasoningEffort,
    ReasoningSummary,
    Sandbox,
    Approval,
}
