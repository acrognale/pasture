use sea_orm_migration::prelude::*;

#[derive(DeriveMigrationName)]
pub struct Migration;

#[async_trait::async_trait]
impl MigrationTrait for Migration {
    async fn up(&self, manager: &SchemaManager) -> Result<(), DbErr> {
        manager
            .alter_table(
                Table::alter()
                    .table(Threads::Table)
                    .add_column(ColumnDef::new(Threads::GitRepoRoot).string().null())
                    .add_column(ColumnDef::new(Threads::GitHeadSha).string().null())
                    .add_column(ColumnDef::new(Threads::GitHeadRef).string().null())
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
                    .drop_column(Threads::GitRepoRoot)
                    .drop_column(Threads::GitHeadSha)
                    .drop_column(Threads::GitHeadRef)
                    .to_owned(),
            )
            .await?;

        Ok(())
    }
}

#[derive(DeriveIden)]
enum Threads {
    Table,
    GitRepoRoot,
    GitHeadSha,
    GitHeadRef,
}
