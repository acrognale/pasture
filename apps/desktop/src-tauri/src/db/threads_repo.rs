use std::collections::{HashMap, HashSet};

use chrono::Utc;
use codex_protocol::ConversationId;
use sea_orm::ActiveModelTrait;
use sea_orm::ActiveValue::Set;
use sea_orm::ColumnTrait;
use sea_orm::DatabaseConnection;
use sea_orm::EntityTrait;
use sea_orm::QueryFilter;
use sea_orm::QueryOrder;
use sea_orm::TransactionTrait;

use crate::db::{db_err, schema};
use crate::domain::{Conversation, Thread, ThreadId, WorkspacePath};
use crate::errors::AppResult;

#[derive(Clone)]
pub struct ThreadRepo {
    db: DatabaseConnection,
}

impl ThreadRepo {
    pub fn new(db: DatabaseConnection) -> Self {
        Self { db }
    }

    pub async fn list_for_workspace(&self, workspace: &WorkspacePath) -> AppResult<Vec<Thread>> {
        let threads = schema::threads::Entity::find()
            .filter(schema::threads::Column::WorkspacePath.eq(workspace.as_str()))
            .order_by_desc(schema::threads::Column::UpdatedAt)
            .all(&self.db)
            .await
            .map_err(|e| db_err("Failed to list threads", e))?;

        let mut result = Vec::with_capacity(threads.len());

        for thread in threads {
            let conversations = self.load_conversations(thread.id.clone()).await?;
            result.push(decode_thread(thread, conversations));
        }

        Ok(result)
    }

    pub async fn get(&self, workspace: &WorkspacePath, id: &ThreadId) -> AppResult<Option<Thread>> {
        let thread = schema::threads::Entity::find_by_id(id.as_str().to_string())
            .filter(schema::threads::Column::WorkspacePath.eq(workspace.as_str()))
            .one(&self.db)
            .await
            .map_err(|e| db_err("Failed to load thread", e))?;

        let Some(thread) = thread else {
            return Ok(None);
        };

        let conversations = self.load_conversations(id.as_str().to_string()).await?;
        Ok(Some(decode_thread(thread, conversations)))
    }

    pub async fn save(&self, workspace: &WorkspacePath, thread: &Thread) -> AppResult<()> {
        let txn = self
            .db
            .begin()
            .await
            .map_err(|e| db_err("Failed to begin thread transaction", e))?;

        let existing = schema::threads::Entity::find_by_id(thread.id.as_str().to_string())
            .filter(schema::threads::Column::WorkspacePath.eq(workspace.as_str()))
            .one(&txn)
            .await
            .map_err(|e| db_err("Failed to fetch existing thread for upsert", e))?;

        let thread_active = encode_thread(thread, workspace, existing.as_ref());

        if existing.is_some() {
            thread_active
                .update(&txn)
                .await
                .map_err(|e| db_err("Failed to update thread", e))?;
        } else {
            thread_active
                .insert(&txn)
                .await
                .map_err(|e| db_err("Failed to insert thread", e))?;
        }

        let mut existing_conversations: HashMap<String, schema::conversations::Model> =
            schema::conversations::Entity::find()
                .filter(schema::conversations::Column::ThreadId.eq(thread.id.as_str()))
                .all(&txn)
                .await
                .map_err(|e| db_err("Failed to load existing conversations", e))?
                .into_iter()
                .map(|conv| (conv.id.clone(), conv))
                .collect();

        for conversation in &thread.conversations {
            let prior = existing_conversations.remove(&conversation.id.to_string());
            let active = encode_conversation(conversation, &thread.id, prior.as_ref());

            if prior.is_some() {
                active
                    .update(&txn)
                    .await
                    .map_err(|e| db_err("Failed to update conversation", e))?;
            } else {
                active
                    .insert(&txn)
                    .await
                    .map_err(|e| db_err("Failed to insert conversation", e))?;
            }
        }

        if !existing_conversations.is_empty() {
            let obsolete_ids: Vec<String> = existing_conversations.into_keys().collect();

            schema::turn_snapshots::Entity::delete_many()
                .filter(schema::turn_snapshots::Column::ConversationId.is_in(obsolete_ids.clone()))
                .exec(&txn)
                .await
                .map_err(|e| {
                    db_err(
                        "Failed to delete turn snapshots for removed conversations",
                        e,
                    )
                })?;

            schema::conversations::Entity::delete_many()
                .filter(schema::conversations::Column::Id.is_in(obsolete_ids))
                .exec(&txn)
                .await
                .map_err(|e| db_err("Failed to delete removed conversations", e))?;
        }

        txn.commit()
            .await
            .map_err(|e| db_err("Failed to commit thread transaction", e))?;

        Ok(())
    }

    pub async fn update_preview_for_conversation(
        &self,
        conversation_id: &ConversationId,
        preview: &str,
    ) -> AppResult<bool> {
        let threads = self.threads_for_conversation(conversation_id).await?;
        let mut changed = false;
        let timestamp = Utc::now().to_rfc3339();

        for thread in threads {
            let existing = thread.preview.as_deref().unwrap_or("");
            if !existing.is_empty() && existing != "Untitled session" {
                continue;
            }

            let mut active: schema::threads::ActiveModel = thread.into();
            active.preview = Set(Some(preview.to_string()));
            active.updated_at = Set(timestamp.clone());
            active
                .update(&self.db)
                .await
                .map_err(|e| db_err("Failed to update thread preview", e))?;
            changed = true;
        }

        Ok(changed)
    }

    pub async fn has_missing_title_for_conversation(
        &self,
        conversation_id: &ConversationId,
    ) -> AppResult<bool> {
        let threads = self.threads_for_conversation(conversation_id).await?;
        Ok(threads.iter().any(|thread| is_missing_title(&thread.title)))
    }

    pub async fn update_title_for_conversation(
        &self,
        conversation_id: &ConversationId,
        title: &str,
    ) -> AppResult<bool> {
        let normalized_title = title.trim();
        if normalized_title.is_empty() || normalized_title == "Untitled session" {
            return Ok(false);
        }

        let mut changed = false;
        let timestamp = Utc::now().to_rfc3339();
        let threads = self.threads_for_conversation(conversation_id).await?;

        for thread in threads {
            if !is_missing_title(&thread.title) {
                continue;
            }

            let mut active: schema::threads::ActiveModel = thread.into();
            active.title = Set(Some(normalized_title.to_string()));
            active.updated_at = Set(timestamp.clone());
            active
                .update(&self.db)
                .await
                .map_err(|e| db_err("Failed to update thread title", e))?;
            changed = true;
        }

        Ok(changed)
    }

    pub async fn list_for_conversation(
        &self,
        conversation_id: &ConversationId,
    ) -> AppResult<Vec<Thread>> {
        let models = self.threads_for_conversation(conversation_id).await?;
        let mut threads = Vec::with_capacity(models.len());

        for model in models {
            let conversations = self.load_conversations(model.id.clone()).await?;
            threads.push(decode_thread(model, conversations));
        }

        Ok(threads)
    }

    async fn load_conversations(
        &self,
        thread_id: String,
    ) -> AppResult<Vec<schema::conversations::Model>> {
        schema::conversations::Entity::find()
            .filter(schema::conversations::Column::ThreadId.eq(thread_id))
            .order_by_asc(schema::conversations::Column::CreatedAt)
            .all(&self.db)
            .await
            .map_err(|e| db_err("Failed to load thread conversations", e))
    }

    async fn threads_for_conversation(
        &self,
        conversation_id: &ConversationId,
    ) -> AppResult<Vec<schema::threads::Model>> {
        let mut threads = schema::threads::Entity::find()
            .filter(schema::threads::Column::CurrentConversationId.eq(conversation_id.to_string()))
            .all(&self.db)
            .await
            .map_err(|e| db_err("Failed to find threads for conversation", e))?;

        let conversation_threads: Vec<String> = schema::conversations::Entity::find()
            .filter(schema::conversations::Column::Id.eq(conversation_id.to_string()))
            .all(&self.db)
            .await
            .map_err(|e| db_err("Failed to find conversation links", e))?
            .into_iter()
            .map(|c| c.thread_id)
            .collect();

        let mut seen: HashSet<String> = threads.iter().map(|thread| thread.id.clone()).collect();
        for thread_id in conversation_threads {
            if seen.contains(&thread_id) {
                continue;
            }

            if let Some(thread) = schema::threads::Entity::find_by_id(thread_id)
                .one(&self.db)
                .await
                .map_err(|e| db_err("Failed to load thread by conversation", e))?
            {
                seen.insert(thread.id.clone());
                threads.push(thread);
            }
        }

        Ok(threads)
    }
}

fn encode_thread(
    thread: &Thread,
    workspace: &WorkspacePath,
    existing: Option<&schema::threads::Model>,
) -> schema::threads::ActiveModel {
    let mut active = match existing {
        Some(model) => {
            let active: schema::threads::ActiveModel = model.clone().into();
            active
        }
        None => schema::threads::ActiveModel {
            id: Set(thread.id.as_str().to_string()),
            workspace_path: Set(workspace.as_str().to_string()),
            created_at: Set(thread.created_at.clone()),
            updated_at: Set(thread.updated_at.clone()),
            current_conversation_id: Set(thread.current_conversation_id.to_string()),
            title: Set(thread.title.clone()),
            preview: Set(thread.preview.clone()),
        },
    };

    active.workspace_path = Set(workspace.as_str().to_string());
    active.created_at = Set(thread.created_at.clone());
    active.updated_at = Set(thread.updated_at.clone());
    active.current_conversation_id = Set(thread.current_conversation_id.to_string());
    active.title = Set(thread.title.clone());
    active.preview = Set(thread.preview.clone());

    active
}

fn encode_conversation(
    conversation: &Conversation,
    thread_id: &ThreadId,
    existing: Option<&schema::conversations::Model>,
) -> schema::conversations::ActiveModel {
    let parent_conversation_id = conversation
        .parent_conversation_id
        .as_ref()
        .map(|id| id.to_string());
    let forked_at_nth_user_message = conversation.forked_at_nth_user_message.map(|n| n as i32);

    match existing {
        Some(model) => {
            let mut active: schema::conversations::ActiveModel = model.clone().into();
            active.rollout_path = Set(conversation.rollout_path.clone());
            active.created_at = Set(conversation.created_at.clone());
            active.label = Set(conversation.label.clone());
            active.parent_conversation_id = Set(parent_conversation_id);
            active.forked_at_nth_user_message = Set(forked_at_nth_user_message);
            active
        }
        None => schema::conversations::ActiveModel {
            id: Set(conversation.id.to_string()),
            thread_id: Set(thread_id.as_str().to_string()),
            rollout_path: Set(conversation.rollout_path.clone()),
            created_at: Set(conversation.created_at.clone()),
            label: Set(conversation.label.clone()),
            parent_conversation_id: Set(parent_conversation_id),
            forked_at_nth_user_message: Set(forked_at_nth_user_message),
            base_commit: Set(None),
            snapshots_disabled: Set(false),
        },
    }
}

fn decode_thread(
    thread: schema::threads::Model,
    conversations: Vec<schema::conversations::Model>,
) -> Thread {
    let workspace_path = WorkspacePath(thread.workspace_path);
    let conversations = conversations
        .into_iter()
        .map(|conv| decode_conversation(&thread.id, conv))
        .collect();

    Thread {
        id: ThreadId(thread.id),
        current_conversation_id: ConversationId::from_string(&thread.current_conversation_id)
            .unwrap(),
        conversations,
        title: thread.title,
        preview: thread.preview,
        created_at: thread.created_at,
        updated_at: thread.updated_at,
        workspace_path,
    }
}

fn decode_conversation(thread_id: &str, model: schema::conversations::Model) -> Conversation {
    let parent_conversation_id = model
        .parent_conversation_id
        .and_then(|id| ConversationId::from_string(&id).ok());
    let forked_at_nth_user_message = model.forked_at_nth_user_message.map(|n| n as u32);

    Conversation {
        id: ConversationId::from_string(&model.id).unwrap(),
        thread_id: ThreadId(thread_id.to_string()),
        rollout_path: model.rollout_path,
        created_at: model.created_at,
        label: model.label,
        parent_conversation_id,
        forked_at_nth_user_message,
    }
}

fn is_missing_title(title: &Option<String>) -> bool {
    match title.as_deref() {
        Some(existing) => existing.trim().is_empty() || existing == "Untitled session",
        None => true,
    }
}
