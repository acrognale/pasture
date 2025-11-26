use sea_orm_migration::prelude::*;

#[derive(DeriveMigrationName)]
pub struct Migration;

#[async_trait::async_trait]
impl MigrationTrait for Migration {
    async fn up(&self, manager: &SchemaManager) -> Result<(), DbErr> {
        // Rename forks table to conversations
        manager
            .rename_table(
                Table::rename()
                    .table(Alias::new("forks"), Alias::new("conversations"))
                    .to_owned(),
            )
            .await?;

        // Rename columns in conversations table
        manager
            .alter_table(
                Table::alter()
                    .table(Alias::new("conversations"))
                    .rename_column(
                        Alias::new("forked_from_fork_id"),
                        Alias::new("parent_conversation_id"),
                    )
                    .to_owned(),
            )
            .await?;

        manager
            .alter_table(
                Table::alter()
                    .table(Alias::new("conversations"))
                    .rename_column(
                        Alias::new("forked_from_after_message"),
                        Alias::new("forked_at_nth_user_message"),
                    )
                    .to_owned(),
            )
            .await?;

        // Rename current_fork_id in threads table
        manager
            .alter_table(
                Table::alter()
                    .table(Alias::new("threads"))
                    .rename_column(
                        Alias::new("current_fork_id"),
                        Alias::new("current_conversation_id"),
                    )
                    .to_owned(),
            )
            .await?;

        // Rename fork_id in turn_snapshots table
        manager
            .alter_table(
                Table::alter()
                    .table(Alias::new("turn_snapshots"))
                    .rename_column(Alias::new("fork_id"), Alias::new("conversation_id"))
                    .to_owned(),
            )
            .await?;

        Ok(())
    }

    async fn down(&self, manager: &SchemaManager) -> Result<(), DbErr> {
        // Rename conversation_id back to fork_id in turn_snapshots table
        manager
            .alter_table(
                Table::alter()
                    .table(Alias::new("turn_snapshots"))
                    .rename_column(Alias::new("conversation_id"), Alias::new("fork_id"))
                    .to_owned(),
            )
            .await?;

        // Rename current_conversation_id back to current_fork_id in threads table
        manager
            .alter_table(
                Table::alter()
                    .table(Alias::new("threads"))
                    .rename_column(
                        Alias::new("current_conversation_id"),
                        Alias::new("current_fork_id"),
                    )
                    .to_owned(),
            )
            .await?;

        // Rename columns back in conversations table
        manager
            .alter_table(
                Table::alter()
                    .table(Alias::new("conversations"))
                    .rename_column(
                        Alias::new("forked_at_nth_user_message"),
                        Alias::new("forked_from_after_message"),
                    )
                    .to_owned(),
            )
            .await?;

        manager
            .alter_table(
                Table::alter()
                    .table(Alias::new("conversations"))
                    .rename_column(
                        Alias::new("parent_conversation_id"),
                        Alias::new("forked_from_fork_id"),
                    )
                    .to_owned(),
            )
            .await?;

        // Rename conversations table back to forks
        manager
            .rename_table(
                Table::rename()
                    .table(Alias::new("conversations"), Alias::new("forks"))
                    .to_owned(),
            )
            .await?;

        Ok(())
    }
}
