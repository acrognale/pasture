use std::process::Command;

use anyhow::Context;
use anyhow::Result as AnyResult;
use serde::Deserialize;
use serde::Serialize;
use tauri::State;
use ts_rs::TS;

use crate::codex_runtime::CodexRuntime;
use crate::errors::{AppError, AppResult};
use crate::workspace_manager::WorkspaceManager;

#[derive(Serialize, Deserialize, Debug, Clone, PartialEq, TS)]
#[serde(rename_all = "camelCase")]
pub struct GetTurnDiffRangeParams {
    pub conversation_id: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub base_event_id: Option<String>,
    pub target_event_id: String,
}

#[derive(Serialize, Deserialize, Debug, Clone, PartialEq, TS)]
#[serde(rename_all = "camelCase")]
pub struct GetTurnDiffRangeResponse {
    pub unified_diff: String,
}

#[derive(Serialize, Deserialize, Debug, Clone, PartialEq, TS)]
#[serde(rename_all = "camelCase")]
pub struct ListTurnSnapshotsParams {
    pub conversation_id: String,
}

#[derive(Serialize, Deserialize, Debug, Clone, PartialEq, TS)]
#[serde(rename_all = "camelCase")]
pub struct TurnSnapshotDescriptor {
    pub event_id: String,
    pub commit_id: String,
}

#[derive(Serialize, Deserialize, Debug, Clone, PartialEq, TS)]
#[serde(rename_all = "camelCase")]
pub struct ListTurnSnapshotsResponse {
    pub disabled: bool,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub base_commit_id: Option<String>,
    pub snapshots: Vec<TurnSnapshotDescriptor>,
}

#[tauri::command]
pub async fn get_turn_diff_range(
    params: GetTurnDiffRangeParams,
    runtime: State<'_, CodexRuntime>,
    workspace_manager: State<'_, WorkspaceManager>,
) -> AppResult<GetTurnDiffRangeResponse> {
    if !runtime.is_initialized().await {
        return Err(AppError::Validation {
            message: "Runtime not initialized".to_string(),
        });
    }

    let session = workspace_manager
        .get_active_conversation(&params.conversation_id)
        .await
        .ok_or(AppError::NotFound {
            entity: "conversation",
        })?;
    let store = session.review_snapshots();
    let commits = store
        .commits_for_range(params.base_event_id.as_deref(), &params.target_event_id)
        .await
        .map_err(AppError::Internal)?;

    let (cwd, base_commit, target_commit) = commits.ok_or(AppError::Validation {
        message: "Snapshot data unavailable for requested range".to_string(),
    })?;

    let diff = tokio::task::spawn_blocking(move || -> AnyResult<String> {
        let output = Command::new("git")
            .current_dir(&cwd)
            .args(["diff", "--no-color", &base_commit, &target_commit])
            .output()
            .context("failed to execute git diff")?;

        if !output.status.success() {
            return Err(anyhow::anyhow!(
                "git diff exited with status {}",
                output.status
            ));
        }

        String::from_utf8(output.stdout).context("git diff produced invalid UTF-8")
    })
    .await?
    .map_err(AppError::Internal)?;

    Ok(GetTurnDiffRangeResponse { unified_diff: diff })
}

#[tauri::command]
pub async fn list_turn_snapshots(
    params: ListTurnSnapshotsParams,
    runtime: State<'_, CodexRuntime>,
    workspace_manager: State<'_, WorkspaceManager>,
) -> AppResult<ListTurnSnapshotsResponse> {
    if !runtime.is_initialized().await {
        return Err(AppError::Validation {
            message: "Runtime not initialized".to_string(),
        });
    }

    let session = workspace_manager
        .get_active_conversation(&params.conversation_id)
        .await
        .ok_or(AppError::NotFound {
            entity: "conversation",
        })?;

    let store = session.review_snapshots();
    let summary = store.snapshot_summary().await;

    let response = ListTurnSnapshotsResponse {
        disabled: summary.disabled,
        base_commit_id: summary.base_commit,
        snapshots: summary
            .turn_commits
            .into_iter()
            .map(|(event_id, commit_id)| TurnSnapshotDescriptor {
                event_id,
                commit_id,
            })
            .collect(),
    };

    Ok(response)
}
