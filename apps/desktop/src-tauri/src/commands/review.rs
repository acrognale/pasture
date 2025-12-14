use std::process::Command;

use anyhow::Context;
use anyhow::Result as AnyResult;
use codex_protocol::ConversationId;
use serde::Deserialize;
use serde::Serialize;
use tauri::State;
use ts_rs::TS;

use crate::errors::AppError;
use crate::errors::AppResult;
use crate::review;
use crate::state::AppState;

#[derive(Serialize, Deserialize, Debug, Clone, PartialEq, TS)]
#[serde(rename_all = "camelCase")]
pub struct GetRepoDiffParams {
    pub workspace_path: String,
    pub base_ref: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub target_ref: Option<String>,
    /// When true, diff `base_ref` against the working tree (ignores `target_ref`).
    pub include_worktree: bool,
}

#[derive(Serialize, Deserialize, Debug, Clone, PartialEq, TS)]
#[serde(rename_all = "camelCase")]
pub struct GetRepoDiffResponse {
    pub unified_diff: String,
}

#[derive(Serialize, Deserialize, Debug, Clone, PartialEq, TS)]
#[serde(rename_all = "camelCase")]
pub struct GetTurnDiffRangeParams {
    pub conversation_id: ConversationId,
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
    pub conversation_id: ConversationId,
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
    app: State<'_, AppState>,
) -> AppResult<GetTurnDiffRangeResponse> {
    let commits = review::commits_for_range(
        &app.db,
        &params.conversation_id,
        params.base_event_id.as_deref(),
        &params.target_event_id,
    )
    .await?;

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
    app: State<'_, AppState>,
) -> AppResult<ListTurnSnapshotsResponse> {
    let conversation_id = params.conversation_id;
    let summary = review::snapshot_summary(&app.db, &conversation_id).await?;

    let response = ListTurnSnapshotsResponse {
        disabled: summary.disabled,
        base_commit_id: summary.base_commit,
        snapshots: summary
            .snapshots
            .into_iter()
            .map(|snapshot| TurnSnapshotDescriptor {
                event_id: snapshot.event_id,
                commit_id: snapshot.commit_sha,
            })
            .collect(),
    };

    Ok(response)
}

#[tauri::command]
pub async fn get_repo_diff(params: GetRepoDiffParams) -> AppResult<GetRepoDiffResponse> {
    let workspace_path = params.workspace_path;
    let base_ref = params.base_ref;
    let target_ref = params.target_ref;
    let include_worktree = params.include_worktree;

    let diff = tokio::task::spawn_blocking(move || -> AnyResult<String> {
        let repo_root = {
            let output = Command::new("git")
                .current_dir(&workspace_path)
                .args(["rev-parse", "--show-toplevel"])
                .output()
                .context("failed to execute git rev-parse --show-toplevel")?;

            if !output.status.success() {
                return Err(anyhow::anyhow!(
                    "workspace is not a git repository (git rev-parse exited with status {})",
                    output.status
                ));
            }

            String::from_utf8(output.stdout)
                .context("git rev-parse produced invalid UTF-8")?
                .trim()
                .to_string()
        };

        let mut cmd = Command::new("git");
        cmd.current_dir(&repo_root).args(["diff", "--no-color"]);

        if include_worktree {
            cmd.arg(&base_ref);
        } else {
            let target_ref = target_ref.ok_or_else(|| anyhow::anyhow!("targetRef is required"))?;
            cmd.args([&base_ref, &target_ref]);
        }

        let output = cmd.output().context("failed to execute git diff")?;

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

    Ok(GetRepoDiffResponse { unified_diff: diff })
}
