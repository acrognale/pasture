use std::collections::HashMap;
use std::path::Path;
use std::sync::Arc;

use ignore::WalkBuilder;
use serde::{Deserialize, Serialize};
use tokio::sync::RwLock;
use tree_sitter::{Language, Parser, Query, QueryCursor, StreamingIterator};
use ts_rs::TS;

use crate::domain::WorkspacePath;
use crate::errors::{AppError, AppResult};

#[derive(Serialize, Deserialize, Debug, Clone, PartialEq, Eq, TS)]
#[serde(rename_all = "camelCase")]
#[ts(export)]
pub struct WorkspaceSymbolHit {
    pub name: String,
    pub file_path: String,
    pub line: u32,
    pub kind: String,
}

#[derive(Default)]
pub struct SymbolIndexManager {
    cache: RwLock<HashMap<WorkspacePath, Arc<Vec<WorkspaceSymbolHit>>>>,
}

impl SymbolIndexManager {
    pub fn new() -> Self {
        Self {
            cache: RwLock::new(HashMap::new()),
        }
    }

    pub async fn search(
        &self,
        workspace_path: WorkspacePath,
        query: &str,
        limit: Option<usize>,
    ) -> AppResult<Vec<WorkspaceSymbolHit>> {
        let normalized_query = query.trim().to_lowercase();
        if normalized_query.is_empty() {
            return Ok(Vec::new());
        }

        let index = self.ensure_index(workspace_path.clone()).await?;
        let mut matches: Vec<(WorkspaceSymbolHit, String)> = index
            .iter()
            .filter_map(|hit| {
                let name_lower = hit.name.to_lowercase();
                if name_lower.contains(&normalized_query) {
                    Some((hit.clone(), name_lower))
                } else {
                    None
                }
            })
            .collect();

        matches.sort_by(|(a_hit, a_lower), (b_hit, b_lower)| {
            let a_starts = a_lower.starts_with(&normalized_query);
            let b_starts = b_lower.starts_with(&normalized_query);
            match (a_starts, b_starts) {
                (true, false) => std::cmp::Ordering::Less,
                (false, true) => std::cmp::Ordering::Greater,
                _ => a_hit.name.cmp(&b_hit.name),
            }
        });

        if let Some(limit) = limit {
            matches.truncate(limit.max(1));
        }

        Ok(matches.into_iter().map(|(hit, _)| hit).collect())
    }

    async fn ensure_index(
        &self,
        workspace_path: WorkspacePath,
    ) -> AppResult<Arc<Vec<WorkspaceSymbolHit>>> {
        if let Some(index) = self.cache.read().await.get(&workspace_path) {
            return Ok(index.clone());
        }

        let workspace_clone = workspace_path.clone();
        let index =
            tokio::task::spawn_blocking(move || build_symbol_index(&workspace_clone)).await??;
        let index = Arc::new(index);

        let mut cache = self.cache.write().await;
        cache.insert(workspace_path, index.clone());

        Ok(index)
    }
}

#[derive(Clone, Copy, Debug, PartialEq, Eq, Hash)]
enum SupportedLanguage {
    Rust,
    TypeScript,
    Tsx,
}

impl SupportedLanguage {
    fn from_path(path: &Path) -> Option<Self> {
        let extension = path.extension()?.to_string_lossy().to_lowercase();
        match extension.as_str() {
            "rs" => Some(Self::Rust),
            "ts" => Some(Self::TypeScript),
            "tsx" => Some(Self::Tsx),
            _ => None,
        }
    }

    fn language(&self) -> Language {
        match self {
            SupportedLanguage::Rust => tree_sitter_rust::LANGUAGE.into(),
            SupportedLanguage::TypeScript => tree_sitter_typescript::LANGUAGE_TYPESCRIPT.into(),
            SupportedLanguage::Tsx => tree_sitter_typescript::LANGUAGE_TSX.into(),
        }
    }

    fn query_source(&self) -> &'static str {
        match self {
            SupportedLanguage::Rust => include_str!("tree_sitter_queries/rust_tags.scm"),
            SupportedLanguage::TypeScript | SupportedLanguage::Tsx => {
                include_str!("tree_sitter_queries/typescript_tags.scm")
            }
        }
    }
}

struct LanguageContext {
    parser: Parser,
    query: Query,
    capture_names: Vec<String>,
}

impl LanguageContext {
    fn new(language: SupportedLanguage) -> AppResult<Self> {
        let mut parser = Parser::new();
        let lang = language.language();
        parser
            .set_language(&lang)
            .map_err(|e| AppError::Internal(anyhow::Error::msg(e.to_string())))?;

        let query_source = language.query_source();
        let query = Query::new(&lang, query_source)
            .map_err(|err| AppError::Internal(anyhow::Error::msg(err.to_string())))?;
        let capture_names = query
            .capture_names()
            .iter()
            .map(|name| name.to_string())
            .collect();

        Ok(Self {
            parser,
            query,
            capture_names,
        })
    }
}

struct LanguageContexts {
    contexts: HashMap<SupportedLanguage, LanguageContext>,
}

impl LanguageContexts {
    fn new() -> Self {
        Self {
            contexts: HashMap::new(),
        }
    }

    fn get(&mut self, language: SupportedLanguage) -> AppResult<&mut LanguageContext> {
        if !self.contexts.contains_key(&language) {
            let context = LanguageContext::new(language)?;
            self.contexts.insert(language, context);
        }

        self.contexts.get_mut(&language).ok_or_else(|| {
            AppError::Internal(anyhow::anyhow!(
                "Failed to initialize language context for {:?}",
                language
            ))
        })
    }
}

fn build_symbol_index(workspace_path: &WorkspacePath) -> AppResult<Vec<WorkspaceSymbolHit>> {
    let mut symbols = Vec::new();
    let mut language_contexts = LanguageContexts::new();

    let walker = WalkBuilder::new(workspace_path.as_str())
        .git_ignore(true)
        .git_global(true)
        .git_exclude(true)
        .hidden(false)
        .follow_links(false)
        .build();

    for entry in walker {
        let entry = match entry {
            Ok(value) => value,
            Err(_) => continue,
        };

        if !entry.file_type().is_some_and(|ft| ft.is_file()) {
            continue;
        }

        let path = entry.path();
        let Some(language) = SupportedLanguage::from_path(path) else {
            continue;
        };

        let source = std::fs::read_to_string(path)?;
        let relative_path = make_relative_path(workspace_path, path);

        let context = language_contexts.get(language)?;
        let Some(tree) = context.parser.parse(&source, None) else {
            continue;
        };

        let mut cursor = QueryCursor::new();
        let mut matches = cursor.matches(&context.query, tree.root_node(), source.as_bytes());
        while {
            matches.advance();
            matches.get().is_some()
        } {
            let Some(query_match) = matches.get() else {
                continue;
            };
            let mut name = None;
            let mut kind: Option<String> = None;
            let mut line: Option<u32> = None;

            for capture in query_match.captures {
                let capture_name = context.capture_names.get(capture.index as usize);
                let Some(capture_name) = capture_name else {
                    continue;
                };

                if capture_name == "name" {
                    let node = capture.node;
                    if let Ok(text) = node.utf8_text(source.as_bytes()) {
                        name = Some(text.to_string());
                        line = Some(node.start_position().row as u32 + 1);
                    }
                } else if let Some(kind_name) = capture_name.strip_prefix("kind.") {
                    kind = Some(kind_name.to_string());
                    if line.is_none() {
                        line = Some(capture.node.start_position().row as u32 + 1);
                    }
                }
            }

            let Some(name) = name else {
                continue;
            };

            symbols.push(WorkspaceSymbolHit {
                name,
                file_path: relative_path.clone(),
                line: line.unwrap_or(1),
                kind: kind.unwrap_or_else(|| "symbol".to_string()),
            });
        }
    }

    Ok(symbols)
}

fn make_relative_path(workspace_path: &WorkspacePath, file_path: &Path) -> String {
    let relative = Path::new(workspace_path.as_str());
    file_path
        .strip_prefix(relative)
        .map(|path| path.to_string_lossy())
        .unwrap_or_else(|_| file_path.to_string_lossy())
        .replace('\\', "/")
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn indexes_rust_symbols() {
        let temp_dir = tempfile::tempdir().expect("temp dir");
        let workspace_path = WorkspacePath(temp_dir.path().to_string_lossy().to_string());

        let file_path = temp_dir.path().join("src/lib.rs");
        std::fs::create_dir_all(file_path.parent().unwrap()).expect("mkdir src");
        std::fs::write(
            &file_path,
            r#"
pub struct Widget {}

impl Widget {
    pub fn compute(&self) -> i32 { 42 }
}

fn helper() {}
"#,
        )
        .expect("write rust file");

        let symbols = build_symbol_index(&workspace_path).expect("index");
        assert!(
            symbols
                .iter()
                .any(|hit| hit.name == "Widget" && hit.kind == "struct")
        );
        assert!(
            symbols
                .iter()
                .any(|hit| hit.name == "compute" && hit.kind == "method")
        );
        assert!(
            symbols
                .iter()
                .any(|hit| hit.name == "helper" && hit.kind == "function")
        );
    }

    #[test]
    fn indexes_typescript_symbols() {
        let temp_dir = tempfile::tempdir().expect("temp dir");
        let workspace_path = WorkspacePath(temp_dir.path().to_string_lossy().to_string());

        let file_path = temp_dir.path().join("src/components/Button.tsx");
        std::fs::create_dir_all(file_path.parent().unwrap()).expect("mkdir src");
        std::fs::write(
            &file_path,
            r#"
export function Button() {
  return <button>Click</button>;
}

export class Dialog {
  open() {}
}

interface Props { title: string }
"#,
        )
        .expect("write tsx file");

        let symbols = build_symbol_index(&workspace_path).expect("index");
        assert!(
            symbols
                .iter()
                .any(|hit| hit.name == "Button" && hit.kind == "function")
        );
        assert!(
            symbols
                .iter()
                .any(|hit| hit.name == "Dialog" && hit.kind == "class")
        );
        assert!(
            symbols
                .iter()
                .any(|hit| hit.name == "Props" && hit.kind == "interface")
        );
    }

    #[tokio::test]
    async fn searches_symbols_with_limit() {
        let temp_dir = tempfile::tempdir().expect("temp dir");
        let workspace =
            WorkspacePath::canonicalize(temp_dir.path().to_string_lossy().as_ref()).unwrap();
        let file_path = temp_dir.path().join("src/main.rs");
        std::fs::create_dir_all(file_path.parent().unwrap()).expect("mkdir src");
        std::fs::write(
            &file_path,
            r#"
fn alpha_helper() {}
fn alpha_beta() {}
fn beta_helper() {}
"#,
        )
        .expect("write file");

        let manager = SymbolIndexManager::new();
        let results = manager
            .search(workspace.clone(), "alpha", Some(1))
            .await
            .expect("search");

        assert_eq!(results.len(), 1);
        assert!(results[0].name.starts_with("alpha"));

        // Ensure cache hits on subsequent calls.
        let second = manager
            .search(workspace, "beta", Some(10))
            .await
            .expect("search again");
        assert!(second.iter().any(|hit| hit.name == "beta_helper"));
    }
}
