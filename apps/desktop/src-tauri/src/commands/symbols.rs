use serde::{Deserialize, Serialize};
use ts_rs::TS;

use crate::domain::WorkspacePath;
use crate::errors::AppResult;
use crate::state::AppState;
use crate::symbol_index::WorkspaceSymbolHit;

#[derive(Serialize, Deserialize, Debug, Clone, PartialEq, Eq, TS)]
#[serde(rename_all = "camelCase")]
#[ts(export)]
pub struct SearchWorkspaceSymbolsParams {
    pub workspace_path: String,
    pub query: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub limit: Option<u32>,
}

#[tauri::command]
pub async fn search_workspace_symbols(
    params: SearchWorkspaceSymbolsParams,
    app: tauri::State<'_, AppState>,
) -> AppResult<Vec<WorkspaceSymbolHit>> {
    let workspace = WorkspacePath::canonicalize(&params.workspace_path)?;
    let limit = params.limit.map(|value| value as usize);
    let hits = app
        .symbol_index
        .search(workspace, &params.query, limit)
        .await?;
    Ok(hits)
}
