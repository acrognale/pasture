use std::sync::Arc;

use anyhow::Context;
use codex_core::ModelClient;
use codex_core::Prompt;
use codex_core::ResponseEvent;
use codex_core::content_items_to_text;
use codex_core::model_family::find_family_for_model;
use codex_otel::otel_event_manager::OtelEventManager;
use codex_protocol::ConversationId;
use codex_protocol::config_types::ReasoningEffort;
use codex_protocol::protocol::SessionSource;
use futures::StreamExt;

use crate::codex_runtime::CodexRuntime;

const TERMINAL_TYPE: &str = "pasture-desktop";

#[derive(Clone)]
pub struct ModelConfig {
    pub model: String,
    pub reasoning_effort: Option<ReasoningEffort>,
}

/// Stream a prompt and return the aggregated text content, if any, from the assistant.
/// The model can be overridden per call.
pub async fn generate_text(
    runtime: &CodexRuntime,
    conversation_id: ConversationId,
    prompt: &Prompt,
    model_config: Option<ModelConfig>,
) -> anyhow::Result<Option<String>> {
    // Clone config so we can safely override the model without mutating runtime state.
    let mut config = runtime.config().as_ref().clone();
    if let Some(model_config) = model_config {
        config.model = model_config.model;
        config.model_reasoning_effort = model_config.reasoning_effort;
        if let Some(family) = find_family_for_model(&config.model) {
            config.model_family = family;
        }
    }
    let config = Arc::new(config);

    let auth_manager = runtime.auth_manager().clone();
    let otel_event_manager = build_otel_event_manager(runtime, conversation_id);

    let client = ModelClient::new(
        Arc::clone(&config),
        Some(auth_manager),
        otel_event_manager,
        config.model_provider.clone(),
        config.model_reasoning_effort,
        config.model_reasoning_summary,
        conversation_id,
        SessionSource::VSCode,
    );

    let mut stream = client
        .stream(prompt)
        .await
        .context("model stream failed to start")?;

    let mut text_delta = String::new();
    let mut final_message: Option<String> = None;

    while let Some(event) = stream.next().await {
        match event {
            Ok(ResponseEvent::OutputItemDone(item)) => {
                if final_message.is_none() {
                    final_message = match item {
                        codex_core::ResponseItem::Message { content, .. } => {
                            content_items_to_text(&content)
                        }
                        _ => None,
                    };
                }
            }
            Ok(ResponseEvent::OutputTextDelta(delta)) => text_delta.push_str(&delta),
            Ok(ResponseEvent::Completed { .. }) => break,
            Ok(_) => continue,
            Err(err) => return Err(err.into()),
        }
    }

    if let Some(message) = final_message {
        Ok(Some(message))
    } else if text_delta.is_empty() {
        Ok(None)
    } else {
        Ok(Some(text_delta))
    }
}

fn build_otel_event_manager(
    runtime: &CodexRuntime,
    conversation_id: ConversationId,
) -> OtelEventManager {
    let config = runtime.config();
    let auth = runtime.auth_manager().auth();

    OtelEventManager::new(
        conversation_id,
        config.model.as_str(),
        config.model_family.slug.as_str(),
        auth.as_ref().and_then(|a| a.get_account_id()),
        auth.as_ref().and_then(|a| a.get_account_email()),
        auth.as_ref().map(|a| a.mode),
        config.otel.log_user_prompt,
        TERMINAL_TYPE.to_string(),
    )
}
