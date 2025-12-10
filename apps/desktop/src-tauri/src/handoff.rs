use std::collections::BTreeSet;
use std::collections::HashSet;
use std::path::Path;

use codex_protocol::protocol::HandoffPlanEvent;
use serde::Serialize;
use tokio::process::Command;

use crate::context::WorkspaceContext;
use crate::errors::AppError;
use crate::errors::AppResult;
use crate::review;

#[derive(Debug, Clone)]
pub struct HandoffPlan {
    pub title: Option<String>,
    pub composer_prompt: String,
    pub preview: Option<String>,
    pub relevant_files: Vec<HandoffFileRef>,
}

#[derive(Debug, Clone, Serialize)]
pub struct HandoffFileRef {
    pub path: String,
    #[serde(default)]
    pub reason: String,
}

impl From<HandoffPlanEvent> for HandoffPlan {
    fn from(value: HandoffPlanEvent) -> Self {
        HandoffPlan {
            title: value.title,
            composer_prompt: value.handoff_prompt,
            preview: value.preview,
            relevant_files: value
                .relevant_files
                .into_iter()
                .map(|file| HandoffFileRef {
                    path: file.path,
                    reason: file.reason,
                })
                .collect(),
        }
    }
}

/// Collect candidate files from review snapshots to guide the planner.
pub async fn collect_candidate_files_from_snapshots(
    ctx: &WorkspaceContext,
    conversation_id: &codex_protocol::ConversationId,
) -> AppResult<Vec<String>> {
    let summary = match review::snapshot_summary(ctx.db(), conversation_id).await {
        Ok(summary) => summary,
        Err(AppError::NotFound { .. }) => return Ok(Vec::new()),
        Err(err) => return Err(err),
    };

    if summary.disabled {
        return Ok(Vec::new());
    }

    let Some(base_commit) = summary.base_commit else {
        return Ok(Vec::new());
    };
    let Some(latest) = summary.snapshots.last() else {
        return Ok(Vec::new());
    };

    let diff_paths = git_diff_names(
        Path::new(ctx.path.as_str()),
        &base_commit,
        &latest.commit_sha,
    )
    .await;

    let mut unique = BTreeSet::new();
    for path in diff_paths.unwrap_or_default() {
        unique.insert(path);
    }

    Ok(unique.into_iter().take(50).collect())
}

async fn git_diff_names(
    workspace_path: &Path,
    base_commit: &str,
    target_commit: &str,
) -> Option<Vec<String>> {
    let output = Command::new("git")
        .arg("diff")
        .arg("--name-only")
        .arg(base_commit)
        .arg(target_commit)
        .current_dir(workspace_path)
        .output()
        .await
        .ok()?;

    if !output.status.success() {
        log::debug!(
            "git diff --name-only failed for {}..{} (status: {})",
            base_commit,
            target_commit,
            output.status
        );
        return None;
    }

    let stdout = String::from_utf8_lossy(&output.stdout);
    let mut seen = HashSet::new();
    let mut paths = Vec::new();
    for line in stdout.lines() {
        let trimmed = line.trim();
        if trimmed.is_empty() {
            continue;
        }
        let normalized = normalize_workspace_path(workspace_path, Path::new(trimmed))
            .unwrap_or_else(|| trimmed.to_string());
        if seen.insert(normalized.clone()) {
            paths.push(normalized);
        }
    }

    if paths.is_empty() {
        None
    } else {
        Some(paths)
    }
}

fn normalize_workspace_path(workspace_path: &Path, path: &Path) -> Option<String> {
    let joined = if path.is_absolute() {
        path.to_path_buf()
    } else {
        workspace_path.join(path)
    };

    joined
        .strip_prefix(workspace_path)
        .ok()
        .map(|value| value.to_string_lossy().to_string())
}
