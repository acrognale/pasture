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
pub struct GetRepoFingerprintParams {
    pub workspace_path: String,
}

#[derive(Serialize, Deserialize, Debug, Clone, PartialEq, TS)]
#[serde(rename_all = "camelCase")]
pub struct GetRepoFingerprintResponse {
    pub token: String,
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
        fn join_diffs(diffs: Vec<String>) -> String {
            let mut out = String::new();
            for chunk in diffs.into_iter().filter(|d| !d.trim().is_empty()) {
                if !out.is_empty() {
                    out.push('\n');
                }
                out.push_str(chunk.trim_end());
            }
            if out.is_empty() {
                out
            } else {
                out.push('\n');
                out
            }
        }

        fn run_git(args: &[&str], cwd: &str) -> AnyResult<std::process::Output> {
            Command::new("git")
                .current_dir(cwd)
                .args(args)
                .output()
                .with_context(|| format!("failed to execute git {}", args.join(" ")))
        }

        fn ref_exists(repo_root: &str, rev: &str) -> AnyResult<bool> {
            let spec = format!("{rev}^{{commit}}");
            let output = Command::new("git")
                .current_dir(repo_root)
                .args(["rev-parse", "--verify", &spec])
                .output()
                .with_context(|| format!("failed to execute git rev-parse --verify {spec}"))?;
            Ok(output.status.success())
        }

        fn output_to_string(output: std::process::Output) -> AnyResult<String> {
            if !output.status.success() {
                let stderr = String::from_utf8_lossy(&output.stderr);
                let stderr = stderr.trim();
                if stderr.is_empty() {
                    return Err(anyhow::anyhow!(
                        "git diff exited with status {}",
                        output.status
                    ));
                }
                return Err(anyhow::anyhow!(
                    "git diff exited with status {}: {}",
                    output.status,
                    stderr
                ));
            }
            String::from_utf8(output.stdout).context("git diff produced invalid UTF-8")
        }

        fn output_to_string_allow_exit_1(output: std::process::Output) -> AnyResult<String> {
            if output.status.success() {
                return String::from_utf8(output.stdout).context("git diff produced invalid UTF-8");
            }

            // `git diff --no-index` returns exit code 1 when differences are found.
            if output.status.code() == Some(1) {
                return String::from_utf8(output.stdout).context("git diff produced invalid UTF-8");
            }

            output_to_string(output)
        }

        fn untracked_diffs(repo_root: &str) -> AnyResult<String> {
            let output = run_git(
                &["ls-files", "--others", "--exclude-standard", "-z"],
                repo_root,
            )?;
            if !output.status.success() {
                let stderr = String::from_utf8_lossy(&output.stderr);
                let stderr = stderr.trim();
                if stderr.is_empty() {
                    return Err(anyhow::anyhow!(
                        "git ls-files exited with status {}",
                        output.status
                    ));
                }
                return Err(anyhow::anyhow!(
                    "git ls-files exited with status {}: {}",
                    output.status,
                    stderr
                ));
            }

            let mut chunks = Vec::new();
            for raw in output.stdout.split(|b| *b == 0) {
                if raw.is_empty() {
                    continue;
                }
                let rel = String::from_utf8(raw.to_vec())
                    .context("git ls-files produced invalid UTF-8")?;
                let path = std::path::Path::new(repo_root).join(&rel);
                if path.is_dir() {
                    continue;
                }
                let path_str = path
                    .to_str()
                    .ok_or_else(|| anyhow::anyhow!("untracked path is not valid UTF-8: {rel}"))?;

                // `git diff` does not include untracked files, but `--no-index` against /dev/null does.
                let diff = output_to_string_allow_exit_1(run_git(
                    &[
                        "diff",
                        "--no-color",
                        "--no-index",
                        "--",
                        "/dev/null",
                        path_str,
                    ],
                    repo_root,
                )?)?;
                chunks.push(diff);
            }

            Ok(join_diffs(chunks))
        }

        let repo_root = {
            let output = run_git(&["rev-parse", "--show-toplevel"], &workspace_path)?;
            if !output.status.success() {
                let stderr = String::from_utf8_lossy(&output.stderr);
                let stderr = stderr.trim();
                if stderr.is_empty() {
                    return Err(anyhow::anyhow!("workspace is not a git repository"));
                }
                return Err(anyhow::anyhow!(
                    "workspace is not a git repository: {stderr}"
                ));
            }
            String::from_utf8(output.stdout)
                .context("git rev-parse produced invalid UTF-8")?
                .trim()
                .to_string()
        };

        if include_worktree {
            if ref_exists(&repo_root, &base_ref)? {
                let tracked =
                    output_to_string(run_git(&["diff", "--no-color", &base_ref], &repo_root)?)?;
                let untracked = untracked_diffs(&repo_root)?;
                return Ok(join_diffs(vec![tracked, untracked]));
            }

            // Handle repos with no commits yet ("unborn HEAD").
            // `git diff HEAD` fails, but `git diff --cached` + `git diff` provide a useful equivalent.
            if base_ref == "HEAD" {
                let staged =
                    output_to_string(run_git(&["diff", "--no-color", "--cached"], &repo_root)?)?;
                let unstaged = output_to_string(run_git(&["diff", "--no-color"], &repo_root)?)?;
                let untracked = untracked_diffs(&repo_root)?;
                return Ok(join_diffs(vec![staged, unstaged, untracked]));
            }

            return Err(anyhow::anyhow!("unknown base ref: {base_ref}"));
        } else {
            let target_ref = target_ref.ok_or_else(|| anyhow::anyhow!("targetRef is required"))?;
            if !ref_exists(&repo_root, &base_ref)? {
                return Err(anyhow::anyhow!("unknown base ref: {base_ref}"));
            }
            if !ref_exists(&repo_root, &target_ref)? {
                return Err(anyhow::anyhow!("unknown target ref: {target_ref}"));
            }
            let output = run_git(&["diff", "--no-color", &base_ref, &target_ref], &repo_root)?;
            return output_to_string(output);
        }
    })
    .await?
    .map_err(|error| AppError::Validation {
        message: error.to_string(),
    })?;

    Ok(GetRepoDiffResponse { unified_diff: diff })
}

#[tauri::command]
pub async fn get_repo_fingerprint(
    params: GetRepoFingerprintParams,
) -> AppResult<GetRepoFingerprintResponse> {
    let workspace_path = params.workspace_path;

    let token = tokio::task::spawn_blocking(move || -> AnyResult<String> {
        fn run_git(args: &[&str], cwd: &str) -> AnyResult<std::process::Output> {
            Command::new("git")
                .current_dir(cwd)
                .args(args)
                .output()
                .with_context(|| format!("failed to execute git {}", args.join(" ")))
        }

        fn fnv1a_64(bytes: &[u8]) -> u64 {
            const FNV_OFFSET_BASIS: u64 = 0xcbf29ce484222325;
            const FNV_PRIME: u64 = 0x00000100000001B3;
            let mut hash = FNV_OFFSET_BASIS;
            for byte in bytes {
                hash ^= u64::from(*byte);
                hash = hash.wrapping_mul(FNV_PRIME);
            }
            hash
        }

        let head_output = run_git(&["rev-parse", "--verify", "HEAD"], &workspace_path)?;
        let head = if head_output.status.success() {
            String::from_utf8_lossy(&head_output.stdout)
                .trim()
                .to_string()
        } else {
            "__UNBORN__".to_string()
        };

        let branch_output = run_git(&["rev-parse", "--abbrev-ref", "HEAD"], &workspace_path)?;
        let branch = if branch_output.status.success() {
            String::from_utf8_lossy(&branch_output.stdout)
                .trim()
                .to_string()
        } else {
            "".to_string()
        };

        let status_output = run_git(
            &["status", "--porcelain=v1", "-z", "--untracked-files=all"],
            &workspace_path,
        )?;
        let status_hash = if status_output.status.success() {
            fnv1a_64(&status_output.stdout)
        } else {
            0
        };

        Ok(format!("{head}|{branch}|{:016x}", status_hash))
    })
    .await?
    .map_err(AppError::Internal)?;

    Ok(GetRepoFingerprintResponse { token })
}
