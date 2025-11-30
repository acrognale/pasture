//! Thread business logic - standalone functions for thread operations.

use std::collections::HashMap;
use std::collections::HashSet;
use std::path::Path;
use std::path::PathBuf;

use chrono::Utc;
use codex_core::NewConversation;
use codex_protocol::ConversationId;
use codex_protocol::config_types::ReasoningEffort;
use codex_protocol::config_types::ReasoningSummary;
use codex_protocol::protocol::SessionConfiguredEvent;
use sea_orm::ActiveModelTrait;
use sea_orm::ActiveValue::Set;
use sea_orm::ColumnTrait;
use sea_orm::DatabaseConnection;
use sea_orm::EntityTrait;
use sea_orm::QueryFilter;
use sea_orm::QueryOrder;
use sea_orm::TransactionTrait;
use serde_json;
use tauri::AppHandle;
use tauri::Emitter;
use uuid::Uuid;

use crate::codex_config::NewThreadOptions;
use crate::codex_config::derive_config;
use crate::completions;
use crate::context::WorkspaceContext;
use crate::db::db_err;
use crate::db::schema;
use crate::domain::Conversation;
use crate::domain::Thread;
use crate::domain::ThreadId;
use crate::domain::WorkspacePath;
use crate::domain::WorkspaceSettings;
use crate::errors::AppError;
use crate::errors::AppResult;
use crate::review;
use crate::rollout::load_rollout_cwd;
use crate::router::CodexEvent;
use crate::router::ThreadMetadataPayload;
use crate::title_generation;
use crate::workspace;

// ============================================================
// Result Types
// ============================================================

pub struct ThreadInitialization {
    pub conversation: NewConversation,
    pub reasoning_summary: ReasoningSummary,
}

pub struct SwitchConversationResult {
    pub session_configured: Option<SessionConfiguredEvent>,
    pub reasoning_summary: Option<ReasoningSummary>,
}

pub struct ForkConversationResult {
    pub thread: Thread,
    pub conversation: NewConversation,
    pub reasoning_summary: ReasoningSummary,
}

// ============================================================
// Queries
// ============================================================

fn thread_options_from_thread(thread: &Thread, cwd: Option<String>) -> NewThreadOptions {
    NewThreadOptions {
        model: thread.model.clone(),
        profile: None,
        cwd,
        approval_policy: thread.approval,
        sandbox: thread.sandbox,
        config: None,
        base_instructions: None,
        include_apply_patch_tool: None,
        web_search_enabled: thread.web_search_enabled,
    }
}

/// Get the workspace path for a conversation.
pub async fn workspace_path_for_conversation(
    db: &DatabaseConnection,
    conversation_id: &ConversationId,
) -> AppResult<Option<WorkspacePath>> {
    let conversation = schema::conversations::Entity::find_by_id(conversation_id.to_string())
        .one(db)
        .await
        .map_err(|e| db_err("find conversation", e))?;

    let Some(conversation) = conversation else {
        return Ok(None);
    };

    let thread = schema::threads::Entity::find_by_id(conversation.thread_id)
        .one(db)
        .await
        .map_err(|e| db_err("find thread for conversation", e))?;

    Ok(thread.map(|t| WorkspacePath(t.workspace_path)))
}

/// Resolve the thread that contains the given conversation, if any.
pub async fn thread_for_conversation(
    db: &DatabaseConnection,
    conversation_id: &ConversationId,
) -> AppResult<Option<ThreadId>> {
    let threads = threads_for_conversation(db, conversation_id).await?;
    Ok(threads.first().map(|thread| ThreadId(thread.id.clone())))
}

/// Compute effective composer settings for a thread, applying workspace defaults and thread overrides.
pub async fn get_thread_composer_config(
    db: &DatabaseConnection,
    workspace: &WorkspacePath,
    base_config: &codex_core::config::Config,
    thread_id: &ThreadId,
) -> AppResult<WorkspaceSettings> {
    let mut settings = workspace::get_composer_defaults(db, workspace, base_config).await?;

    if let Some(thread) = schema::threads::Entity::find_by_id(thread_id.as_str().to_string())
        .filter(schema::threads::Column::WorkspacePath.eq(workspace.as_str()))
        .one(db)
        .await
        .map_err(|e| db_err("load thread for composer config", e))?
    {
        if let Some(model) = thread.model {
            settings.model = Some(model);
        }
        if let Some(value) = parse_json_option(thread.reasoning_effort) {
            settings.reasoning_effort = Some(value);
        }
        if let Some(value) = parse_json_option(thread.reasoning_summary) {
            settings.reasoning_summary = Some(value);
        }
        if let Some(value) = parse_json_option(thread.sandbox) {
            settings.sandbox = Some(value);
        }
        if let Some(value) = parse_json_option(thread.approval) {
            settings.approval = Some(value);
        }
        if let Some(value) = parse_json_option(thread.web_search_enabled) {
            settings.web_search_enabled = Some(value);
        }
    }

    Ok(settings)
}

/// Persist per-thread composer settings overrides.
pub async fn update_thread_composer_settings(
    db: &DatabaseConnection,
    workspace: &WorkspacePath,
    thread_id: &ThreadId,
    updates: crate::workspace::ComposerSettingsUpdate,
) -> AppResult<()> {
    if updates.model.is_none()
        && updates.reasoning_effort.is_none()
        && updates.reasoning_summary.is_none()
        && updates.sandbox.is_none()
        && updates.approval.is_none()
        && updates.web_search_enabled.is_none()
    {
        return Ok(());
    }

    let thread = schema::threads::Entity::find_by_id(thread_id.as_str().to_string())
        .filter(schema::threads::Column::WorkspacePath.eq(workspace.as_str()))
        .one(db)
        .await
        .map_err(|e| db_err("load thread for composer update", e))?
        .ok_or(AppError::NotFound { entity: "thread" })?;

    let mut active: schema::threads::ActiveModel = thread.into();
    let mut changed = false;

    if let Some(model) = updates.model {
        active.model = Set(Some(model));
        changed = true;
    }
    if let Some(value) = updates.reasoning_effort {
        active.reasoning_effort = Set(serialize_json_option(&Some(value)));
        changed = true;
    }
    if let Some(value) = updates.reasoning_summary {
        active.reasoning_summary = Set(serialize_json_option(&Some(value)));
        changed = true;
    }
    if let Some(value) = updates.sandbox {
        active.sandbox = Set(serialize_json_option(&Some(value)));
        changed = true;
    }
    if let Some(value) = updates.approval {
        active.approval = Set(serialize_json_option(&Some(value)));
        changed = true;
    }
    if let Some(value) = updates.web_search_enabled {
        active.web_search_enabled = Set(serialize_json_option(&Some(value)));
        changed = true;
    }

    if changed {
        active.updated_at = Set(Utc::now().to_rfc3339());
        active
            .update(db)
            .await
            .map_err(|e| db_err("update thread composer settings", e))?;
        workspace::touch(db, workspace).await?;
    }

    Ok(())
}

/// List all threads for the workspace.
pub async fn list(ctx: &WorkspaceContext) -> AppResult<Vec<Thread>> {
    let threads = schema::threads::Entity::find()
        .filter(schema::threads::Column::WorkspacePath.eq(ctx.path.as_str()))
        .order_by_desc(schema::threads::Column::UpdatedAt)
        .all(ctx.db())
        .await
        .map_err(|e| db_err("list threads", e))?;

    let mut result = Vec::with_capacity(threads.len());
    for thread in threads {
        let conversations = load_conversations(ctx.db(), thread.id.clone()).await?;
        result.push(decode_thread(thread, conversations)?);
    }

    Ok(result)
}

/// Get a single thread by ID.
pub async fn get(ctx: &WorkspaceContext, thread_id: &ThreadId) -> AppResult<Thread> {
    let thread = schema::threads::Entity::find_by_id(thread_id.as_str().to_string())
        .filter(schema::threads::Column::WorkspacePath.eq(ctx.path.as_str()))
        .one(ctx.db())
        .await
        .map_err(|e| db_err("get thread", e))?
        .ok_or(AppError::NotFound { entity: "thread" })?;

    let conversations = load_conversations(ctx.db(), thread_id.as_str().to_string()).await?;
    decode_thread(thread, conversations)
}

// ============================================================
// Mutations
// ============================================================

/// Create a new thread with its initial conversation.
pub async fn create(
    ctx: &WorkspaceContext,
    options: NewThreadOptions,
    app_handle: AppHandle,
) -> AppResult<(Thread, NewConversation)> {
    let mut base_config = ctx.config().clone();
    base_config.cwd = PathBuf::from(ctx.path.as_str());

    let settings = ctx.settings().await?;
    let config = derive_config(&base_config, settings, &options).await?;

    let new_conv = ctx
        .conversations()
        .new_conversation(config)
        .await
        .map_err(|e| AppError::Codex(format!("Failed to create conversation: {}", e)))?;

    let timestamp = Utc::now().to_rfc3339();
    let thread_id = ThreadId(Uuid::new_v4().to_string());
    let conversation_id = new_conv.conversation_id;

    let conversation = Conversation {
        id: conversation_id,
        thread_id: thread_id.clone(),
        rollout_path: new_conv
            .session_configured
            .rollout_path
            .to_string_lossy()
            .to_string(),
        created_at: timestamp.clone(),
        label: None,
        parent_conversation_id: None,
        forked_at_nth_user_message: None,
    };

    let thread = Thread {
        id: thread_id,
        current_conversation_id: conversation_id,
        conversations: vec![conversation],
        title: None,
        preview: Some("Untitled session".to_string()),
        model: settings.model.clone(),
        reasoning_effort: settings.reasoning_effort,
        reasoning_summary: settings.reasoning_summary,
        sandbox: settings.sandbox,
        approval: settings.approval.clone(),
        web_search_enabled: settings.web_search_enabled,
        created_at: timestamp.clone(),
        updated_at: timestamp,
        workspace_path: ctx.path.clone(),
    };

    save(ctx.db(), &ctx.path, &thread).await?;
    crate::workspace::touch(ctx.db(), &ctx.path).await?;

    ensure_base_snapshot(ctx, &conversation_id).await;
    ensure_subscription(ctx, &conversation_id, app_handle).await;

    Ok((thread, new_conv))
}

/// Initialize a thread by resuming its current conversation.
pub async fn initialize(
    ctx: &WorkspaceContext,
    thread_id: &ThreadId,
    app_handle: AppHandle,
) -> AppResult<ThreadInitialization> {
    let thread = get(ctx, thread_id).await?;
    let rollout_path = current_conversation_rollout_path(&thread)?;
    let cwd = resolve_rollout_cwd(&rollout_path, &ctx.path).await?;

    let settings = ctx.settings().await?;
    let cwd_str = cwd.to_string_lossy().to_string();
    let thread_options = thread_options_from_thread(&thread, Some(cwd_str));
    let config = derive_config(ctx.config(), settings, &thread_options).await?;
    let reasoning_summary = config.model_reasoning_summary;

    let new_conv = ctx
        .conversations()
        .resume_conversation_from_rollout(config, rollout_path, ctx.auth())
        .await
        .map_err(|e| AppError::Codex(format!("Failed to resume conversation: {}", e)))?;

    let conversation_id = new_conv.conversation_id;
    ensure_base_snapshot(ctx, &conversation_id).await;
    ensure_subscription(ctx, &conversation_id, app_handle).await;

    Ok(ThreadInitialization {
        conversation: new_conv,
        reasoning_summary,
    })
}

/// Fork a conversation within a thread.
pub async fn fork(
    ctx: &WorkspaceContext,
    thread_id: &ThreadId,
    base_conversation_id: &ConversationId,
    nth_user_message: u32,
    options: NewThreadOptions,
    app_handle: AppHandle,
) -> AppResult<ForkConversationResult> {
    let mut thread = get(ctx, thread_id).await?;
    let base_conversation =
        find_conversation(&thread, base_conversation_id).ok_or(AppError::NotFound {
            entity: "conversation",
        })?;

    let rollout_path = PathBuf::from(&base_conversation.rollout_path);
    let cwd = resolve_rollout_cwd(&rollout_path, &ctx.path).await?;

    let mut base_config = ctx.config().clone();
    base_config.cwd = cwd;

    let settings = ctx.settings().await?;
    let config = derive_config(&base_config, settings, &options).await?;
    let reasoning_summary = config.model_reasoning_summary;

    let new_conv = ctx
        .conversations()
        .fork_conversation(nth_user_message as usize, config, rollout_path)
        .await
        .map_err(|e| AppError::Codex(format!("Failed to fork conversation: {}", e)))?;

    let timestamp = Utc::now().to_rfc3339();
    let new_conversation = Conversation {
        id: new_conv.conversation_id,
        thread_id: thread.id.clone(),
        rollout_path: new_conv
            .session_configured
            .rollout_path
            .to_string_lossy()
            .to_string(),
        created_at: timestamp.clone(),
        label: None,
        parent_conversation_id: Some(*base_conversation_id),
        forked_at_nth_user_message: Some(nth_user_message),
    };

    thread.conversations.push(new_conversation.clone());
    thread.current_conversation_id = new_conv.conversation_id;
    thread.updated_at = timestamp;

    save(ctx.db(), &ctx.path, &thread).await?;

    ensure_base_snapshot(ctx, &new_conversation.id).await;
    ensure_subscription(ctx, &new_conversation.id, app_handle).await;

    Ok(ForkConversationResult {
        thread,
        conversation: new_conv,
        reasoning_summary,
    })
}

/// Switch a thread to a specific conversation.
pub async fn switch_conversation(
    ctx: &WorkspaceContext,
    thread_id: &ThreadId,
    conversation_id: &ConversationId,
    app_handle: AppHandle,
) -> AppResult<SwitchConversationResult> {
    let mut thread = get(ctx, thread_id).await?;
    let conversation = find_conversation(&thread, conversation_id).ok_or(AppError::NotFound {
        entity: "conversation",
    })?;
    let rollout_path = PathBuf::from(&conversation.rollout_path);

    let cwd = resolve_rollout_cwd(&rollout_path, &ctx.path).await?;
    let existing_conversation = ctx.conversations().get_conversation(*conversation_id).await;
    let settings = ctx.settings().await?;
    let cwd_str = cwd.to_string_lossy().to_string();
    let thread_options = thread_options_from_thread(&thread, Some(cwd_str));
    let config = derive_config(ctx.config(), settings, &thread_options).await?;

    let (session_configured, reasoning_summary) = match existing_conversation {
        Ok(_) => {
            ensure_subscription(ctx, conversation_id, app_handle).await;
            (None, None)
        }
        Err(_) => {
            let reasoning_summary = config.model_reasoning_summary;

            let new_conv = ctx
                .conversations()
                .resume_conversation_from_rollout(config, rollout_path, ctx.auth())
                .await
                .map_err(|e| AppError::Codex(format!("Failed to resume conversation: {}", e)))?;

            ensure_subscription(ctx, conversation_id, app_handle).await;

            (
                Some(new_conv.session_configured.clone()),
                Some(reasoning_summary),
            )
        }
    };

    ensure_base_snapshot(ctx, conversation_id).await;

    thread.current_conversation_id = *conversation_id;
    thread.updated_at = Utc::now().to_rfc3339();

    save(ctx.db(), &ctx.path, &thread).await?;

    Ok(SwitchConversationResult {
        session_configured,
        reasoning_summary,
    })
}

/// Update preview metadata and kick off background title generation.
pub async fn handle_preview_and_title(
    ctx: &WorkspaceContext,
    conversation_id: &ConversationId,
    preview: String,
    app_handle: AppHandle,
) {
    let trimmed_preview = preview.trim();
    if trimmed_preview.is_empty() {
        return;
    }

    if let Err(err) =
        update_preview_for_conversation(ctx.db(), conversation_id, trimmed_preview, &app_handle)
            .await
    {
        log::debug!(
            "Failed to update thread preview for conversation {}: {}",
            conversation_id,
            err
        );
    }

    // Clone values needed for the spawned task
    let db = ctx.db().clone();
    let config = ctx.config().clone();
    let auth = ctx.auth();
    let conversation_id = *conversation_id;
    let user_message = trimmed_preview.to_string();

    tauri::async_runtime::spawn(async move {
        if let Err(err) = maybe_generate_thread_title(
            &db,
            &config,
            auth,
            conversation_id,
            user_message,
            app_handle,
        )
        .await
        {
            log::debug!("Session title generation skipped: {err}");
        }
    });
}

// ============================================================
// Database Operations
// ============================================================

/// Save a thread and its conversations to the database.
pub async fn save(
    db: &DatabaseConnection,
    workspace: &WorkspacePath,
    thread: &Thread,
) -> AppResult<()> {
    let txn = db
        .begin()
        .await
        .map_err(|e| db_err("begin thread transaction", e))?;

    let existing = schema::threads::Entity::find_by_id(thread.id.as_str().to_string())
        .filter(schema::threads::Column::WorkspacePath.eq(workspace.as_str()))
        .one(&txn)
        .await
        .map_err(|e| db_err("fetch existing thread for upsert", e))?;

    let thread_active = encode_thread(thread, workspace, existing.as_ref());

    if existing.is_some() {
        thread_active
            .update(&txn)
            .await
            .map_err(|e| db_err("update thread", e))?;
    } else {
        thread_active
            .insert(&txn)
            .await
            .map_err(|e| db_err("insert thread", e))?;
    }

    let mut existing_conversations: HashMap<String, schema::conversations::Model> =
        schema::conversations::Entity::find()
            .filter(schema::conversations::Column::ThreadId.eq(thread.id.as_str()))
            .all(&txn)
            .await
            .map_err(|e| db_err("load existing conversations", e))?
            .into_iter()
            .map(|conv| (conv.id.clone(), conv))
            .collect();

    for conversation in &thread.conversations {
        let prior = existing_conversations.remove(&conversation.id.to_string());
        let active = encode_conversation(conversation, &thread.id, prior.as_ref());

        if prior.is_some() {
            active
                .update(&txn)
                .await
                .map_err(|e| db_err("update conversation", e))?;
        } else {
            active
                .insert(&txn)
                .await
                .map_err(|e| db_err("insert conversation", e))?;
        }
    }

    if !existing_conversations.is_empty() {
        let obsolete_ids: Vec<String> = existing_conversations.into_keys().collect();

        schema::turn_snapshots::Entity::delete_many()
            .filter(schema::turn_snapshots::Column::ConversationId.is_in(obsolete_ids.clone()))
            .exec(&txn)
            .await
            .map_err(|e| db_err("delete turn snapshots for removed conversations", e))?;

        schema::conversations::Entity::delete_many()
            .filter(schema::conversations::Column::Id.is_in(obsolete_ids))
            .exec(&txn)
            .await
            .map_err(|e| db_err("delete removed conversations", e))?;
    }

    txn.commit()
        .await
        .map_err(|e| db_err("commit thread transaction", e))?;

    Ok(())
}

async fn update_preview_for_conversation(
    db: &DatabaseConnection,
    conversation_id: &ConversationId,
    preview: &str,
    app_handle: &AppHandle,
) -> AppResult<()> {
    let threads = threads_for_conversation(db, conversation_id).await?;
    let timestamp = Utc::now().to_rfc3339();

    for thread in threads {
        let existing = thread.preview.as_deref().unwrap_or("");
        if !existing.is_empty() && existing != "Untitled session" {
            continue;
        }

        let mut active: schema::threads::ActiveModel = thread.clone().into();
        active.preview = Set(Some(preview.to_string()));
        active.updated_at = Set(timestamp.clone());
        active
            .update(db)
            .await
            .map_err(|e| db_err("update thread preview", e))?;

        emit_thread_metadata_event(
            &thread,
            conversation_id,
            app_handle,
            None,
            Some(preview.to_string()),
        );
    }

    Ok(())
}

async fn maybe_generate_thread_title(
    db: &DatabaseConnection,
    config: &codex_core::config::Config,
    auth: std::sync::Arc<codex_core::AuthManager>,
    conversation_id: ConversationId,
    user_message: String,
    app_handle: AppHandle,
) -> anyhow::Result<()> {
    let trimmed_message = user_message.trim();
    if trimmed_message.is_empty() {
        log::debug!(
            "Skipping title generation for conversation {}: empty first user text",
            conversation_id
        );
        return Ok(());
    }

    let needs_title = has_missing_title_for_conversation(db, &conversation_id)
        .await
        .unwrap_or_else(|err| {
            log::debug!(
                "Failed to check existing titles for conversation {}: {err}",
                conversation_id
            );
            false
        });

    if !needs_title {
        log::debug!(
            "Skipping title generation for conversation {}: title already present",
            conversation_id
        );
        return Ok(());
    }

    let prompt = title_generation::build_prompt(trimmed_message);
    let model = completions::ModelConfig {
        model: "gpt-5.1-codex-mini".to_string(),
        reasoning_effort: Some(ReasoningEffort::Low),
    };

    log::info!(
        "Generating session title for conversation {} using model {}",
        conversation_id,
        model.model
    );

    match completions::generate_text(
        std::sync::Arc::new(config.clone()),
        auth,
        conversation_id,
        &prompt,
        Some(model),
    )
    .await
    {
        Ok(Some(text)) => {
            log::info!(
                "Title generation model response for conversation {}: {}",
                conversation_id,
                text
            );
            if let Some(title) = title_generation::parse_title_from_text(&text) {
                match update_title_for_conversation(db, &conversation_id, &title).await {
                    Ok(updated) => {
                        if updated {
                            emit_thread_metadata_events_for_conversation(
                                db,
                                &conversation_id,
                                &app_handle,
                                Some(title),
                                None,
                            )
                            .await;
                            log::info!(
                                "Emitted generated session title for conversation {}",
                                conversation_id
                            );
                        } else {
                            log::info!(
                                "Generated title for conversation {} but no rows were updated (possibly already set)",
                                conversation_id
                            );
                        }
                    }
                    Err(err) => {
                        log::info!(
                            "Failed to store generated title for conversation {}: {err}",
                            conversation_id
                        );
                    }
                }
            } else {
                log::info!(
                    "Model did not return a usable title for conversation {}",
                    conversation_id
                );
            }
        }
        Ok(None) => {
            log::info!(
                "Model did not return a usable title for conversation {}",
                conversation_id
            );
        }
        Err(err) => {
            log::info!(
                "Failed to generate title for conversation {}: {err:?}",
                conversation_id
            );
        }
    }

    Ok(())
}

async fn has_missing_title_for_conversation(
    db: &DatabaseConnection,
    conversation_id: &ConversationId,
) -> AppResult<bool> {
    let threads = threads_for_conversation(db, conversation_id).await?;
    Ok(threads.iter().any(|thread| is_missing_title(&thread.title)))
}

async fn update_title_for_conversation(
    db: &DatabaseConnection,
    conversation_id: &ConversationId,
    title: &str,
) -> AppResult<bool> {
    let normalized_title = title.trim();
    if normalized_title.is_empty() || normalized_title == "Untitled session" {
        return Ok(false);
    }

    let mut changed = false;
    let timestamp = Utc::now().to_rfc3339();
    let threads = threads_for_conversation(db, conversation_id).await?;

    for thread in threads {
        if !is_missing_title(&thread.title) {
            continue;
        }

        let mut active: schema::threads::ActiveModel = thread.into();
        active.title = Set(Some(normalized_title.to_string()));
        active.updated_at = Set(timestamp.clone());
        active
            .update(db)
            .await
            .map_err(|e| db_err("update thread title", e))?;
        changed = true;
    }

    Ok(changed)
}

async fn emit_thread_metadata_events_for_conversation(
    db: &DatabaseConnection,
    conversation_id: &ConversationId,
    app_handle: &AppHandle,
    title: Option<String>,
    preview: Option<String>,
) {
    let threads = match list_for_conversation(db, conversation_id).await {
        Ok(threads) => threads,
        Err(err) => {
            log::debug!(
                "Failed to load threads for metadata event (conversation {}): {}",
                conversation_id,
                err
            );
            return;
        }
    };

    for thread in threads {
        let payload = ThreadMetadataPayload {
            thread_id: thread.id.as_str().to_string(),
            conversation_id: thread.current_conversation_id.to_string(),
            workspace_path: thread.workspace_path.as_str().to_string(),
            title: title.clone().or(thread.title.clone()),
            preview: preview.clone().or(thread.preview.clone()),
            timestamp: thread.updated_at.clone(),
        };
        log::info!(
            "Emitting thread-metadata-updated for thread {} (conversation {})",
            payload.thread_id,
            payload.conversation_id
        );
        if let Err(err) =
            app_handle.emit("codex-event", CodexEvent::ThreadMetadataUpdated { payload })
        {
            log::debug!("Failed to emit thread metadata event: {}", err);
        }
    }
}

fn emit_thread_metadata_event(
    thread: &schema::threads::Model,
    conversation_id: &ConversationId,
    app_handle: &AppHandle,
    title: Option<String>,
    preview: Option<String>,
) {
    let payload = ThreadMetadataPayload {
        thread_id: thread.id.clone(),
        conversation_id: conversation_id.to_string(),
        workspace_path: thread.workspace_path.clone(),
        title: title.or_else(|| thread.title.clone()),
        preview: preview.or_else(|| thread.preview.clone()),
        timestamp: thread.updated_at.clone(),
    };
    if let Err(err) = app_handle.emit("codex-event", CodexEvent::ThreadMetadataUpdated { payload })
    {
        log::debug!("Failed to emit thread metadata event: {}", err);
    }
}

async fn list_for_conversation(
    db: &DatabaseConnection,
    conversation_id: &ConversationId,
) -> AppResult<Vec<Thread>> {
    let models = threads_for_conversation(db, conversation_id).await?;
    let mut threads = Vec::with_capacity(models.len());

    for model in models {
        let conversations = load_conversations(db, model.id.clone()).await?;
        threads.push(decode_thread(model, conversations)?);
    }

    Ok(threads)
}

async fn threads_for_conversation(
    db: &DatabaseConnection,
    conversation_id: &ConversationId,
) -> AppResult<Vec<schema::threads::Model>> {
    let mut threads = schema::threads::Entity::find()
        .filter(schema::threads::Column::CurrentConversationId.eq(conversation_id.to_string()))
        .all(db)
        .await
        .map_err(|e| db_err("find threads for conversation", e))?;

    let conversation_threads: Vec<String> = schema::conversations::Entity::find()
        .filter(schema::conversations::Column::Id.eq(conversation_id.to_string()))
        .all(db)
        .await
        .map_err(|e| db_err("find conversation links", e))?
        .into_iter()
        .map(|c| c.thread_id)
        .collect();

    let mut seen: HashSet<String> = threads.iter().map(|thread| thread.id.clone()).collect();
    for thread_id in conversation_threads {
        if seen.contains(&thread_id) {
            continue;
        }

        if let Some(thread) = schema::threads::Entity::find_by_id(thread_id)
            .one(db)
            .await
            .map_err(|e| db_err("load thread by conversation", e))?
        {
            seen.insert(thread.id.clone());
            threads.push(thread);
        }
    }

    Ok(threads)
}

async fn load_conversations(
    db: &DatabaseConnection,
    thread_id: String,
) -> AppResult<Vec<schema::conversations::Model>> {
    schema::conversations::Entity::find()
        .filter(schema::conversations::Column::ThreadId.eq(thread_id))
        .order_by_asc(schema::conversations::Column::CreatedAt)
        .all(db)
        .await
        .map_err(|e| db_err("load thread conversations", e))
}

// ============================================================
// Pure Functions (validation, derivation)
// ============================================================

fn find_conversation<'a>(
    thread: &'a Thread,
    conversation_id: &ConversationId,
) -> Option<&'a Conversation> {
    thread
        .conversations
        .iter()
        .find(|conv| &conv.id == conversation_id)
}

fn current_conversation_rollout_path(thread: &Thread) -> AppResult<PathBuf> {
    let conversation = thread
        .conversations
        .iter()
        .find(|c| c.id == thread.current_conversation_id)
        .ok_or(AppError::NotFound {
            entity: "conversation",
        })?;
    Ok(PathBuf::from(&conversation.rollout_path))
}

async fn resolve_rollout_cwd(rollout_path: &Path, workspace: &WorkspacePath) -> AppResult<PathBuf> {
    load_rollout_cwd(rollout_path, Some(Path::new(workspace.as_str()))).await
}

fn is_missing_title(title: &Option<String>) -> bool {
    match title.as_deref() {
        Some(existing) => existing.trim().is_empty() || existing == "Untitled session",
        None => true,
    }
}

// ============================================================
// Encoding/Decoding
// ============================================================

fn parse_json_option<T: serde::de::DeserializeOwned>(value: Option<String>) -> Option<T> {
    value.and_then(|raw| serde_json::from_str(&raw).ok())
}

fn serialize_json_option<T: serde::Serialize>(value: &Option<T>) -> Option<String> {
    value.as_ref().and_then(|v| serde_json::to_string(v).ok())
}

fn encode_thread(
    thread: &Thread,
    workspace: &WorkspacePath,
    existing: Option<&schema::threads::Model>,
) -> schema::threads::ActiveModel {
    let mut active = match existing {
        Some(model) => {
            let active: schema::threads::ActiveModel = model.clone().into();
            active
        }
        None => schema::threads::ActiveModel {
            id: Set(thread.id.as_str().to_string()),
            workspace_path: Set(workspace.as_str().to_string()),
            created_at: Set(thread.created_at.clone()),
            updated_at: Set(thread.updated_at.clone()),
            current_conversation_id: Set(thread.current_conversation_id.to_string()),
            title: Set(thread.title.clone()),
            preview: Set(thread.preview.clone()),
            model: Set(thread.model.clone()),
            reasoning_effort: Set(serialize_json_option(&thread.reasoning_effort)),
            reasoning_summary: Set(serialize_json_option(&thread.reasoning_summary)),
            sandbox: Set(serialize_json_option(&thread.sandbox)),
            approval: Set(serialize_json_option(&thread.approval)),
            web_search_enabled: Set(serialize_json_option(&thread.web_search_enabled)),
        },
    };

    active.workspace_path = Set(workspace.as_str().to_string());
    active.created_at = Set(thread.created_at.clone());
    active.updated_at = Set(thread.updated_at.clone());
    active.current_conversation_id = Set(thread.current_conversation_id.to_string());
    active.title = Set(thread.title.clone());
    active.preview = Set(thread.preview.clone());
    active.model = Set(thread.model.clone());
    active.reasoning_effort = Set(serialize_json_option(&thread.reasoning_effort));
    active.reasoning_summary = Set(serialize_json_option(&thread.reasoning_summary));
    active.sandbox = Set(serialize_json_option(&thread.sandbox));
    active.approval = Set(serialize_json_option(&thread.approval));
    active.web_search_enabled = Set(serialize_json_option(&thread.web_search_enabled));

    active
}

fn encode_conversation(
    conversation: &Conversation,
    thread_id: &ThreadId,
    existing: Option<&schema::conversations::Model>,
) -> schema::conversations::ActiveModel {
    let parent_conversation_id = conversation
        .parent_conversation_id
        .as_ref()
        .map(|id| id.to_string());
    let forked_at_nth_user_message = conversation.forked_at_nth_user_message.map(|n| n as i32);

    match existing {
        Some(model) => {
            let mut active: schema::conversations::ActiveModel = model.clone().into();
            active.rollout_path = Set(conversation.rollout_path.clone());
            active.created_at = Set(conversation.created_at.clone());
            active.label = Set(conversation.label.clone());
            active.parent_conversation_id = Set(parent_conversation_id);
            active.forked_at_nth_user_message = Set(forked_at_nth_user_message);
            active
        }
        None => schema::conversations::ActiveModel {
            id: Set(conversation.id.to_string()),
            thread_id: Set(thread_id.as_str().to_string()),
            rollout_path: Set(conversation.rollout_path.clone()),
            created_at: Set(conversation.created_at.clone()),
            label: Set(conversation.label.clone()),
            parent_conversation_id: Set(parent_conversation_id),
            forked_at_nth_user_message: Set(forked_at_nth_user_message),
            base_commit: Set(None),
            snapshots_disabled: Set(false),
        },
    }
}

fn decode_thread(
    thread: schema::threads::Model,
    conversations: Vec<schema::conversations::Model>,
) -> AppResult<Thread> {
    let workspace_path = WorkspacePath(thread.workspace_path.clone());
    let decoded_conversations: Result<Vec<_>, _> = conversations
        .into_iter()
        .map(|conv| decode_conversation(&thread.id, conv))
        .collect();

    let current_conversation_id = ConversationId::from_string(&thread.current_conversation_id)
        .map_err(|_| AppError::Validation {
            message: format!(
                "Invalid conversation ID in thread {}: {}",
                thread.id, thread.current_conversation_id
            ),
        })?;

    Ok(Thread {
        id: ThreadId(thread.id),
        current_conversation_id,
        conversations: decoded_conversations?,
        title: thread.title,
        preview: thread.preview,
        model: thread.model,
        reasoning_effort: parse_json_option(thread.reasoning_effort),
        reasoning_summary: parse_json_option(thread.reasoning_summary),
        sandbox: parse_json_option(thread.sandbox),
        approval: parse_json_option(thread.approval),
        web_search_enabled: parse_json_option(thread.web_search_enabled),
        created_at: thread.created_at,
        updated_at: thread.updated_at,
        workspace_path,
    })
}

fn decode_conversation(
    thread_id: &str,
    model: schema::conversations::Model,
) -> AppResult<Conversation> {
    let parent_conversation_id = model
        .parent_conversation_id
        .and_then(|id| ConversationId::from_string(&id).ok());
    let forked_at_nth_user_message = model.forked_at_nth_user_message.map(|n| n as u32);

    let id = ConversationId::from_string(&model.id).map_err(|_| AppError::Validation {
        message: format!(
            "Invalid conversation ID in thread {}: {}",
            thread_id, model.id
        ),
    })?;

    Ok(Conversation {
        id,
        thread_id: ThreadId(thread_id.to_string()),
        rollout_path: model.rollout_path,
        created_at: model.created_at,
        label: model.label,
        parent_conversation_id,
        forked_at_nth_user_message,
    })
}

// ============================================================
// Helper Functions
// ============================================================

async fn ensure_base_snapshot(ctx: &WorkspaceContext, conversation_id: &ConversationId) {
    if let Err(err) = review::ensure_base(ctx.db(), conversation_id).await {
        log::debug!(
            "Failed to ensure baseline snapshot for conversation {}: {}",
            conversation_id,
            err
        );
    }
}

async fn ensure_subscription(
    ctx: &WorkspaceContext,
    conversation_id: &ConversationId,
    app_handle: AppHandle,
) {
    match ctx.conversations().get_conversation(*conversation_id).await {
        Ok(conversation) => {
            let _ = ctx
                .events()
                .ensure_subscription(
                    *conversation_id,
                    conversation,
                    app_handle,
                    conversation_id.to_string(),
                )
                .await;
        }
        Err(err) => {
            log::debug!(
                "Unable to fetch conversation {} for subscription: {}",
                conversation_id,
                err
            );
        }
    }
}
