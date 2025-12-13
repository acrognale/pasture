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
const EXTRACT_VERSION: u32 = 2;

#[derive(Clone, Debug)]
pub struct ThreadSearchHit {
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
    cache: RwLock<HashMap<WorkspacePath, Arc<WorkspaceThreadSearch>>>,
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
    ) -> AppResult<(Vec<ThreadSearchHit>, SearchStats)> {
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
        if let Some(existing) = self.cache.read().await.get(&workspace_path) {
            return Ok(existing.clone());
        }

        tokio::fs::create_dir_all(&self.base_dir).await?;
        let workspace_id = Uuid::new_v5(&Uuid::NAMESPACE_OID, workspace_path.as_str().as_bytes());
        let workspace_dir = self.base_dir.join(workspace_id.to_string());
        let index = tokio::task::spawn_blocking(move || WorkspaceThreadSearch::open(workspace_dir))
            .await??;
        let index = Arc::new(index);

        let mut cache = self.cache.write().await;
        cache.insert(workspace_path, index.clone());
        Ok(index)
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

        let index = match Index::open_in_dir(&dir) {
            Ok(idx) => idx,
            Err(_) => match Index::create_in_dir(&dir, schema.clone()) {
                Ok(idx) => idx,
                Err(_) => {
                    let _ = fs::remove_dir_all(&dir);
                    fs::create_dir_all(&dir)?;
                    Index::create_in_dir(&dir, schema.clone()).map_err(|e| {
                        AppError::Internal(anyhow::anyhow!("Failed to create index: {e}"))
                    })?
                }
            },
        };

        let reader = index
            .reader_builder()
            .reload_policy(ReloadPolicy::OnCommitWithDelay)
            .try_into()
            .map_err(|e| AppError::Internal(anyhow::anyhow!("Failed to create reader: {e}")))?;

        let writer = index
            .writer(50_000_000)
            .map_err(|e| AppError::Internal(anyhow::anyhow!("Failed to create writer: {e}")))?;

        let fields = SearchFields::from_schema(index.schema())?;
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
            last_error: self.last_error.lock().ok().and_then(|g| g.clone()),
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

    fn search(&self, query: &str, limit: usize) -> AppResult<Vec<ThreadSearchHit>> {
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
        let mut candidates: Vec<(String, f32, bool, TantivyDocument)> = Vec::new();

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

            if seen_threads.contains(&thread_id) {
                continue;
            }

            let doc_type = doc
                .get_first(self.fields.doc_type)
                .and_then(|v| v.as_str())
                .unwrap_or(DOC_TYPE_MESSAGE);
            let is_thread_doc = doc_type == DOC_TYPE_THREAD;
            seen_threads.insert(thread_id.clone());
            candidates.push((thread_id, score, is_thread_doc, doc));

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

        let mut hits: Vec<ThreadSearchHit> = Vec::with_capacity(candidates.len());
        for (thread_id, score, is_thread_doc, doc) in candidates {
            let snippet = if is_thread_doc {
                snippet_title
                    .as_mut()
                    .map(|snippet_gen| snippet_gen.snippet_from_doc(&doc).to_html())
            } else {
                snippet_body
                    .as_mut()
                    .map(|snippet_gen| snippet_gen.snippet_from_doc(&doc).to_html())
            };

            hits.push(ThreadSearchHit {
                thread_id,
                score,
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

            let mut conversations: Vec<(String, String, String)> = Vec::new();
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

        // Upsert thread meta docs.
        for thread in &threads {
            let doc_id = format!("thread:{}", thread.id);
            writer.delete_term(Term::from_field_text(self.fields.doc_id, &doc_id));

            let updated_at_ms = parse_rfc3339_ms(&thread.updated_at).unwrap_or(0);
            let preview = thread
                .preview
                .clone()
                .or_else(|| thread.title.clone())
                .unwrap_or_else(|| "Untitled thread".to_string());

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
        let mut state = self
            .state
            .lock()
            .map_err(|_| AppError::Internal(anyhow::anyhow!("Index state lock poisoned")))?;

        let mut active_conversations: HashMap<String, ConversationIndexState> = HashMap::new();

        for (thread_id, conversation_id, rollout_path) in conversations {
            let conv_state = state
                .conversations
                .get(&conversation_id)
                .cloned()
                .unwrap_or_else(|| ConversationIndexState {
                    rollout_path: rollout_path.clone(),
                    offset: 0,
                    file_size: 0,
                    modified_ms: 0,
                    extract_version: EXTRACT_VERSION,
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

        state.conversations = active_conversations;
        state.save_atomic(&self.state_path())?;

        writer
            .commit()
            .map_err(|e| AppError::Internal(anyhow::anyhow!("Index commit failed: {e}")))?;

        self.reader
            .reload()
            .map_err(|e| AppError::Internal(anyhow::anyhow!("Index reload failed: {e}")))?;

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
        let bytes_read = reader.read_line(&mut line)?;
        if bytes_read == 0 {
            break;
        }

        let offset_before = state.offset;
        state.offset = state.offset.saturating_add(bytes_read as u64);

        let trimmed = line.trim();
        if trimmed.is_empty() {
            continue;
        }

        let parsed: codex_protocol::protocol::RolloutLine = match serde_json::from_str(trimmed) {
            Ok(v) => v,
            Err(_) => continue,
        };

        let (_kind, body) = match extract_text_from_rollout_item(&parsed.item) {
            Some(v) => v,
            None => continue,
        };

        let timestamp_ms = parse_rfc3339_ms(&parsed.timestamp).unwrap_or(0);
        let doc_id = format!("msg:{conversation_id}:{offset_before}");

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

fn extract_text_from_rollout_item(
    item: &codex_protocol::protocol::RolloutItem,
) -> Option<(String, String)> {
    use codex_protocol::models::ContentItem;
    use codex_protocol::models::ResponseItem;
    use codex_protocol::protocol::EventMsg;
    use codex_protocol::protocol::RolloutItem;

    match item {
        RolloutItem::EventMsg(ev) => match ev {
            // Only index user + assistant message text.
            EventMsg::UserMessage(msg) => Some(("user".to_string(), msg.message.clone())),
            EventMsg::AgentMessage(msg) => Some(("assistant".to_string(), msg.message.clone())),
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
                    Some((role.clone(), text))
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
