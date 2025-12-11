use std::sync::Arc;

use anyhow::Context;
use codex_core::AuthManager;
use codex_core::ModelClient;
use codex_core::Prompt;
use codex_core::ResponseEvent;
use codex_core::auth::CodexAuth;
use codex_core::config::Config;
use codex_core::content_items_to_text;
use codex_core::openai_models::model_family::ModelFamily;
use codex_core::openai_models::models_manager::ModelsManager;
use codex_otel::otel_event_manager::OtelEventManager;
use codex_protocol::ConversationId;
use codex_protocol::openai_models::ReasoningEffort;
use codex_protocol::protocol::SessionSource;
use futures::StreamExt;

const TERMINAL_TYPE: &str = "pasture-desktop";

#[derive(Clone)]
pub struct ModelConfig {
    pub model: String,
    pub reasoning_effort: Option<ReasoningEffort>,
}

/// Stream a prompt and return the aggregated text content, if any, from the assistant.
/// The model can be overridden per call.
pub async fn generate_text(
    base_config: Arc<Config>,
    auth_manager: Arc<AuthManager>,
    models_manager: Arc<ModelsManager>,
    conversation_id: ConversationId,
    prompt: &Prompt,
    model_config: Option<ModelConfig>,
) -> anyhow::Result<Option<String>> {
    // Clone config so we can safely override the model without mutating runtime state.
    let mut config = base_config.as_ref().clone();
    let mut model_slug = models_manager.get_model(&config.model, &config).await;
    if let Some(ModelConfig {
        model,
        reasoning_effort,
    }) = model_config
    {
        model_slug = model;
        config.model = Some(model_slug.clone());
        config.model_reasoning_effort = reasoning_effort;
    } else if config.model.is_none() {
        config.model = Some(model_slug.clone());
    }
    let model_family = models_manager
        .construct_model_family(&model_slug, &config)
        .await;
    let config = Arc::new(config);

    let auth = auth_manager.auth();
    let otel_event_manager = build_otel_event_manager(
        &config,
        &model_family,
        auth.clone(),
        conversation_id,
        &model_slug,
    );

    let client = ModelClient::new(
        Arc::clone(&config),
        Some(auth_manager),
        model_family.clone(),
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
    config: &Config,
    model_family: &ModelFamily,
    auth: Option<CodexAuth>,
    conversation_id: ConversationId,
    model_slug: &str,
) -> OtelEventManager {
    OtelEventManager::new(
        conversation_id,
        model_slug,
        model_family.slug.as_str(),
        auth.as_ref().and_then(|a| a.get_account_id()),
        auth.as_ref().and_then(|a| a.get_account_email()),
        auth.as_ref().map(|a| a.mode),
        config.otel.log_user_prompt,
        TERMINAL_TYPE.to_string(),
    )
}
