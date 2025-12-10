use std::sync::Arc;

use super::SessionTask;
use super::SessionTaskContext;
use crate::client_common::Prompt;
use crate::client_common::ResponseEvent;
use crate::codex::TurnContext;
use crate::compact::content_items_to_text;
use crate::protocol::HandoffFileRef;
use crate::protocol::HandoffPlanEvent;
use crate::protocol::RolloutItem;
use crate::state::TaskKind;
use async_trait::async_trait;
use codex_protocol::models::ResponseItem;
use codex_protocol::protocol::TaskStartedEvent;
use codex_protocol::user_input::UserInput;
use futures::StreamExt;
use serde::Deserialize;
use serde_json::json;
use tokio_util::sync::CancellationToken;

#[derive(Clone)]
pub(crate) struct HandoffTask {
    candidate_files: Vec<String>,
}

impl HandoffTask {
    pub(crate) fn new(candidate_files: Vec<String>) -> Self {
        Self { candidate_files }
    }
}

#[async_trait]
impl SessionTask for HandoffTask {
    fn kind(&self) -> TaskKind {
        TaskKind::Handoff
    }

    async fn run(
        self: Arc<Self>,
        session: Arc<SessionTaskContext>,
        ctx: Arc<TurnContext>,
        input: Vec<UserInput>,
        _cancellation_token: CancellationToken,
    ) -> Option<String> {
        let sess = session.clone_session();

        // Start event so UIs can show progress.
        let start_event = codex_protocol::protocol::EventMsg::TaskStarted(TaskStartedEvent {
            model_context_window: ctx.client.get_model_context_window(),
        });
        sess.send_event(&ctx, start_event).await;

        let goal = match input.first() {
            Some(UserInput::Text { text }) => text.as_str(),
            _ => "",
        };

        // Snapshot current history for the prompt payload.
        let history = sess.clone_history().await.get_history();
        let transcript = render_transcript(&history);

        let prompt = build_handoff_prompt(goal, &transcript, &self.candidate_files);

        let mut stream = match ctx.client.clone().stream(&prompt).await {
            Ok(stream) => stream,
            Err(err) => {
                let event = codex_protocol::protocol::EventMsg::Error(
                    codex_protocol::protocol::ErrorEvent {
                        message: format!("handoff planner failed to start: {err}"),
                        codex_error_info: Some(codex_protocol::protocol::CodexErrorInfo::Other),
                    },
                );
                sess.send_event(&ctx, event).await;
                return None;
            }
        };

        let mut collected = String::new();
        let mut final_text: Option<String> = None;

        while let Some(event) = stream.next().await {
            match event {
                Ok(ResponseEvent::OutputItemDone(item)) => {
                    if final_text.is_none() {
                        if let ResponseItem::Message { content, .. } = item {
                            final_text = content_items_to_text(&content);
                        }
                    }
                }
                Ok(ResponseEvent::OutputTextDelta(delta)) => {
                    collected.push_str(&delta);
                }
                Ok(ResponseEvent::RateLimits(snapshot)) => {
                    sess.update_rate_limits(&ctx, snapshot).await;
                }
                Ok(ResponseEvent::Completed { token_usage, .. }) => {
                    sess.update_token_usage_info(&ctx, token_usage.as_ref())
                        .await;
                    break;
                }
                Ok(_) => {}
                Err(err) => {
                    let event = codex_protocol::protocol::EventMsg::Error(
                        codex_protocol::protocol::ErrorEvent {
                            message: format!("handoff planner errored: {err}"),
                            codex_error_info: Some(codex_protocol::protocol::CodexErrorInfo::Other),
                        },
                    );
                    sess.send_event(&ctx, event).await;
                    return None;
                }
            }
        }

        let raw_text = final_text
            .or_else(|| (!collected.is_empty()).then_some(collected.clone()))
            .unwrap_or_default();

        let plan = parse_handoff_plan(&raw_text, &self.candidate_files);

        // Persist in rollout and emit to clients.
        let rollout = RolloutItem::EventMsg(codex_protocol::protocol::EventMsg::HandoffPlan(
            plan.clone(),
        ));
        sess.persist_rollout_items(&[rollout]).await;
        sess.send_event(&ctx, codex_protocol::protocol::EventMsg::HandoffPlan(plan))
            .await;

        None
    }
}

fn render_transcript(items: &[ResponseItem]) -> String {
    let mut transcript = Vec::new();
    for item in items {
        if let ResponseItem::Message { role, content, .. } = item {
            if let Some(text) = content_items_to_text(content) {
                let trimmed = text.trim();
                if trimmed.is_empty() {
                    continue;
                }
                let label = match role.as_str() {
                    "user" => "User",
                    "assistant" => "Assistant",
                    "system" => "System",
                    "developer" => "Developer",
                    _ => "Message",
                };
                transcript.push(format!("{label}: {trimmed}"));
            }
        }
    }
    transcript.join("\n\n")
}

fn build_handoff_prompt(goal: &str, transcript: &str, candidate_files: &[String]) -> Prompt {
    use codex_protocol::models::ContentItem;
    use codex_protocol::models::ResponseItem;

    let mut prompt = Prompt::default();

    prompt.input.push(ResponseItem::Message {
        id: None,
        role: "developer".to_string(),
        content: vec![ContentItem::InputText {
            text: HANDOFF_SYSTEM_PROMPT.to_string(),
        }],
    });

    prompt.input.push(ResponseItem::Message {
        id: None,
        role: "user".to_string(),
        content: vec![ContentItem::InputText {
            text: build_user_payload(goal, transcript, candidate_files),
        }],
    });

    prompt.output_schema = Some(json!({
        "type": "object",
        "properties": {
            "title": { "type": "string" },
            "handoff_prompt": { "type": "string" },
            "relevant_files": {
                "type": "array",
                "items": {
                    "type": "object",
                    "properties": {
                        "path": { "type": "string" },
                        "reason": { "type": "string" }
                    },
                    "required": ["path", "reason"],
                    "additionalProperties": false
                }
            },
            "preview": { "type": "string" }
        },
        "required": ["handoff_prompt", "title", "relevant_files", "preview"],
        "additionalProperties": false
    }));

    prompt
}

fn build_user_payload(goal: &str, transcript: &str, candidate_files: &[String]) -> String {
    let goal_text = if goal.trim().is_empty() {
        "(no explicit goal provided; infer from the conversation)".to_string()
    } else {
        goal.trim().to_string()
    };

    let mut payload = String::new();
    payload.push_str("GOAL FOR NEW THREAD:\n\n");
    payload.push_str(&goal_text);
    payload.push_str("\n\nFULL CONVERSATION HISTORY (OLDEST FIRST):\n\n");
    payload.push_str(transcript.trim());
    payload.push_str("\n\nCANDIDATE FILES (RELATIVE TO WORKSPACE ROOT):\n");

    if candidate_files.is_empty() {
        payload.push_str("(none)\n");
    } else {
        for path in candidate_files {
            payload.push_str("- ");
            payload.push_str(path);
            payload.push('\n');
        }
    }

    payload
}

fn parse_handoff_plan(text: &str, candidates: &[String]) -> HandoffPlanEvent {
    #[derive(Debug, Deserialize)]
    struct PlanFileRef {
        path: String,
        #[serde(default)]
        reason: String,
    }

    #[derive(Debug, Deserialize)]
    struct PlanPayload {
        #[serde(default)]
        title: Option<String>,
        #[serde(default)]
        handoff_prompt: Option<String>,
        #[serde(default)]
        preview: Option<String>,
        #[serde(default)]
        relevant_files: Vec<PlanFileRef>,
    }

    let parsed = serde_json::from_str::<PlanPayload>(text);

    let mut title = None;
    let mut handoff_prompt = None;
    let mut preview = None;
    let mut relevant_files: Vec<HandoffFileRef> = Vec::new();

    if let Ok(payload) = parsed {
        handoff_prompt = payload
            .handoff_prompt
            .map(|value| value.trim().to_string())
            .filter(|value| !value.is_empty());

        title = payload
            .title
            .map(|value| value.trim().to_string())
            .filter(|value| !value.is_empty());

        preview = payload
            .preview
            .map(|value| value.trim().to_string())
            .filter(|value| !value.is_empty());

        let candidate_set: std::collections::HashSet<&String> = candidates.iter().collect();
        relevant_files = payload
            .relevant_files
            .into_iter()
            .filter_map(|file| {
                if candidate_set.contains(&file.path) {
                    Some(HandoffFileRef {
                        path: file.path,
                        reason: file.reason,
                    })
                } else {
                    None
                }
            })
            .collect();
    }

    let handoff_prompt = handoff_prompt.unwrap_or_else(|| text.trim().to_string());

    HandoffPlanEvent {
        title,
        handoff_prompt,
        preview,
        relevant_files,
    }
}

const HANDOFF_SYSTEM_PROMPT: &str = include_str!("../../templates/handoff/prompt.md");
