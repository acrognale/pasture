use sea_orm_migration::prelude::*;

#[derive(DeriveMigrationName)]
pub struct Migration;

#[async_trait::async_trait]
impl MigrationTrait for Migration {
    async fn up(&self, manager: &SchemaManager) -> Result<(), DbErr> {
        manager
            .create_table(
                Table::create()
                    .table(MessageComments::Table)
                    .if_not_exists()
                    .col(
                        ColumnDef::new(MessageComments::Id)
                            .string()
                            .not_null()
                            .primary_key(),
                    )
                    .col(
                        ColumnDef::new(MessageComments::ConversationId)
                            .string()
                            .not_null(),
                    )
                    .col(ColumnDef::new(MessageComments::CellId).string().not_null())
                    .col(
                        ColumnDef::new(MessageComments::SelectionText)
                            .string()
                            .not_null(),
                    )
                    .col(
                        ColumnDef::new(MessageComments::SelectionPreview)
                            .string()
                            .not_null(),
                    )
                    .col(
                        ColumnDef::new(MessageComments::SelectionStartOffset)
                            .integer()
                            .null(),
                    )
                    .col(
                        ColumnDef::new(MessageComments::SelectionEndOffset)
                            .integer()
                            .null(),
                    )
                    .col(
                        ColumnDef::new(MessageComments::SelectionBlockIndex)
                            .integer()
                            .null(),
                    )
                    .col(
                        ColumnDef::new(MessageComments::CommentText)
                            .string()
                            .not_null(),
                    )
                    .col(
                        ColumnDef::new(MessageComments::CreatedAt)
                            .string()
                            .not_null(),
                    )
                    .col(
                        ColumnDef::new(MessageComments::IsSubmitted)
                            .integer()
                            .not_null()
                            .default(0),
                    )
                    .foreign_key(
                        ForeignKey::create()
                            .name("fk-message_comments-conversation")
                            .from(MessageComments::Table, MessageComments::ConversationId)
                            .to(Alias::new("conversations"), Alias::new("id"))
                            .on_delete(ForeignKeyAction::Cascade),
                    )
                    .to_owned(),
            )
            .await?;

        manager
            .create_index(
                Index::create()
                    .name("idx-message_comments-conversation")
                    .table(MessageComments::Table)
                    .col(MessageComments::ConversationId)
                    .to_owned(),
            )
            .await?;

        manager
            .create_index(
                Index::create()
                    .name("idx-message_comments-conversation-cell")
                    .table(MessageComments::Table)
                    .col(MessageComments::ConversationId)
                    .col(MessageComments::CellId)
                    .to_owned(),
            )
            .await?;

        Ok(())
    }

    async fn down(&self, manager: &SchemaManager) -> Result<(), DbErr> {
        manager
            .drop_index(
                Index::drop()
                    .name("idx-message_comments-conversation-cell")
                    .table(MessageComments::Table)
                    .to_owned(),
            )
            .await?;

        manager
            .drop_index(
                Index::drop()
                    .name("idx-message_comments-conversation")
                    .table(MessageComments::Table)
                    .to_owned(),
            )
            .await?;

        manager
            .drop_table(Table::drop().table(MessageComments::Table).to_owned())
            .await?;

        Ok(())
    }
}

#[derive(DeriveIden)]
enum MessageComments {
    Table,
    Id,
    ConversationId,
    CellId,
    SelectionText,
    SelectionPreview,
    SelectionStartOffset,
    SelectionEndOffset,
    SelectionBlockIndex,
    CommentText,
    CreatedAt,
    IsSubmitted,
}
