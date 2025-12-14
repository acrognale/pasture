use std::collections::HashMap;
use std::collections::HashSet;
use std::fs;
use std::io::BufRead;
use std::io::BufReader;
use std::io::Seek;
use std::io::SeekFrom;
use std::path::Path;
use std::path::PathBuf;
use std::sync::Arc;
use std::sync::Mutex;
use std::sync::atomic::AtomicBool;
use std::sync::atomic::Ordering;

use sea_orm::ColumnTrait;
use sea_orm::DatabaseConnection;
use sea_orm::EntityTrait;
use sea_orm::QueryFilter;
use serde::Deserialize;
use serde::Serialize;
use tantivy::Index;
use tantivy::IndexReader;
use tantivy::IndexWriter;
use tantivy::ReloadPolicy;
use tantivy::TantivyDocument;
use tantivy::Term;
use tantivy::collector::TopDocs;
use tantivy::query::QueryParser;
use tantivy::schema::FAST;
use tantivy::schema::Field;
use tantivy::schema::STORED;
use tantivy::schema::STRING;
use tantivy::schema::Schema;
use tantivy::schema::TEXT;
use tantivy::schema::Value;
use tantivy::snippet::SnippetGenerator;
use time::OffsetDateTime;
use time::format_description::well_known::Rfc3339;
use tokio::sync::OnceCell;
use tokio::sync::RwLock;
use uuid::Uuid;

use crate::db::db_err;
use crate::db::schema;
use crate::domain::WorkspacePath;
use crate::errors::AppError;
use crate::errors::AppResult;

// Keep dev/debug and packaged/release indexes separate to avoid cross-version/schema conflicts.
const INDEX_PARENT_DIR: &str = if cfg!(debug_assertions) {
    "thread-search-dev"
} else {
    "thread-search"
};
const WORKSPACE_STATE_FILE: &str = "state.json";
const DOC_TYPE_THREAD: &str = "thread";
const DOC_TYPE_MESSAGE: &str = "message";
const UNTITLED_THREAD: &str = "Untitled thread";
const EXTRACT_VERSION: u32 = 2;

#[derive(Clone, Debug)]
pub struct SearchIndexHit {
    pub thread_id: String,
    pub score: f32,
    pub snippet: Option<String>,
}

#[derive(Debug, Default, Clone)]
pub struct SearchStats {
    pub is_indexing: bool,
    pub last_error: Option<String>,
}

#[derive(Default)]
pub struct ThreadSearchManager {
    base_dir: PathBuf,
    cache: RwLock<HashMap<WorkspacePath, Arc<OnceCell<Arc<WorkspaceThreadSearch>>>>>,
}

struct SearchCandidate {
    thread_id: String,
    score: f32,
    is_thread_doc: bool,
    doc: TantivyDocument,
}

impl ThreadSearchManager {
    pub fn new(app_data_dir: PathBuf) -> Self {
        Self {
            base_dir: app_data_dir.join(INDEX_PARENT_DIR),
            cache: RwLock::new(HashMap::new()),
        }
    }

    pub async fn ensure_indexing_started(
        &self,
        db: DatabaseConnection,
        workspace_path: WorkspacePath,
    ) -> AppResult<SearchStats> {
        let index = self.ensure_index(workspace_path.clone()).await?;
        index.maybe_spawn_indexer(db, workspace_path);
        Ok(index.stats())
    }

    pub async fn search_existing(
        &self,
        workspace_path: WorkspacePath,
        query: &str,
        limit: usize,
    ) -> AppResult<(Vec<SearchIndexHit>, SearchStats)> {
        let index = self.ensure_index(workspace_path).await?;
        let query = query.to_string();
        let index_for_search = Arc::clone(&index);
        let hits = tokio::task::spawn_blocking(move || index_for_search.search(&query, limit))
            .await
            .map_err(|e| AppError::Internal(anyhow::anyhow!("Search task failed: {e}")))??;
        let stats = index.stats();
        Ok((hits, stats))
    }

    async fn ensure_index(
        &self,
        workspace_path: WorkspacePath,
    ) -> AppResult<Arc<WorkspaceThreadSearch>> {
        let cell = {
            let mut cache = self.cache.write().await;
            cache
                .entry(workspace_path.clone())
                .or_insert_with(|| Arc::new(OnceCell::new()))
                .clone()
        };

        tokio::fs::create_dir_all(&self.base_dir).await?;
        let workspace_id = Uuid::new_v5(&Uuid::NAMESPACE_OID, workspace_path.as_str().as_bytes());
        let workspace_dir = self.base_dir.join(workspace_id.to_string());

        let index = cell
            .get_or_try_init(|| async move {
                let index =
                    tokio::task::spawn_blocking(move || WorkspaceThreadSearch::open(workspace_dir))
                        .await??;
                Ok::<_, AppError>(Arc::new(index))
            })
            .await?;

        Ok(index.clone())
    }
}

struct WorkspaceThreadSearch {
    dir: PathBuf,
    index: Index,
    reader: IndexReader,
    writer: Mutex<IndexWriter>,
    fields: SearchFields,
    state: Mutex<WorkspaceIndexState>,
    indexing: AtomicBool,
    last_error: Mutex<Option<String>>,
}

impl WorkspaceThreadSearch {
    fn open(dir: PathBuf) -> AppResult<Self> {
        fs::create_dir_all(&dir)?;
        let schema = build_schema();

        match Self::open_inner(dir.clone(), schema.clone()) {
            Ok(index) => Ok(index),
            Err(OpenFailure {
                err,
                can_rebuild: true,
            }) => {
                tracing::warn!(
                    dir = ?dir,
                    error = %err,
                    "Thread search index open failed; rebuilding derived index"
                );
                let _ = fs::remove_dir_all(&dir);
                fs::create_dir_all(&dir)?;
                Self::open_fresh(dir, schema)
            }
            Err(OpenFailure {
                err,
                can_rebuild: false,
            }) => Err(err),
        }
    }

    fn open_fresh(dir: PathBuf, schema: Schema) -> AppResult<Self> {
        let index = Index::create_in_dir(&dir, schema)
            .map_err(|e| AppError::Internal(anyhow::anyhow!("Failed to create index: {e}")))?;
        Self::init(dir, index).map_err(|err| err.err)
    }

    fn open_inner(dir: PathBuf, schema: Schema) -> Result<Self, OpenFailure> {
        let index = match Index::open_in_dir(&dir) {
            Ok(idx) => idx,
            Err(open_err) => match Index::create_in_dir(&dir, schema) {
                Ok(idx) => idx,
                Err(create_err) => {
                    let can_rebuild = !is_lock_failure(&open_err) && !is_lock_failure(&create_err);
                    return Err(OpenFailure {
                        err: AppError::Internal(anyhow::anyhow!(
                            "Failed to open/create index: open={open_err}; create={create_err}"
                        )),
                        can_rebuild,
                    });
                }
            },
        };

        Self::init(dir, index)
    }

    fn init(dir: PathBuf, index: Index) -> Result<Self, OpenFailure> {
        let fields = match SearchFields::from_schema(index.schema()) {
            Ok(fields) => fields,
            Err(err) => {
                return Err(OpenFailure {
                    err,
                    // Schema mismatch is a safe rebuild trigger; index is derived.
                    can_rebuild: true,
                });
            }
        };

        let reader = index
            .reader_builder()
            .reload_policy(ReloadPolicy::OnCommitWithDelay)
            .try_into()
            .map_err(|e| OpenFailure {
                err: AppError::Internal(anyhow::anyhow!("Failed to create reader: {e}")),
                can_rebuild: true,
            })?;

        let writer = index.writer(50_000_000).map_err(|e| OpenFailure {
            can_rebuild: !is_lock_failure(&e),
            err: AppError::Internal(anyhow::anyhow!("Failed to create writer: {e}")),
        })?;

        let state_path = dir.join(WORKSPACE_STATE_FILE);
        let state = WorkspaceIndexState::load(&state_path).unwrap_or_default();

        Ok(Self {
            dir,
            index,
            reader,
            writer: Mutex::new(writer),
            fields,
            state: Mutex::new(state),
            indexing: AtomicBool::new(false),
            last_error: Mutex::new(None),
        })
    }

    fn state_path(&self) -> PathBuf {
        self.dir.join(WORKSPACE_STATE_FILE)
    }

    fn stats(&self) -> SearchStats {
        SearchStats {
            is_indexing: self.indexing.load(Ordering::Relaxed),
            last_error: self
                .last_error
                .lock()
                .ok()
                .map(|g| g.clone())
                .unwrap_or(None),
        }
    }

    fn maybe_spawn_indexer(
        self: &Arc<Self>,
        db: DatabaseConnection,
        workspace_path: WorkspacePath,
    ) {
        if self
            .indexing
            .compare_exchange(false, true, Ordering::SeqCst, Ordering::SeqCst)
            .is_err()
        {
            return;
        }

        let this = Arc::clone(self);
        tokio::task::spawn_blocking(move || {
            let result = this.run_indexer(&db, &workspace_path);
            match result {
                Ok(()) => {
                    if let Ok(mut lock) = this.last_error.lock() {
                        *lock = None;
                    }
                }
                Err(err) => {
                    if let Ok(mut lock) = this.last_error.lock() {
                        *lock = Some(err.to_string());
                    }
                }
            }

            this.indexing.store(false, Ordering::SeqCst);
        });
    }

    fn search(&self, query: &str, limit: usize) -> AppResult<Vec<SearchIndexHit>> {
        let trimmed = query.trim();
        if trimmed.is_empty() {
            return Ok(Vec::new());
        }

        let searcher = self.reader.searcher();
        let mut parser = QueryParser::for_index(
            &self.index,
            vec![self.fields.title, self.fields.preview, self.fields.body],
        );
        parser.set_conjunction_by_default();

        let parsed = parser
            .parse_query(trimmed)
            .map_err(|e| AppError::Validation {
                message: format!("Invalid search query: {e}"),
            })?;

        // Keep candidate set bounded; we only need enough docs to discover `limit` unique threads.
        // Larger values can make very common-term queries expensive.
        let candidate_limit = limit.saturating_mul(4).max(20);

        let top_docs = searcher
            .search(&parsed, &TopDocs::with_limit(candidate_limit))
            .map_err(|e| AppError::Internal(anyhow::anyhow!("Search failed: {e}")))?;

        let mut top_docs = top_docs;
        top_docs.sort_by(|(a_score, _), (b_score, _)| {
            b_score
                .partial_cmp(a_score)
                .unwrap_or(std::cmp::Ordering::Equal)
        });

        let mut seen_threads: HashSet<String> = HashSet::new();
        let mut candidates: Vec<SearchCandidate> = Vec::new();

        for (score, doc_address) in top_docs {
            let doc: TantivyDocument = searcher
                .doc(doc_address)
                .map_err(|e| AppError::Internal(anyhow::anyhow!("Doc load failed: {e}")))?;

            let thread_id = doc
                .get_first(self.fields.thread_id)
                .and_then(|v| v.as_str())
                .unwrap_or("")
                .to_string();

            if thread_id.is_empty() {
                continue;
            }

            if !seen_threads.insert(thread_id.clone()) {
                continue;
            }

            let doc_type = doc
                .get_first(self.fields.doc_type)
                .and_then(|v| v.as_str())
                .unwrap_or(DOC_TYPE_MESSAGE);
            let is_thread_doc = doc_type == DOC_TYPE_THREAD;
            candidates.push(SearchCandidate {
                thread_id,
                score,
                is_thread_doc,
                doc,
            });

            // Since `top_docs` is sorted by descending score, once we have enough unique threads,
            // later docs cannot contribute higher-scoring threads.
            if candidates.len() >= limit.max(1) {
                break;
            }
        }

        // `candidates` is already ordered by descending score because `top_docs` is sorted.

        // Only generate snippets for the final selected thread hits.
        let mut snippet_body = SnippetGenerator::create(&searcher, &parsed, self.fields.body).ok();
        let mut snippet_title =
            SnippetGenerator::create(&searcher, &parsed, self.fields.title).ok();

        let mut hits: Vec<SearchIndexHit> = Vec::with_capacity(candidates.len());
        for candidate in candidates {
            let snippet = if candidate.is_thread_doc {
                snippet_title
                    .as_mut()
                    .map(|snippet_gen| snippet_gen.snippet_from_doc(&candidate.doc).to_html())
            } else {
                snippet_body
                    .as_mut()
                    .map(|snippet_gen| snippet_gen.snippet_from_doc(&candidate.doc).to_html())
            };

            hits.push(SearchIndexHit {
                thread_id: candidate.thread_id,
                score: candidate.score,
                snippet,
            });
        }

        // Preserve deterministic ordering (highest score first).
        hits.sort_by(|a, b| {
            b.score
                .partial_cmp(&a.score)
                .unwrap_or(std::cmp::Ordering::Equal)
        });

        Ok(hits)
    }

    fn run_indexer(&self, db: &DatabaseConnection, workspace: &WorkspacePath) -> AppResult<()> {
        let handle = tokio::runtime::Handle::current();

        let (threads, conversations) = handle.block_on(async move {
            let threads = schema::threads::Entity::find()
                .filter(schema::threads::Column::WorkspacePath.eq(workspace.as_str()))
                .all(db)
                .await
                .map_err(|e| db_err("list threads for indexing", e))?;

            let mut conversations: Vec<(String, String, Option<String>)> = Vec::new();
            for thread in &threads {
                let convs = schema::conversations::Entity::find()
                    .filter(schema::conversations::Column::ThreadId.eq(thread.id.clone()))
                    .all(db)
                    .await
                    .map_err(|e| db_err("list conversations for indexing", e))?;
                for conv in convs {
                    conversations.push((thread.id.clone(), conv.id, conv.rollout_path));
                }
            }

            Ok::<_, AppError>((threads, conversations))
        })?;

        let mut writer = self
            .writer
            .lock()
            .map_err(|_| AppError::Internal(anyhow::anyhow!("Index writer lock poisoned")))?;

        let previous_states = self
            .state
            .lock()
            .map_err(|_| AppError::Internal(anyhow::anyhow!("Index state lock poisoned")))?
            .conversations
            .clone();

        // Upsert thread meta docs.
        for thread in &threads {
            let doc_id = format!("thread:{}", thread.id);
            writer.delete_term(Term::from_field_text(self.fields.doc_id, &doc_id));

            let updated_at_ms = parse_rfc3339_ms(&thread.updated_at).unwrap_or(0);
            let preview = thread
                .preview
                .clone()
                .or_else(|| thread.title.clone())
                .unwrap_or_else(|| UNTITLED_THREAD.to_string());

            let mut doc = TantivyDocument::default();
            doc.add_text(self.fields.doc_id, &doc_id);
            doc.add_text(self.fields.doc_type, DOC_TYPE_THREAD);
            doc.add_text(self.fields.thread_id, &thread.id);
            if let Some(title) = &thread.title {
                doc.add_text(self.fields.title, title);
            }
            doc.add_text(self.fields.preview, &preview);
            doc.add_i64(self.fields.updated_at_ms, updated_at_ms);

            writer.add_document(doc).map_err(map_tantivy_error)?;
        }

        // Index new rollout content incrementally.
        let mut active_conversations: HashMap<String, ConversationIndexState> = HashMap::new();

        for (thread_id, conversation_id, rollout_path) in conversations {
            let Some(rollout_path) = rollout_path.filter(|path| !path.trim().is_empty()) else {
                continue;
            };
            let conv_state = previous_states
                .get(&conversation_id)
                .cloned()
                .unwrap_or_else(|| ConversationIndexState {
                    rollout_path: rollout_path.clone(),
                    offset: 0,
                    file_size: 0,
                    modified_ms: 0,
                    // Force a reset when state is missing to avoid duplicates.
                    extract_version: 0,
                });

            let updated = index_rollout_incremental(
                &mut writer,
                &self.fields,
                &thread_id,
                &conversation_id,
                &rollout_path,
                conv_state,
            )?;

            active_conversations.insert(conversation_id, updated);
        }

        writer
            .commit()
            .map_err(|e| AppError::Internal(anyhow::anyhow!("Index commit failed: {e}")))?;

        self.reader
            .reload()
            .map_err(|e| AppError::Internal(anyhow::anyhow!("Index reload failed: {e}")))?;

        // Persist state after commit so offsets never advance past committed docs.
        let mut state = self
            .state
            .lock()
            .map_err(|_| AppError::Internal(anyhow::anyhow!("Index state lock poisoned")))?;
        state.conversations = active_conversations;
        state.save_atomic(&self.state_path())?;

        Ok(())
    }
}

#[derive(Clone)]
struct SearchFields {
    doc_id: Field,
    doc_type: Field,
    thread_id: Field,
    conversation_id: Field,
    title: Field,
    preview: Field,
    body: Field,
    timestamp_ms: Field,
    updated_at_ms: Field,
}

impl SearchFields {
    fn from_schema(schema: Schema) -> AppResult<Self> {
        let get = |name: &str| {
            schema
                .get_field(name)
                .map_err(|_| AppError::Internal(anyhow::anyhow!("Missing schema field: {name}")))
        };

        Ok(Self {
            doc_id: get("doc_id")?,
            doc_type: get("doc_type")?,
            thread_id: get("thread_id")?,
            conversation_id: get("conversation_id")?,
            title: get("title")?,
            preview: get("preview")?,
            body: get("body")?,
            timestamp_ms: get("timestamp_ms")?,
            updated_at_ms: get("updated_at_ms")?,
        })
    }
}

fn build_schema() -> Schema {
    let mut schema = tantivy::schema::Schema::builder();
    schema.add_text_field("doc_id", STRING | STORED);
    schema.add_text_field("doc_type", STRING | STORED);
    schema.add_text_field("thread_id", STRING | STORED);
    schema.add_text_field("conversation_id", STRING | STORED);
    schema.add_text_field("title", TEXT | STORED);
    schema.add_text_field("preview", TEXT | STORED);
    schema.add_text_field("body", TEXT | STORED);
    schema.add_i64_field("timestamp_ms", FAST);
    schema.add_i64_field("updated_at_ms", FAST);
    schema.build()
}

#[derive(Debug, Default, Clone, Serialize, Deserialize)]
struct WorkspaceIndexState {
    #[serde(default)]
    conversations: HashMap<String, ConversationIndexState>,
}

#[derive(Debug, Default, Clone, Serialize, Deserialize)]
struct ConversationIndexState {
    rollout_path: String,
    offset: u64,
    file_size: u64,
    modified_ms: u64,
    #[serde(default)]
    extract_version: u32,
}

impl WorkspaceIndexState {
    fn load(path: &Path) -> Option<Self> {
        let raw = fs::read_to_string(path).ok()?;
        serde_json::from_str(&raw).ok()
    }

    fn save_atomic(&self, path: &Path) -> AppResult<()> {
        let tmp = path.with_extension("tmp");
        let raw = serde_json::to_string(self)
            .map_err(|e| AppError::Internal(anyhow::anyhow!("State serialize failed: {e}")))?;
        fs::write(&tmp, raw)?;
        fs::rename(&tmp, path)?;
        Ok(())
    }
}

fn index_rollout_incremental(
    writer: &mut IndexWriter,
    fields: &SearchFields,
    thread_id: &str,
    conversation_id: &str,
    rollout_path: &str,
    mut state: ConversationIndexState,
) -> AppResult<ConversationIndexState> {
    let path = Path::new(rollout_path);
    let meta = match fs::metadata(path) {
        Ok(m) => m,
        Err(_) => return Ok(state),
    };

    let file_size = meta.len();
    let modified_ms = meta
        .modified()
        .ok()
        .and_then(|t| t.duration_since(std::time::UNIX_EPOCH).ok())
        .map(|d| d.as_millis() as u64)
        .unwrap_or(0);

    let should_reset = state.rollout_path != rollout_path
        || state.extract_version != EXTRACT_VERSION
        || file_size < state.offset
        || (state.modified_ms != 0 && modified_ms < state.modified_ms);

    if should_reset {
        writer.delete_term(Term::from_field_text(
            fields.conversation_id,
            conversation_id,
        ));
        state.offset = 0;
    }

    state.rollout_path = rollout_path.to_string();
    state.file_size = file_size;
    state.modified_ms = modified_ms;
    state.extract_version = EXTRACT_VERSION;

    if file_size == state.offset {
        return Ok(state);
    }

    let mut file = fs::File::open(path)?;
    file.seek(SeekFrom::Start(state.offset))?;
    let mut reader = BufReader::new(file);

    let mut line = String::new();
    loop {
        line.clear();
        let offset_before = state.offset;
        let bytes_read = reader.read_line(&mut line)?;
        if bytes_read == 0 {
            break;
        }

        state.offset = state.offset.saturating_add(bytes_read as u64);
        let had_newline = line.ends_with('\n');

        let trimmed = line.trim();
        if trimmed.is_empty() {
            continue;
        }

        let parsed: codex_protocol::protocol::RolloutLine = match serde_json::from_str(trimmed) {
            Ok(v) => v,
            Err(_) => {
                // If the last line is partially written (EOF without a newline), don't advance the
                // offset or we'll permanently skip it once it becomes complete.
                if !had_newline {
                    state.offset = offset_before;
                    break;
                }
                continue;
            }
        };

        let body = match extract_text_from_rollout_item(&parsed.item) {
            Some(v) => v,
            None => continue,
        };

        let timestamp_ms = parse_rfc3339_ms(&parsed.timestamp).unwrap_or(0);
        let doc_id = format!("msg:{conversation_id}:{offset_before}");

        writer.delete_term(Term::from_field_text(fields.doc_id, &doc_id));

        let mut doc = TantivyDocument::default();
        doc.add_text(fields.doc_id, &doc_id);
        doc.add_text(fields.doc_type, DOC_TYPE_MESSAGE);
        doc.add_text(fields.thread_id, thread_id);
        doc.add_text(fields.conversation_id, conversation_id);
        doc.add_text(fields.body, &body);
        doc.add_i64(fields.timestamp_ms, timestamp_ms);
        writer.add_document(doc).map_err(map_tantivy_error)?;
    }

    Ok(state)
}

fn extract_text_from_rollout_item(item: &codex_protocol::protocol::RolloutItem) -> Option<String> {
    use codex_protocol::models::ContentItem;
    use codex_protocol::models::ResponseItem;
    use codex_protocol::protocol::EventMsg;
    use codex_protocol::protocol::RolloutItem;

    match item {
        RolloutItem::EventMsg(ev) => match ev {
            // Only index user + assistant message text.
            EventMsg::UserMessage(msg) => Some(msg.message.clone()),
            EventMsg::AgentMessage(msg) => Some(msg.message.clone()),
            _ => None,
        },
        RolloutItem::ResponseItem(item) => match item {
            ResponseItem::Message { role, content, .. } => {
                // Only index user + assistant message text.
                if role != "user" && role != "assistant" {
                    return None;
                }
                let text = content
                    .iter()
                    .filter_map(|c| match c {
                        ContentItem::InputText { text } => Some(text.as_str()),
                        ContentItem::OutputText { text } => Some(text.as_str()),
                        _ => None,
                    })
                    .collect::<Vec<_>>()
                    .join("\n");
                if text.trim().is_empty() {
                    None
                } else {
                    Some(text)
                }
            }
            _ => None,
        },
        _ => None,
    }
}

fn parse_rfc3339_ms(value: &str) -> Option<i64> {
    let parsed = OffsetDateTime::parse(value, &Rfc3339).ok()?;
    let ms: i128 = parsed.unix_timestamp_nanos() / 1_000_000;
    i64::try_from(ms).ok()
}

fn map_tantivy_error(err: tantivy::TantivyError) -> AppError {
    AppError::Internal(anyhow::anyhow!("Tantivy error: {err}"))
}

fn is_lock_failure(err: &tantivy::TantivyError) -> bool {
    matches!(err, tantivy::TantivyError::LockFailure(_, _))
}

struct OpenFailure {
    err: AppError,
    can_rebuild: bool,
}

#[cfg(test)]
mod tests {
    use super::*;
    use codex_protocol::protocol::AgentMessageEvent;
    use codex_protocol::protocol::EventMsg;
    use codex_protocol::protocol::RolloutItem;
    use codex_protocol::protocol::RolloutLine;

    #[test]
    fn does_not_skip_partial_last_line() {
        let temp_dir = tempfile::tempdir().expect("temp dir");
        let index_dir = temp_dir.path().join("idx");
        let rollout_path = temp_dir.path().join("rollout.jsonl");

        let schema = build_schema();
        std::fs::create_dir_all(&index_dir).expect("create index dir");
        let index = Index::create_in_dir(&index_dir, schema).expect("create index");
        let fields = SearchFields::from_schema(index.schema()).expect("fields");
        let mut writer = index.writer(15_000_000).expect("writer");

        let line = RolloutLine {
            timestamp: "2025-01-01T00:00:00Z".to_string(),
            item: RolloutItem::EventMsg(EventMsg::AgentMessage(AgentMessageEvent {
                message: "hello world".to_string(),
            })),
        };
        let json = serde_json::to_string(&line).expect("json");
        let split = json.len() / 2;

        std::fs::write(&rollout_path, &json[..split]).expect("write partial");

        let state = ConversationIndexState {
            rollout_path: rollout_path.to_string_lossy().to_string(),
            offset: 0,
            file_size: 0,
            modified_ms: 0,
            extract_version: EXTRACT_VERSION,
        };

        let state = index_rollout_incremental(
            &mut writer,
            &fields,
            "thread-1",
            "conv-1",
            &rollout_path.to_string_lossy(),
            state,
        )
        .expect("indexing succeeds");

        assert_eq!(
            state.offset, 0,
            "partial final line should not advance offset"
        );

        {
            use std::io::Write;
            let mut f = std::fs::OpenOptions::new()
                .append(true)
                .open(&rollout_path)
                .expect("open append");
            f.write_all(json[split..].as_bytes()).expect("append rest");
            f.write_all(b"\n").expect("append newline");
        }

        let state = index_rollout_incremental(
            &mut writer,
            &fields,
            "thread-1",
            "conv-1",
            &rollout_path.to_string_lossy(),
            state,
        )
        .expect("indexing succeeds");

        assert!(state.offset > 0, "offset should advance after full line");
        writer.commit().expect("commit");

        let reader = index
            .reader_builder()
            .reload_policy(ReloadPolicy::Manual)
            .try_into()
            .expect("reader");
        reader.reload().expect("reload");

        let searcher = reader.searcher();
        let parser = QueryParser::for_index(&index, vec![fields.body]);
        let query = parser.parse_query("hello").expect("parse");
        let top_docs = searcher
            .search(&query, &TopDocs::with_limit(10))
            .expect("search");
        assert!(!top_docs.is_empty(), "should index the completed line");
    }
}
