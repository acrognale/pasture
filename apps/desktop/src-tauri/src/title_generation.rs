use codex_core::Prompt;
use codex_core::ResponseItem;
use codex_protocol::ConversationId;
use codex_protocol::config_types::ReasoningEffort;
use codex_protocol::models::ContentItem;
use sea_orm::DatabaseConnection;
use serde_json::json;
use tauri::AppHandle;
use tauri::Emitter;

use crate::codex_runtime::CodexRuntime;
use crate::completions;
use crate::events::CodexEvent;
use crate::events::ThreadMetadataPayload;

const MAX_TITLE_LENGTH: usize = 80;
const MAX_INPUT_LENGTH: usize = 500;

/// Spawn a background task to generate a session title for the given conversation.
/// Best-effort: errors are logged at debug level and will not impact the user flow.
pub fn spawn_generate_thread_title(
    runtime: CodexRuntime,
    db: DatabaseConnection,
    conversation_id: ConversationId,
    user_message: String,
    app_handle: AppHandle,
) {
    tauri::async_runtime::spawn(async move {
        if let Err(err) =
            maybe_generate_thread_title(runtime, db, conversation_id, user_message, app_handle)
                .await
        {
            log::debug!("Session title generation skipped: {err}");
        }
    });
}

async fn maybe_generate_thread_title(
    runtime: CodexRuntime,
    db: DatabaseConnection,
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

    let conversation_id_str = conversation_id.to_string();
    let needs_title = crate::db::threads::conversation_has_missing_title(&db, &conversation_id_str)
        .await
        .unwrap_or_else(|err| {
            log::debug!(
                "Failed to check existing titles for conversation {conversation_id_str}: {err}"
            );
            false
        });

    if !needs_title {
        log::debug!(
            "Skipping title generation for conversation {}: title already present",
            conversation_id_str
        );
        return Ok(());
    }

    let prompt = build_prompt(trimmed_message);
    let model = completions::ModelConfig {
        model: "gpt-5.1-codex-mini".to_string(),
        reasoning_effort: Some(ReasoningEffort::Low),
    };

    log::info!(
        "Generating session title for conversation {} using model {}",
        conversation_id_str,
        model.model
    );

    match completions::generate_text(&runtime, conversation_id, &prompt, Some(model)).await {
        Ok(Some(text)) => {
            log::info!(
                "Title generation model response for conversation {}: {}",
                conversation_id_str,
                text
            );
            if let Some(title) = parse_title_from_text(&text) {
                match crate::db::threads::update_thread_title_for_conversation(
                    &db,
                    &conversation_id_str,
                    &title,
                )
                .await
                {
                    Ok(updated) => {
                        if updated {
                            emit_thread_metadata_events(
                                &db,
                                &app_handle,
                                &conversation_id_str,
                                Some(title),
                                None,
                            )
                            .await;
                            log::info!(
                                "Emitted generated session title for conversation {}",
                                conversation_id_str
                            );
                        } else {
                            log::info!(
                                "Generated title for conversation {} but no rows were updated (possibly already set)",
                                conversation_id_str
                            );
                        }
                    }
                    Err(err) => {
                        log::info!(
                            "Failed to store generated title for conversation {conversation_id_str}: {err}"
                        );
                    }
                }
            } else {
                log::info!(
                    "Model did not return a usable title for conversation {conversation_id_str}"
                );
            }
        }
        Ok(None) => {
            log::info!(
                "Model did not return a usable title for conversation {conversation_id_str}"
            );
        }
        Err(err) => {
            log::info!("Failed to generate title for conversation {conversation_id_str}: {err:?}");
        }
    }

    Ok(())
}

fn build_prompt(user_message: &str) -> Prompt {
    let condensed_message: String = user_message.chars().take(MAX_INPUT_LENGTH).collect();
    let mut prompt = Prompt::default();

    prompt.input.push(ResponseItem::Message {
        id: None,
        role: "developer".to_string(),
        content: vec![ContentItem::InputText {
            text: "Generate a 3-5 word title for the user's request.".to_string(),
        }],
    });

    prompt.input.push(ResponseItem::Message {
        id: None,
        role: "user".to_string(),
        content: vec![ContentItem::InputText {
            text: condensed_message,
        }],
    });

    prompt.output_schema = Some(json!({
        "type": "object",
        "properties": {
            "title": { "type": "string" }
        },
        "additionalProperties": false,
        "required": ["title"]
    }));

    prompt
}

fn parse_title_from_text(text: &str) -> Option<String> {
    let trimmed = text.trim();

    if let Ok(value) = serde_json::from_str::<serde_json::Value>(trimmed) {
        if let Some(title) = value.get("title").and_then(|t| t.as_str()) {
            return normalize_title(title);
        }
    }

    normalize_title(trimmed)
}

fn normalize_title(raw: &str) -> Option<String> {
    let stripped = raw
        .trim()
        .trim_matches(|c| matches!(c, '"' | '\'' | '“' | '”' | '`'));
    if stripped.is_empty() {
        return None;
    }

    let collapsed = stripped.split_whitespace().collect::<Vec<_>>().join(" ");
    if collapsed.is_empty() || collapsed.eq_ignore_ascii_case("untitled session") {
        return None;
    }

    let normalized: String = if collapsed.chars().count() > MAX_TITLE_LENGTH {
        collapsed.chars().take(MAX_TITLE_LENGTH).collect()
    } else {
        collapsed
    };

    Some(normalized)
}

async fn emit_thread_metadata_events(
    db: &DatabaseConnection,
    app_handle: &AppHandle,
    conversation_id: &str,
    title: Option<String>,
    preview: Option<String>,
) {
    let threads = match crate::db::threads::get_threads_for_conversation(db, conversation_id).await
    {
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
            thread_id: thread.id.clone(),
            conversation_id: thread.current_conversation_id.clone(),
            workspace_path: thread.workspace_path.clone(),
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
