use sea_orm_migration::prelude::*;

#[derive(DeriveMigrationName)]
pub struct Migration;

#[async_trait::async_trait]
impl MigrationTrait for Migration {
    async fn up(&self, manager: &SchemaManager) -> Result<(), DbErr> {
        // workspaces
        manager
            .create_table(
                Table::create()
                    .table(Workspaces::Table)
                    .if_not_exists()
                    .col(
                        ColumnDef::new(Workspaces::Path)
                            .string()
                            .not_null()
                            .primary_key(),
                    )
                    .col(ColumnDef::new(Workspaces::LastAccessed).string().not_null())
                    .to_owned(),
            )
            .await?;

        // workspace_settings
        manager
            .create_table(
                Table::create()
                    .table(WorkspaceSettings::Table)
                    .if_not_exists()
                    .col(
                        ColumnDef::new(WorkspaceSettings::WorkspacePath)
                            .string()
                            .not_null()
                            .primary_key(),
                    )
                    .col(ColumnDef::new(WorkspaceSettings::Model).string().null())
                    .col(
                        ColumnDef::new(WorkspaceSettings::ReasoningEffort)
                            .string()
                            .null(),
                    )
                    .col(
                        ColumnDef::new(WorkspaceSettings::ReasoningSummary)
                            .string()
                            .null(),
                    )
                    .col(ColumnDef::new(WorkspaceSettings::Sandbox).string().null())
                    .col(ColumnDef::new(WorkspaceSettings::Approval).string().null())
                    .foreign_key(
                        ForeignKey::create()
                            .name("fk-workspace_settings-workspace")
                            .from(WorkspaceSettings::Table, WorkspaceSettings::WorkspacePath)
                            .to(Workspaces::Table, Workspaces::Path)
                            .on_delete(ForeignKeyAction::Cascade),
                    )
                    .to_owned(),
            )
            .await?;

        // threads
        manager
            .create_table(
                Table::create()
                    .table(Threads::Table)
                    .if_not_exists()
                    .col(
                        ColumnDef::new(Threads::Id)
                            .string()
                            .not_null()
                            .primary_key(),
                    )
                    .col(ColumnDef::new(Threads::WorkspacePath).string().not_null())
                    .col(ColumnDef::new(Threads::CreatedAt).string().not_null())
                    .col(ColumnDef::new(Threads::UpdatedAt).string().not_null())
                    .col(ColumnDef::new(Threads::CurrentForkId).string().not_null())
                    .col(ColumnDef::new(Threads::Title).string().null())
                    .col(ColumnDef::new(Threads::Preview).string().null())
                    .foreign_key(
                        ForeignKey::create()
                            .name("fk-threads-workspace")
                            .from(Threads::Table, Threads::WorkspacePath)
                            .to(Workspaces::Table, Workspaces::Path)
                            .on_delete(ForeignKeyAction::Cascade),
                    )
                    .to_owned(),
            )
            .await?;

        // forks
        manager
            .create_table(
                Table::create()
                    .table(Forks::Table)
                    .if_not_exists()
                    .col(ColumnDef::new(Forks::Id).string().not_null().primary_key())
                    .col(ColumnDef::new(Forks::ThreadId).string().not_null())
                    .col(ColumnDef::new(Forks::RolloutPath).string().not_null())
                    .col(ColumnDef::new(Forks::CreatedAt).string().not_null())
                    .col(ColumnDef::new(Forks::Label).string().null())
                    .col(ColumnDef::new(Forks::ForkedFromForkId).string().null())
                    .col(
                        ColumnDef::new(Forks::ForkedFromAfterMessage)
                            .integer()
                            .null(),
                    )
                    .col(ColumnDef::new(Forks::BaseCommit).string().null())
                    .col(
                        ColumnDef::new(Forks::SnapshotsDisabled)
                            .integer()
                            .not_null()
                            .default(0),
                    )
                    .foreign_key(
                        ForeignKey::create()
                            .name("fk-forks-thread")
                            .from(Forks::Table, Forks::ThreadId)
                            .to(Threads::Table, Threads::Id)
                            .on_delete(ForeignKeyAction::Cascade),
                    )
                    .to_owned(),
            )
            .await?;

        // turn_snapshots
        manager
            .create_table(
                Table::create()
                    .table(TurnSnapshots::Table)
                    .if_not_exists()
                    .col(
                        ColumnDef::new(TurnSnapshots::Id)
                            .integer()
                            .not_null()
                            .auto_increment()
                            .primary_key(),
                    )
                    .col(ColumnDef::new(TurnSnapshots::ForkId).string().not_null())
                    .col(ColumnDef::new(TurnSnapshots::EventId).string().not_null())
                    .col(ColumnDef::new(TurnSnapshots::CommitSha).string().not_null())
                    .col(ColumnDef::new(TurnSnapshots::CreatedAt).string().not_null())
                    .foreign_key(
                        ForeignKey::create()
                            .name("fk-turn_snapshots-fork")
                            .from(TurnSnapshots::Table, TurnSnapshots::ForkId)
                            .to(Forks::Table, Forks::Id)
                            .on_delete(ForeignKeyAction::Cascade),
                    )
                    .to_owned(),
            )
            .await?;

        manager
            .create_index(
                Index::create()
                    .name("idx-turn_snapshots-fork-event")
                    .table(TurnSnapshots::Table)
                    .col(TurnSnapshots::ForkId)
                    .col(TurnSnapshots::EventId)
                    .unique()
                    .to_owned(),
            )
            .await?;

        Ok(())
    }

    async fn down(&self, manager: &SchemaManager) -> Result<(), DbErr> {
        manager
            .drop_index(
                Index::drop()
                    .name("idx-turn_snapshots-fork-event")
                    .table(TurnSnapshots::Table)
                    .to_owned(),
            )
            .await?;
        manager
            .drop_table(Table::drop().table(TurnSnapshots::Table).to_owned())
            .await?;
        manager
            .drop_table(Table::drop().table(Forks::Table).to_owned())
            .await?;
        manager
            .drop_table(Table::drop().table(Threads::Table).to_owned())
            .await?;
        manager
            .drop_table(Table::drop().table(WorkspaceSettings::Table).to_owned())
            .await?;
        manager
            .drop_table(Table::drop().table(Workspaces::Table).to_owned())
            .await?;
        Ok(())
    }
}

#[derive(DeriveIden)]
enum Workspaces {
    Table,
    Path,
    LastAccessed,
}

#[derive(DeriveIden)]
enum WorkspaceSettings {
    Table,
    WorkspacePath,
    Model,
    ReasoningEffort,
    ReasoningSummary,
    Sandbox,
    Approval,
}

#[derive(DeriveIden)]
enum Threads {
    Table,
    Id,
    WorkspacePath,
    CreatedAt,
    UpdatedAt,
    CurrentForkId,
    Title,
    Preview,
}

#[derive(DeriveIden)]
enum Forks {
    Table,
    Id,
    ThreadId,
    RolloutPath,
    CreatedAt,
    Label,
    ForkedFromForkId,
    ForkedFromAfterMessage,
    BaseCommit,
    SnapshotsDisabled,
}

#[derive(DeriveIden)]
enum TurnSnapshots {
    Table,
    Id,
    ForkId,
    EventId,
    CommitSha,
    CreatedAt,
}
