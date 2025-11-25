use serde::Deserialize;
use serde::Serialize;
use ts_rs::TS;

use codex_protocol::config_types::ReasoningEffort;
use codex_protocol::config_types::ReasoningSummary;
use codex_protocol::config_types::SandboxMode;
use codex_protocol::protocol::AskForApproval;

use crate::domain::thread::{Fork, Thread};
use crate::domain::workspace::WorkspaceSettings;

/// Remembered per-workspace defaults applied to new conversations.
#[derive(Debug, Clone, Serialize, Deserialize, TS, PartialEq, Default)]
#[serde(rename_all = "camelCase")]
pub struct WorkspaceComposerDefaults {
    #[serde(skip_serializing_if = "Option::is_none")]
    pub model: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub reasoning_effort: Option<ReasoningEffort>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub reasoning_summary: Option<ReasoningSummary>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub sandbox: Option<SandboxMode>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub approval: Option<AskForApproval>,
}

impl WorkspaceComposerDefaults {}

impl From<WorkspaceComposerDefaults> for WorkspaceSettings {
    fn from(value: WorkspaceComposerDefaults) -> Self {
        WorkspaceSettings {
            model: value.model,
            reasoning_effort: value.reasoning_effort,
            reasoning_summary: value.reasoning_summary,
            sandbox: value.sandbox,
            approval: value.approval,
        }
    }
}

impl From<WorkspaceSettings> for WorkspaceComposerDefaults {
    fn from(value: WorkspaceSettings) -> Self {
        WorkspaceComposerDefaults {
            model: value.model,
            reasoning_effort: value.reasoning_effort,
            reasoning_summary: value.reasoning_summary,
            sandbox: value.sandbox,
            approval: value.approval,
        }
    }
}

#[allow(dead_code)]
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, TS)]
#[serde(rename_all = "camelCase")]
pub struct ThreadRollout {
    pub conversation_id: String,
    pub rollout_path: String,
    pub created_at: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub label: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub forked_from_conversation_id: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub forked_from_nth_user_message: Option<u32>,
}

#[allow(dead_code)]
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct ThreadRecord {
    pub thread_id: String,
    pub created_at: String,
    pub updated_at: String,
    pub current_conversation_id: String,
    pub rollouts: Vec<ThreadRollout>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub title: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub preview: Option<String>,
}

impl From<&Fork> for ThreadRollout {
    fn from(fork: &Fork) -> Self {
        let (forked_from_conversation_id, forked_from_nth_user_message) = match &fork.fork_point {
            Some(point) => (
                Some(point.fork_id.as_str().to_string()),
                Some(point.after_message),
            ),
            None => (None, None),
        };

        ThreadRollout {
            conversation_id: fork.id.as_str().to_string(),
            rollout_path: fork.rollout_path.clone(),
            created_at: fork.created_at.clone(),
            label: fork.label.clone(),
            forked_from_conversation_id,
            forked_from_nth_user_message,
        }
    }
}

impl From<&Thread> for ThreadRecord {
    fn from(thread: &Thread) -> Self {
        ThreadRecord {
            thread_id: thread.id.as_str().to_string(),
            created_at: thread.created_at.clone(),
            updated_at: thread.updated_at.clone(),
            current_conversation_id: thread.current_fork_id.as_str().to_string(),
            rollouts: thread.forks.iter().map(ThreadRollout::from).collect(),
            title: thread.title.clone(),
            preview: thread.preview.clone(),
        }
    }
}
