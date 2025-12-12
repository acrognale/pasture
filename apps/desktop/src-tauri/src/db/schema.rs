use anyhow::Result;
use sea_orm::ActiveValue::Set;
use serde::Serialize;
use serde::de::DeserializeOwned;

use crate::domain::ids::WorkspacePath;
use crate::domain::workspace::WorkspaceSettings;

pub mod workspaces {
    use sea_orm::entity::prelude::*;

    #[derive(Clone, Debug, PartialEq, DeriveEntityModel)]
    #[sea_orm(table_name = "workspaces")]
    pub struct Model {
        #[sea_orm(primary_key, auto_increment = false)]
        pub path: String,
        pub last_accessed: String,
    }

    #[derive(Copy, Clone, Debug, EnumIter, DeriveRelation)]
    pub enum Relation {
        #[sea_orm(has_one = "super::workspace_settings::Entity")]
        WorkspaceSettings,
        #[sea_orm(has_many = "super::threads::Entity")]
        Threads,
    }

    impl ActiveModelBehavior for ActiveModel {}
}

pub mod workspace_settings {
    use sea_orm::entity::prelude::*;

    #[derive(Clone, Debug, PartialEq, DeriveEntityModel)]
    #[sea_orm(table_name = "workspace_settings")]
    pub struct Model {
        #[sea_orm(primary_key, auto_increment = false)]
        pub workspace_path: String,
        pub model: Option<String>,
        pub reasoning_effort: Option<String>,
        pub reasoning_summary: Option<String>,
        pub sandbox: Option<String>,
        pub approval: Option<String>,
        pub web_search_enabled: Option<String>,
    }

    #[derive(Copy, Clone, Debug, EnumIter, DeriveRelation)]
    pub enum Relation {
        #[sea_orm(
            belongs_to = "super::workspaces::Entity",
            from = "Column::WorkspacePath",
            to = "super::workspaces::Column::Path"
        )]
        Workspaces,
    }

    impl Related<super::workspaces::Entity> for Entity {
        fn to() -> RelationDef {
            Relation::Workspaces.def()
        }
    }

    impl ActiveModelBehavior for ActiveModel {}
}

pub mod threads {
    use sea_orm::entity::prelude::*;

    #[derive(Clone, Debug, PartialEq, DeriveEntityModel)]
    #[sea_orm(table_name = "threads")]
    pub struct Model {
        #[sea_orm(primary_key, auto_increment = false)]
        pub id: String,
        pub workspace_path: String,
        pub created_at: String,
        pub updated_at: String,
        pub current_conversation_id: String,
        pub title: Option<String>,
        pub preview: Option<String>,
        pub model: Option<String>,
        pub reasoning_effort: Option<String>,
        pub reasoning_summary: Option<String>,
        pub sandbox: Option<String>,
        pub approval: Option<String>,
        pub web_search_enabled: Option<String>,
        pub git_repo_root: Option<String>,
        pub git_head_sha: Option<String>,
        pub git_head_ref: Option<String>,
    }

    #[derive(Copy, Clone, Debug, EnumIter, DeriveRelation)]
    pub enum Relation {
        #[sea_orm(
            belongs_to = "super::workspaces::Entity",
            from = "Column::WorkspacePath",
            to = "super::workspaces::Column::Path"
        )]
        Workspaces,
        #[sea_orm(has_many = "super::conversations::Entity")]
        Conversations,
    }

    impl Related<super::workspaces::Entity> for Entity {
        fn to() -> RelationDef {
            Relation::Workspaces.def()
        }
    }

    impl Related<super::conversations::Entity> for Entity {
        fn to() -> RelationDef {
            Relation::Conversations.def()
        }
    }

    impl ActiveModelBehavior for ActiveModel {}
}

pub mod conversations {
    use sea_orm::entity::prelude::*;

    #[derive(Clone, Debug, PartialEq, DeriveEntityModel)]
    #[sea_orm(table_name = "conversations")]
    pub struct Model {
        #[sea_orm(primary_key, auto_increment = false)]
        pub id: String,
        pub thread_id: String,
        pub rollout_path: String,
        pub created_at: String,
        pub label: Option<String>,
        pub parent_conversation_id: Option<String>,
        pub forked_at_nth_user_message: Option<i32>,
        pub base_commit: Option<String>,
        #[sea_orm(column_type = "Integer", default_value = 0)]
        pub snapshots_disabled: bool,
    }

    #[derive(Copy, Clone, Debug, EnumIter, DeriveRelation)]
    pub enum Relation {
        #[sea_orm(
            belongs_to = "super::threads::Entity",
            from = "Column::ThreadId",
            to = "super::threads::Column::Id"
        )]
        Threads,
        #[sea_orm(has_many = "super::turn_snapshots::Entity")]
        TurnSnapshots,
    }

    impl Related<super::threads::Entity> for Entity {
        fn to() -> RelationDef {
            Relation::Threads.def()
        }
    }

    impl Related<super::turn_snapshots::Entity> for Entity {
        fn to() -> RelationDef {
            Relation::TurnSnapshots.def()
        }
    }

    impl ActiveModelBehavior for ActiveModel {}
}

pub mod turn_snapshots {
    use sea_orm::entity::prelude::*;

    #[derive(Clone, Debug, PartialEq, DeriveEntityModel)]
    #[sea_orm(table_name = "turn_snapshots")]
    pub struct Model {
        #[sea_orm(primary_key)]
        pub id: i32,
        pub conversation_id: String,
        pub event_id: String,
        pub commit_sha: String,
        pub created_at: String,
    }

    #[derive(Copy, Clone, Debug, EnumIter, DeriveRelation)]
    pub enum Relation {
        #[sea_orm(
            belongs_to = "super::conversations::Entity",
            from = "Column::ConversationId",
            to = "super::conversations::Column::Id"
        )]
        Conversations,
    }

    impl Related<super::conversations::Entity> for Entity {
        fn to() -> RelationDef {
            Relation::Conversations.def()
        }
    }

    impl ActiveModelBehavior for ActiveModel {}
}

pub mod message_comments {
    use sea_orm::entity::prelude::*;

    #[derive(Clone, Debug, PartialEq, DeriveEntityModel)]
    #[sea_orm(table_name = "message_comments")]
    pub struct Model {
        #[sea_orm(primary_key, auto_increment = false)]
        pub id: String,
        pub conversation_id: String,
        pub cell_id: String,
        pub selection_text: String,
        pub selection_preview: String,
        pub selection_start_offset: Option<i32>,
        pub selection_end_offset: Option<i32>,
        pub selection_block_index: Option<i32>,
        pub comment_text: String,
        pub created_at: String,
        #[sea_orm(column_type = "Integer", default_value = 0)]
        pub is_submitted: bool,
    }

    #[derive(Copy, Clone, Debug, EnumIter, DeriveRelation)]
    pub enum Relation {
        #[sea_orm(
            belongs_to = "super::conversations::Entity",
            from = "Column::ConversationId",
            to = "super::conversations::Column::Id"
        )]
        Conversations,
    }

    impl Related<super::conversations::Entity> for Entity {
        fn to() -> RelationDef {
            Relation::Conversations.def()
        }
    }

    impl ActiveModelBehavior for ActiveModel {}
}

pub fn encode_workspace_settings(
    workspace_path: &WorkspacePath,
    settings: &WorkspaceSettings,
) -> Result<workspace_settings::ActiveModel> {
    Ok(workspace_settings::ActiveModel {
        workspace_path: Set(workspace_path.as_str().to_string()),
        model: Set(settings.model.clone()),
        reasoning_effort: Set(serialize_json(&settings.reasoning_effort)?),
        reasoning_summary: Set(serialize_json(&settings.reasoning_summary)?),
        sandbox: Set(serialize_json(&settings.sandbox)?),
        approval: Set(serialize_json(&settings.approval)?),
        web_search_enabled: Set(serialize_json(&settings.web_search_enabled)?),
    })
}

pub fn decode_workspace_settings(model: workspace_settings::Model) -> Result<WorkspaceSettings> {
    Ok(WorkspaceSettings {
        model: model.model,
        reasoning_effort: deserialize_json(model.reasoning_effort)?,
        reasoning_summary: deserialize_json(model.reasoning_summary)?,
        sandbox: deserialize_json(model.sandbox)?,
        approval: deserialize_json(model.approval)?,
        web_search_enabled: deserialize_json(model.web_search_enabled)?,
    })
}

fn serialize_json<T: Serialize>(value: &Option<T>) -> Result<Option<String>> {
    value
        .as_ref()
        .map(|v| serde_json::to_string(v).map_err(Into::into))
        .transpose()
}

fn deserialize_json<T: DeserializeOwned>(value: Option<String>) -> Result<Option<T>> {
    value
        .map(|raw| serde_json::from_str(&raw).map_err(Into::into))
        .transpose()
}

pub mod message_comment_codec {
    use super::message_comments;
    use crate::domain::message_comment::MessageComment;

    pub fn encode(model: &MessageComment) -> message_comments::ActiveModel {
        message_comments::ActiveModel {
            id: sea_orm::ActiveValue::Set(model.id.clone()),
            conversation_id: sea_orm::ActiveValue::Set(model.conversation_id.to_string()),
            cell_id: sea_orm::ActiveValue::Set(model.cell_id.clone()),
            selection_text: sea_orm::ActiveValue::Set(model.selection_text.clone()),
            selection_preview: sea_orm::ActiveValue::Set(model.selection_preview.clone()),
            selection_start_offset: sea_orm::ActiveValue::Set(model.selection_start_offset),
            selection_end_offset: sea_orm::ActiveValue::Set(model.selection_end_offset),
            selection_block_index: sea_orm::ActiveValue::Set(model.selection_block_index),
            comment_text: sea_orm::ActiveValue::Set(model.comment_text.clone()),
            created_at: sea_orm::ActiveValue::Set(model.created_at.clone()),
            is_submitted: sea_orm::ActiveValue::Set(model.is_submitted),
        }
    }

    pub fn decode(model: message_comments::Model) -> MessageComment {
        MessageComment {
            id: model.id,
            conversation_id: codex_protocol::ConversationId::from_string(&model.conversation_id)
                .expect("conversation_id should be a valid ConversationId"),
            cell_id: model.cell_id,
            selection_text: model.selection_text,
            selection_preview: model.selection_preview,
            selection_start_offset: model.selection_start_offset,
            selection_end_offset: model.selection_end_offset,
            selection_block_index: model.selection_block_index,
            comment_text: model.comment_text,
            created_at: model.created_at,
            is_submitted: model.is_submitted,
        }
    }
}
