use codex_protocol::ConversationId;
use sea_orm::ActiveModelTrait;
use sea_orm::ColumnTrait;
use sea_orm::DatabaseConnection;
use sea_orm::EntityTrait;
use sea_orm::QueryFilter;
use sea_orm::QueryOrder;
use sea_orm::TransactionTrait;

use crate::db::db_err;
use crate::db::schema;
use crate::db::schema::message_comment_codec;
use crate::domain::MessageComment;
use crate::errors::AppResult;

pub async fn list_for_conversation(
    db: &DatabaseConnection,
    conversation_id: &ConversationId,
) -> AppResult<Vec<MessageComment>> {
    let rows = schema::message_comments::Entity::find()
        .filter(schema::message_comments::Column::ConversationId.eq(conversation_id.to_string()))
        .order_by_asc(schema::message_comments::Column::CreatedAt)
        .order_by_asc(schema::message_comments::Column::Id)
        .all(db)
        .await
        .map_err(|e| db_err("list message comments", e))?;

    Ok(rows.into_iter().map(message_comment_codec::decode).collect())
}

pub async fn insert(db: &DatabaseConnection, comment: &MessageComment) -> AppResult<()> {
    let active = message_comment_codec::encode(comment);
    active
        .insert(db)
        .await
        .map_err(|e| db_err("insert message comment", e))?;
    Ok(())
}

pub async fn update_comment(
    db: &DatabaseConnection,
    id: &str,
    comment_text: Option<&str>,
    is_submitted: Option<bool>,
) -> AppResult<()> {
    if comment_text.is_none() && is_submitted.is_none() {
        return Ok(());
    }

    let txn = db
        .begin()
        .await
        .map_err(|e| db_err("begin update message comment", e))?;

    if let Some(text) = comment_text {
        schema::message_comments::Entity::update_many()
            .col_expr(
                schema::message_comments::Column::CommentText,
                sea_orm::sea_query::Expr::value(text.to_string()),
            )
            .filter(schema::message_comments::Column::Id.eq(id))
            .exec(&txn)
            .await
            .map_err(|e| db_err("update message comment text", e))?;
    }

    if let Some(submitted) = is_submitted {
        schema::message_comments::Entity::update_many()
            .col_expr(
                schema::message_comments::Column::IsSubmitted,
                sea_orm::sea_query::Expr::value(submitted),
            )
            .filter(schema::message_comments::Column::Id.eq(id))
            .exec(&txn)
            .await
            .map_err(|e| db_err("update message comment status", e))?;
    }

    txn.commit()
        .await
        .map_err(|e| db_err("commit update message comment", e))?;

    Ok(())
}

pub async fn set_submitted(
    db: &DatabaseConnection,
    ids: &[String],
    is_submitted: bool,
) -> AppResult<()> {
    if ids.is_empty() {
        return Ok(());
    }

    schema::message_comments::Entity::update_many()
        .col_expr(
            schema::message_comments::Column::IsSubmitted,
            sea_orm::sea_query::Expr::value(is_submitted),
        )
        .filter(schema::message_comments::Column::Id.is_in(ids.iter().cloned().collect::<Vec<_>>()))
        .exec(db)
        .await
        .map_err(|e| db_err("set message comments submitted", e))?;

    Ok(())
}

pub async fn delete(db: &DatabaseConnection, id: &str) -> AppResult<()> {
    schema::message_comments::Entity::delete_by_id(id.to_string())
        .exec(db)
        .await
        .map_err(|e| db_err("delete message comment", e))?;
    Ok(())
}
