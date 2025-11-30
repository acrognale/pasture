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
    })
}

pub fn decode_workspace_settings(model: workspace_settings::Model) -> Result<WorkspaceSettings> {
    Ok(WorkspaceSettings {
        model: model.model,
        reasoning_effort: deserialize_json(model.reasoning_effort)?,
        reasoning_summary: deserialize_json(model.reasoning_summary)?,
        sandbox: deserialize_json(model.sandbox)?,
        approval: deserialize_json(model.approval)?,
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
