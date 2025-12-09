use async_trait::async_trait;
use codex_protocol::models::ContentItem;
use codex_protocol::models::ResponseItem;
use codex_protocol::protocol::EventMsg;
use futures::StreamExt;
use serde::Deserialize;
use std::sync::Arc;

use crate::client_common::Prompt;
use crate::client_common::ResponseEvent;
use crate::codex::TurnContext;
use crate::function_tool::FunctionCallError;
use crate::rollout::find_conversation_path_by_id_str;
use crate::rollout::recorder::RolloutRecorder;
use crate::tools::context::ToolInvocation;
use crate::tools::context::ToolOutput;
use crate::tools::context::ToolPayload;
use crate::tools::registry::ToolHandler;
use crate::tools::registry::ToolKind;
use codex_protocol::protocol::ReadThreadEndEvent;

pub struct ReadThreadHandler;

const READ_THREAD_SUMMARY_PROMPT: &str = r#"You are a focused summarizer.
Given a user's request and the full transcript of a past thread, extract only the information that is directly useful for fulfilling the request.

Guidelines:
- Be concise but specific; prefer bullet points or short paragraphs.
- Quote code, commands, or key identifiers exactly when they matter.
- If the thread lacks information needed for the request, say so explicitly.
- Do not reproduce the entire transcript; include only the relevant parts."#;

#[derive(Deserialize)]
struct ReadThreadArgs {
    #[serde(rename = "ref")]
    thread_ref: String,
    instructions: String,
}

#[async_trait]
impl ToolHandler for ReadThreadHandler {
    fn kind(&self) -> ToolKind {
        ToolKind::Function
    }

    async fn handle(&self, invocation: ToolInvocation) -> Result<ToolOutput, FunctionCallError> {
        let ToolInvocation {
            session,
            turn,
            call_id,
            payload,
            ..
        } = invocation;

        let arguments = match payload {
            ToolPayload::Function { arguments } => arguments,
            _ => {
                return Err(FunctionCallError::RespondToModel(
                    "read_thread handler received unsupported payload".to_string(),
                ));
            }
        };

        let args: ReadThreadArgs = serde_json::from_str(&arguments).map_err(|err| {
            FunctionCallError::RespondToModel(format!(
                "failed to parse function arguments: {err:?}"
            ))
        })?;

        let uuid = match uuid::Uuid::parse_str(&args.thread_ref) {
            Ok(id) => id,
            Err(_) => {
                return Err(FunctionCallError::RespondToModel(
                    "read_thread currently supports only local thread ids (UUID)".to_string(),
                ));
            }
        };

        let codex_home = session.codex_home().await;
        let rollout_path = find_conversation_path_by_id_str(&codex_home, &uuid.to_string())
            .await
            .map_err(|err| {
                FunctionCallError::RespondToModel(format!(
                    "failed to locate rollout for thread: {err}"
                ))
            })?
            .ok_or_else(|| {
                FunctionCallError::RespondToModel("thread not found on this machine".to_string())
            })?;

        let history = RolloutRecorder::get_rollout_history(&rollout_path)
            .await
            .map_err(|err| {
                FunctionCallError::RespondToModel(format!("failed to load thread history: {err}"))
            })?;

        let events = history.get_event_msgs().unwrap_or_default();
        let transcript = render_transcript(events);
        let result = summarize_thread(&turn, &args.instructions, &transcript).await;

        // Emit a single-shot event describing the outcome of this tool call.
        let (success, summary, error_message) = match &result {
            Ok(text) => (true, text.clone(), None),
            Err(err) => (false, String::new(), Some(err.to_string())),
        };

        session
            .send_event(
                &turn,
                EventMsg::ReadThreadEnd(ReadThreadEndEvent {
                    call_id: call_id.clone(),
                    turn_id: turn.sub_id.clone(),
                    thread_ref: args.thread_ref.clone(),
                    instructions: args.instructions.clone(),
                    summary: summary.clone(),
                    success,
                    error_message,
                }),
            )
            .await;

        // Propagate the original result back to the model/tool caller.
        let content = result?;

        Ok(ToolOutput::Function {
            content,
            content_items: None,
            success: Some(true),
        })
    }
}

async fn summarize_thread(
    turn: &Arc<TurnContext>,
    instructions: &str,
    transcript: &str,
) -> Result<String, FunctionCallError> {
    let user_prompt = format!(
        "Extract the parts of the thread that matter for the user's request.\n\nUser request:\n{instructions}\n\nThread transcript (markdown):\n{transcript}"
    );

    let mut prompt = Prompt::default();

    prompt.input.push(ResponseItem::Message {
        id: None,
        role: "developer".to_string(),
        content: vec![ContentItem::InputText {
            text: READ_THREAD_SUMMARY_PROMPT.to_string(),
        }],
    });

    prompt.input.push(ResponseItem::Message {
        id: None,
        role: "user".to_string(),
        content: vec![ContentItem::InputText { text: user_prompt }],
    });

    prompt.tools = vec![];
    prompt.parallel_tool_calls = false;
    prompt.output_schema = None;

    let mut stream = turn.client.clone().stream(&prompt).await.map_err(|err| {
        FunctionCallError::RespondToModel(format!("failed to summarize thread: {err}"))
    })?;

    let mut summary = String::new();

    while let Some(event) = stream.next().await {
        match event {
            Ok(ResponseEvent::OutputItemDone(item)) => {
                if let Some(text) = response_item_text(&item) {
                    summary = text;
                }
            }
            Ok(ResponseEvent::OutputTextDelta(delta)) => summary.push_str(&delta),
            Ok(ResponseEvent::Completed { .. }) => break,
            Ok(ResponseEvent::RateLimits(_)) => {}
            Ok(_) => {}
            Err(err) => {
                return Err(FunctionCallError::RespondToModel(format!(
                    "failed while streaming summary: {err}"
                )));
            }
        }
    }

    if summary.trim().is_empty() {
        return Err(FunctionCallError::RespondToModel(
            "summarization did not return any content".to_string(),
        ));
    }

    Ok(summary)
}

fn render_transcript(events: Vec<EventMsg>) -> String {
    let mut out = String::new();
    for ev in events {
        match ev {
            EventMsg::UserMessage(msg) => {
                out.push_str("### User\n");
                out.push_str(msg.message.as_str());
                if let Some(imgs) = msg.images.as_ref() {
                    if !imgs.is_empty() {
                        out.push_str("\n\n");
                        out.push_str(&format!("_[{} image(s) attached]_", imgs.len()));
                    }
                }
                out.push_str("\n\n");
            }
            EventMsg::AgentMessage(msg) => {
                out.push_str("### Assistant\n");
                out.push_str(msg.message.as_str());
                out.push_str("\n\n");
            }
            _ => {}
        }
    }
    out.trim().to_string()
}

fn response_item_text(item: &ResponseItem) -> Option<String> {
    match item {
        ResponseItem::Message { content, .. } => {
            let mut buffers: Vec<&str> = Vec::new();
            for segment in content {
                match segment {
                    ContentItem::InputText { text } | ContentItem::OutputText { text } => {
                        if !text.is_empty() {
                            buffers.push(text);
                        }
                    }
                    ContentItem::InputImage { .. } => {}
                }
            }
            if buffers.is_empty() {
                None
            } else {
                Some(buffers.join("\n"))
            }
        }
        ResponseItem::FunctionCallOutput { output, .. } => Some(output.content.clone()),
        _ => None,
    }
}
