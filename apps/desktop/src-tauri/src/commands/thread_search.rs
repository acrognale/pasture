use sea_orm::ColumnTrait;
use sea_orm::EntityTrait;
use sea_orm::QueryFilter;
use serde::Deserialize;
use serde::Serialize;
use tauri::State;
use ts_rs::TS;

use crate::domain::WorkspacePath;
use crate::errors::AppResult;
use crate::state::AppState;

#[derive(Serialize, Deserialize, Debug, Clone, PartialEq, Eq, TS)]
#[serde(rename_all = "camelCase")]
#[ts(export)]
pub struct SearchThreadsParams {
    pub workspace_path: String,
    pub query: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub limit: Option<u32>,
}

#[derive(Serialize, Deserialize, Debug, Clone, PartialEq, TS)]
#[serde(rename_all = "camelCase")]
#[ts(export)]
pub struct ThreadSearchHit {
    pub thread_id: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub title: Option<String>,
    pub preview: String,
    pub timestamp: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub snippet: Option<String>,
    pub score: f32,
}

#[derive(Serialize, Deserialize, Debug, Clone, PartialEq, TS)]
#[serde(rename_all = "camelCase")]
#[ts(export)]
pub struct SearchThreadsResponse {
    pub hits: Vec<ThreadSearchHit>,
    pub is_indexing: bool,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub index_error: Option<String>,
}

#[tauri::command]
pub async fn search_threads(
    params: SearchThreadsParams,
    app: State<'_, AppState>,
) -> AppResult<SearchThreadsResponse> {
    let workspace = WorkspacePath::canonicalize(&params.workspace_path)?;
    let query = params.query.trim();
    if query.is_empty() {
        return Ok(SearchThreadsResponse {
            hits: Vec::new(),
            is_indexing: false,
            index_error: None,
        });
    }

    const DEFAULT_LIMIT: usize = 25;
    let limit = params
        .limit
        .map(|v| v as usize)
        .unwrap_or(DEFAULT_LIMIT)
        .max(1);

    let (hits, stats) = app
        .thread_search
        .search_existing(workspace.clone(), query, limit)
        .await?;

    let thread_ids: Vec<String> = hits.iter().map(|h| h.thread_id.clone()).collect();
    let mut metadata = std::collections::HashMap::<String, (Option<String>, String, String)>::new();

    if !thread_ids.is_empty() {
        let models = crate::db::schema::threads::Entity::find()
            .filter(crate::db::schema::threads::Column::WorkspacePath.eq(workspace.as_str()))
            .filter(crate::db::schema::threads::Column::Id.is_in(thread_ids.clone()))
            .all(&app.db)
            .await
            .map_err(|e| crate::db::db_err("load thread metadata for search results", e))?;

        for model in models {
            let preview = model
                .preview
                .clone()
                .or_else(|| model.title.clone())
                .unwrap_or_else(|| "Untitled thread".to_string());
            metadata.insert(model.id, (model.title, preview, model.updated_at));
        }
    }

    let mapped: Vec<ThreadSearchHit> =
        hits.into_iter()
            .map(|hit| {
                let (title, preview, timestamp) = metadata
                    .get(&hit.thread_id)
                    .cloned()
                    .unwrap_or((None, "Untitled thread".to_string(), "".to_string()));

                ThreadSearchHit {
                    thread_id: hit.thread_id,
                    title,
                    preview,
                    timestamp,
                    snippet: hit.snippet,
                    score: hit.score,
                }
            })
            .collect();

    Ok(SearchThreadsResponse {
        hits: mapped,
        is_indexing: stats.is_indexing,
        index_error: stats.last_error,
    })
}
