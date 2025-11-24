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

        // workspace_defaults
        manager
            .create_table(
                Table::create()
                    .table(WorkspaceDefaults::Table)
                    .if_not_exists()
                    .col(
                        ColumnDef::new(WorkspaceDefaults::WorkspacePath)
                            .string()
                            .not_null()
                            .primary_key(),
                    )
                    .col(ColumnDef::new(WorkspaceDefaults::Model).string().null())
                    .col(
                        ColumnDef::new(WorkspaceDefaults::ReasoningEffort)
                            .string()
                            .null(),
                    )
                    .col(
                        ColumnDef::new(WorkspaceDefaults::ReasoningSummary)
                            .string()
                            .null(),
                    )
                    .col(ColumnDef::new(WorkspaceDefaults::Sandbox).string().null())
                    .col(ColumnDef::new(WorkspaceDefaults::Approval).string().null())
                    .foreign_key(
                        ForeignKey::create()
                            .name("fk-workspace_defaults-workspace")
                            .from(WorkspaceDefaults::Table, WorkspaceDefaults::WorkspacePath)
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
                    .col(
                        ColumnDef::new(Threads::CurrentConversationId)
                            .string()
                            .not_null(),
                    )
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

        // thread_rollouts
        manager
            .create_table(
                Table::create()
                    .table(ThreadRollouts::Table)
                    .if_not_exists()
                    .col(
                        ColumnDef::new(ThreadRollouts::Id)
                            .integer()
                            .not_null()
                            .auto_increment()
                            .primary_key(),
                    )
                    .col(ColumnDef::new(ThreadRollouts::ThreadId).string().not_null())
                    .col(
                        ColumnDef::new(ThreadRollouts::ConversationId)
                            .string()
                            .not_null(),
                    )
                    .col(
                        ColumnDef::new(ThreadRollouts::RolloutPath)
                            .string()
                            .not_null(),
                    )
                    .col(
                        ColumnDef::new(ThreadRollouts::CreatedAt)
                            .string()
                            .not_null(),
                    )
                    .col(ColumnDef::new(ThreadRollouts::Label).string().null())
                    .col(
                        ColumnDef::new(ThreadRollouts::ForkedFromConversationId)
                            .string()
                            .null(),
                    )
                    .col(
                        ColumnDef::new(ThreadRollouts::ForkedFromNthUserMessage)
                            .integer()
                            .null(),
                    )
                    .foreign_key(
                        ForeignKey::create()
                            .name("fk-thread_rollouts-thread")
                            .from(ThreadRollouts::Table, ThreadRollouts::ThreadId)
                            .to(Threads::Table, Threads::Id)
                            .on_delete(ForeignKeyAction::Cascade),
                    )
                    .to_owned(),
            )
            .await?;

        Ok(())
    }

    async fn down(&self, manager: &SchemaManager) -> Result<(), DbErr> {
        manager
            .drop_table(Table::drop().table(ThreadRollouts::Table).to_owned())
            .await?;
        manager
            .drop_table(Table::drop().table(Threads::Table).to_owned())
            .await?;
        manager
            .drop_table(Table::drop().table(WorkspaceDefaults::Table).to_owned())
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
enum WorkspaceDefaults {
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
    CurrentConversationId,
    Title,
    Preview,
}

#[derive(DeriveIden)]
enum ThreadRollouts {
    Table,
    Id,
    ThreadId,
    ConversationId,
    RolloutPath,
    CreatedAt,
    Label,
    ForkedFromConversationId,
    ForkedFromNthUserMessage,
}
