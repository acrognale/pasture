use std::num::NonZero;
use std::path::Path;
use std::sync::Arc;
use std::sync::atomic::AtomicBool;

use codex_file_search::FileMatch;
use serde::Deserialize;
use serde::Serialize;
use ts_rs::TS;

use crate::domain::WorkspacePath;
use crate::errors::AppResult;

fn is_git_path(path: &str) -> bool {
    path == ".git" || path.starts_with(".git/") || path.starts_with(".git\\")
}

#[derive(Serialize, Deserialize, Debug, Clone, PartialEq, Eq, TS)]
#[serde(rename_all = "camelCase")]
#[ts(export)]
pub struct SearchWorkspaceFilesParams {
    pub workspace_path: String,
    pub query: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub limit: Option<u32>,
}

#[derive(Serialize, Deserialize, Debug, Clone, PartialEq, Eq, TS)]
#[serde(rename_all = "camelCase")]
#[ts(export)]
pub struct WorkspaceFileHit {
    pub path: String,
    pub score: u32,
}

#[tauri::command]
pub async fn search_workspace_files(
    params: SearchWorkspaceFilesParams,
) -> AppResult<Vec<WorkspaceFileHit>> {
    let workspace = WorkspacePath::canonicalize(&params.workspace_path)?;
    let query = params.query.trim();
    if query.is_empty() {
        return Ok(Vec::new());
    }

    const DEFAULT_LIMIT: usize = 6;
    let limit_value = params
        .limit
        .map(|value| value as usize)
        .unwrap_or(DEFAULT_LIMIT);
    let limit =
        NonZero::new(limit_value.max(1)).unwrap_or_else(|| NonZero::new(DEFAULT_LIMIT).unwrap());
    let threads = NonZero::new(num_cpus::get().max(1)).unwrap_or_else(|| NonZero::new(1).unwrap());

    let results = codex_file_search::run(
        query,
        limit,
        Path::new(workspace.as_str()),
        vec![],
        threads,
        Arc::new(AtomicBool::new(false)),
        false,
        true,
    )?;

    let hits = results
        .matches
        .into_iter()
        .filter(|file_match| !is_git_path(&file_match.path))
        .map(|FileMatch { path, score, .. }| WorkspaceFileHit { path, score })
        .collect();

    Ok(hits)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[tokio::test]
    async fn finds_workspace_files() {
        let temp_dir = tempfile::tempdir().expect("temp dir");
        let workspace_path = temp_dir.path();
        let components_dir = workspace_path.join("src/components");
        std::fs::create_dir_all(&components_dir).expect("create components dir");

        std::fs::write(
            components_dir.join("Button.tsx"),
            "export const Button = () => null;",
        )
        .expect("write button");
        std::fs::write(workspace_path.join("README.md"), "# sample workspace")
            .expect("write readme");

        let results = search_workspace_files(SearchWorkspaceFilesParams {
            workspace_path: workspace_path.to_string_lossy().to_string(),
            query: "button".to_string(),
            limit: Some(10),
        })
        .await
        .expect("search succeeds");

        assert!(results.len() <= 10);
        assert!(
            results
                .iter()
                .any(|hit| hit.path.ends_with("src/components/Button.tsx")),
            "should return matching Button.tsx"
        );
    }

    #[tokio::test]
    async fn respects_gitignore() {
        let temp_dir = tempfile::tempdir().expect("temp dir");
        let workspace_path = temp_dir.path();

        std::fs::write(workspace_path.join(".gitignore"), "ignored.txt\n")
            .expect("write gitignore");
        std::fs::write(workspace_path.join("kept.txt"), "keep me").expect("write kept");
        std::fs::write(workspace_path.join("ignored.txt"), "skip me").expect("write ignored");

        let results = search_workspace_files(SearchWorkspaceFilesParams {
            workspace_path: workspace_path.to_string_lossy().to_string(),
            query: "txt".to_string(),
            limit: Some(10),
        })
        .await
        .expect("search succeeds");

        assert!(results.iter().any(|hit| hit.path == "kept.txt"));
        assert!(
            results.iter().all(|hit| hit.path != "ignored.txt"),
            "ignored file should be filtered by gitignore"
        );
    }
}
