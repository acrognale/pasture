use anyhow::Result;
use sea_orm::ActiveValue::Set;
use serde::Serialize;
use serde::de::DeserializeOwned;

use crate::workspace_manager::ThreadRecord;
use crate::workspace_manager::ThreadRollout;
use crate::workspace_manager::WorkspaceComposerDefaults;

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
        #[sea_orm(has_one = "super::workspace_defaults::Entity")]
        WorkspaceDefaults,
        #[sea_orm(has_many = "super::threads::Entity")]
        Threads,
    }

    impl ActiveModelBehavior for ActiveModel {}
}

pub mod workspace_defaults {
    use sea_orm::entity::prelude::*;

    #[derive(Clone, Debug, PartialEq, DeriveEntityModel)]
    #[sea_orm(table_name = "workspace_defaults")]
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
    }

    #[derive(Copy, Clone, Debug, EnumIter, DeriveRelation)]
    pub enum Relation {
        #[sea_orm(
            belongs_to = "super::workspaces::Entity",
            from = "Column::WorkspacePath",
            to = "super::workspaces::Column::Path"
        )]
        Workspaces,
        #[sea_orm(has_many = "super::thread_rollouts::Entity")]
        ThreadRollouts,
    }

    impl Related<super::workspaces::Entity> for Entity {
        fn to() -> RelationDef {
            Relation::Workspaces.def()
        }
    }

    impl Related<super::thread_rollouts::Entity> for Entity {
        fn to() -> RelationDef {
            Relation::ThreadRollouts.def()
        }
    }

    impl ActiveModelBehavior for ActiveModel {}
}

pub mod thread_rollouts {
    use sea_orm::entity::prelude::*;

    #[derive(Clone, Debug, PartialEq, DeriveEntityModel)]
    #[sea_orm(table_name = "thread_rollouts")]
    pub struct Model {
        #[sea_orm(primary_key)]
        pub id: i32,
        pub thread_id: String,
        pub conversation_id: String,
        pub rollout_path: String,
        pub created_at: String,
        pub label: Option<String>,
        pub forked_from_conversation_id: Option<String>,
        pub forked_from_nth_user_message: Option<i32>,
    }

    #[derive(Copy, Clone, Debug, EnumIter, DeriveRelation)]
    pub enum Relation {
        #[sea_orm(
            belongs_to = "super::threads::Entity",
            from = "Column::ThreadId",
            to = "super::threads::Column::Id"
        )]
        Threads,
    }

    impl Related<super::threads::Entity> for Entity {
        fn to() -> RelationDef {
            Relation::Threads.def()
        }
    }

    impl ActiveModelBehavior for ActiveModel {}
}

pub fn encode_workspace_defaults(
    workspace_path: &str,
    defaults: &WorkspaceComposerDefaults,
) -> Result<workspace_defaults::ActiveModel> {
    Ok(workspace_defaults::ActiveModel {
        workspace_path: Set(workspace_path.to_string()),
        model: Set(defaults.model.clone()),
        reasoning_effort: Set(serialize_json(&defaults.reasoning_effort)?),
        reasoning_summary: Set(serialize_json(&defaults.reasoning_summary)?),
        sandbox: Set(serialize_json(&defaults.sandbox)?),
        approval: Set(serialize_json(&defaults.approval)?),
    })
}

pub fn decode_workspace_defaults(
    model: workspace_defaults::Model,
) -> Result<WorkspaceComposerDefaults> {
    Ok(WorkspaceComposerDefaults {
        model: model.model,
        reasoning_effort: deserialize_json(model.reasoning_effort)?,
        reasoning_summary: deserialize_json(model.reasoning_summary)?,
        sandbox: deserialize_json(model.sandbox)?,
        approval: deserialize_json(model.approval)?,
    })
}

pub struct ThreadModels {
    pub thread: threads::ActiveModel,
    pub rollouts: Vec<thread_rollouts::ActiveModel>,
}

pub fn encode_thread_record(record: &ThreadRecord, workspace_path: &str) -> ThreadModels {
    let thread = threads::ActiveModel {
        id: Set(record.thread_id.clone()),
        workspace_path: Set(workspace_path.to_string()),
        created_at: Set(record.created_at.clone()),
        updated_at: Set(record.updated_at.clone()),
        current_conversation_id: Set(record.current_conversation_id.clone()),
        title: Set(record.title.clone()),
        preview: Set(record.preview.clone()),
    };

    let rollouts = record
        .rollouts
        .iter()
        .map(|rollout| thread_rollouts::ActiveModel {
            id: Set(Default::default()),
            thread_id: Set(record.thread_id.clone()),
            conversation_id: Set(rollout.conversation_id.clone()),
            rollout_path: Set(rollout.rollout_path.clone()),
            created_at: Set(rollout.created_at.clone()),
            label: Set(rollout.label.clone()),
            forked_from_conversation_id: Set(rollout.forked_from_conversation_id.clone()),
            forked_from_nth_user_message: Set(rollout
                .forked_from_nth_user_message
                .map(|v| v as i32)),
        })
        .collect();

    ThreadModels { thread, rollouts }
}

pub fn decode_thread_record(
    thread: threads::Model,
    rollouts: Vec<thread_rollouts::Model>,
) -> ThreadRecord {
    let rollouts = rollouts
        .into_iter()
        .map(|rollout| ThreadRollout {
            conversation_id: rollout.conversation_id,
            rollout_path: rollout.rollout_path,
            created_at: rollout.created_at,
            label: rollout.label,
            forked_from_conversation_id: rollout.forked_from_conversation_id,
            forked_from_nth_user_message: rollout
                .forked_from_nth_user_message
                .map(|value| value as u32),
        })
        .collect();

    ThreadRecord {
        thread_id: thread.id,
        created_at: thread.created_at,
        updated_at: thread.updated_at,
        current_conversation_id: thread.current_conversation_id,
        rollouts,
        title: thread.title,
        preview: thread.preview,
    }
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
