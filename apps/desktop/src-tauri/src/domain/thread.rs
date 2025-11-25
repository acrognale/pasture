use serde::{Deserialize, Serialize};

use crate::domain::ids::{ForkId, ThreadId, WorkspacePath};

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct ForkPoint {
    pub fork_id: ForkId,
    pub after_message: u32,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct Fork {
    pub id: ForkId,
    pub thread_id: ThreadId,
    pub rollout_path: String,
    pub created_at: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub label: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub fork_point: Option<ForkPoint>,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct Thread {
    pub id: ThreadId,
    pub current_fork_id: ForkId,
    pub forks: Vec<Fork>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub title: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub preview: Option<String>,
    pub created_at: String,
    pub updated_at: String,
    pub workspace_path: WorkspacePath,
}
