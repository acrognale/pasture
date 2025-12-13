use async_stream::try_stream;
use codex_api::common::ResponseEvent;
use codex_protocol::models::ContentItem;
use codex_protocol::models::ReasoningItemContent;
use codex_protocol::models::ResponseItem;
use eventsource_stream::Event;
use futures::Stream;
use futures::StreamExt;
use serde::Deserialize;
use std::collections::HashMap;

use crate::error::AnthropicError;
use crate::http::AnthropicClient;
use crate::http::open_stream;
use crate::request::ContentBlock;
use crate::request::build_request;

/// Parameters for a streaming Messages call.
#[derive(Debug, Clone)]
pub struct StreamParams {
    pub model: String,
    pub prompt: codex_api::Prompt,
    pub max_tokens: u32,
    /// Controls whether Anthropic "thinking" is enabled for this request.
    ///
    /// When set, `build_request` will include a `thinking` object in the payload.
    pub thinking: Option<ThinkingParams>,
    /// Controls prompt caching behavior for the Anthropic Messages API.
    ///
    /// When `None`, caching defaults to enabled and can be overridden globally
    /// via `CODEX_ANTHROPIC_PROMPT_CACHING=0`.
    pub prompt_caching: Option<PromptCachingParams>,
}

#[derive(Debug, Clone)]
pub struct ThinkingParams {
    pub enabled: bool,
    pub budget_tokens: u32,
}

#[derive(Debug, Clone)]
pub struct PromptCachingParams {
    /// Whether to attach `cache_control` blocks in the request.
    pub enabled: bool,
    /// Optional TTL for ephemeral prompt caching (currently only `Some("1h")` is forwarded).
    pub ttl: Option<String>,
    /// Number of trailing messages in the request to mark cacheable.
    pub last_n_messages: usize,
}

impl StreamParams {
    pub fn from_preset(
        preset: crate::model_presets::ModelPreset,
        prompt: codex_api::Prompt,
    ) -> Self {
        preset.stream_params(prompt)
    }

    pub fn with_model(mut self, model: impl Into<String>) -> Self {
        self.model = model.into();
        self
    }

    pub fn with_max_tokens(mut self, max_tokens: u32) -> Self {
        self.max_tokens = max_tokens;
        self
    }

    pub fn with_thinking(mut self, thinking: Option<ThinkingParams>) -> Self {
        self.thinking = thinking;
        self
    }

    pub fn with_prompt_caching(mut self, prompt_caching: Option<PromptCachingParams>) -> Self {
        self.prompt_caching = prompt_caching;
        self
    }
}

/// Stream Anthropic Messages API events and adapt them into Codex-native `ResponseEvent`s.
pub fn stream(
    client: AnthropicClient,
    params: StreamParams,
) -> impl Stream<Item = Result<ResponseEvent, AnthropicError>> {
    try_stream! {
        let request = build_request(&params);
        let mut event_stream = open_stream(client, &request).await?;

        let mut response_id: Option<String> = None;
        let mut assistant_started = false;
        let mut thinking_started = false;
        let mut thinking_block_index: Option<u32> = None;
        let mut thinking_id: Option<String> = None;
        let mut thinking_accumulated = String::new();
        let mut accumulated = String::new();
        let mut completed = false;
        let mut pending_tools: HashMap<u32, PendingToolUse> = HashMap::new();
        let log_raw_sse = std::env::var("CODEX_ANTHROPIC_LOG_RAW_SSE")
            .ok()
            .filter(|v| !v.trim().is_empty() && v.trim() != "0")
            .is_some();

        // Keep parity with other providers: emit a Created marker when the SSE stream opens.
        yield ResponseEvent::Created;

        while let Some(event) = event_stream.next().await {
            let event = event?;
            if log_raw_sse {
                const MAX_BYTES: usize = 16 * 1024;
                let mut data = event.data.clone();
                if data.len() > MAX_BYTES {
                    data.truncate(MAX_BYTES);
                    true
                } else {
                    false
                };
                tracing::debug!(
                    anthropic_event = %event.event,
                    anthropic_data = %data,
                    "SSE event"
                );
            }
            match parse_event(event)? {
                ParsedEvent::MessageStart { id } => {
                    response_id = Some(id);
                    if thinking_id.is_none() {
                        thinking_id = response_id.as_ref().map(|rid| format!("{rid}:thinking"));
                    }
                }
                ParsedEvent::ContentBlockStart { index, content_block } => {
                    match content_block {
                        ContentBlock::Text { .. } => {
                            if !assistant_started {
                                assistant_started = true;
                                yield ResponseEvent::OutputItemAdded(ResponseItem::Message {
                                    id: None,
                                    role: "assistant".to_string(),
                                    content: vec![ContentItem::OutputText { text: String::new() }],
                                });
                            }
                        }
                        ContentBlock::Thinking { .. } => {
                            if !thinking_started {
                                thinking_started = true;
                                thinking_block_index = Some(index);
                                let id = thinking_id
                                    .clone()
                                    .unwrap_or_else(|| "anthropic_message:thinking".to_string());
                                yield ResponseEvent::OutputItemAdded(ResponseItem::Reasoning {
                                    id,
                                    summary: Vec::new(),
                                    content: Some(Vec::new()),
                                    encrypted_content: None,
                                });

                                // Ensure TUIs that only render "experimental" reasoning blocks show a
                                // visible section with a stable header.
                            }
                        }
                        ContentBlock::ToolUse {
                            id,
                            name,
                            input,
                            ..
                        } => {
                            pending_tools.insert(
                                index,
                                PendingToolUse {
                                    id,
                                    name,
                                    start_input: input,
                                    json_buffer: String::new(),
                                },
                            );
                        }
                        _ => {}
                    }
                }
                ParsedEvent::TextDelta { delta } => {
                    if !assistant_started {
                        assistant_started = true;
                        yield ResponseEvent::OutputItemAdded(ResponseItem::Message {
                            id: None,
                            role: "assistant".to_string(),
                            content: vec![ContentItem::OutputText { text: String::new() }],
                        });
                    }

                    accumulated.push_str(&delta);
                    yield ResponseEvent::OutputTextDelta(delta);
                }
                ParsedEvent::ThinkingDelta { index, delta } => {
                    // Ignore deltas for non-thinking blocks.
                    if thinking_block_index != Some(index) {
                        continue;
                    }
                    if !thinking_started {
                        thinking_started = true;
                        thinking_block_index = Some(index);
                        let id = thinking_id
                            .clone()
                            .unwrap_or_else(|| "anthropic_message:thinking".to_string());
                        yield ResponseEvent::OutputItemAdded(ResponseItem::Reasoning {
                            id,
                            summary: Vec::new(),
                            content: Some(Vec::new()),
                            encrypted_content: None,
                        });

                    }

                    thinking_accumulated.push_str(&delta);
                    yield ResponseEvent::ReasoningContentDelta {
                        delta,
                        content_index: 0,
                    };
                }
                ParsedEvent::InputJsonDelta { index, partial_json } => {
                    if let Some(pending) = pending_tools.get_mut(&index) {
                        pending.json_buffer.push_str(&partial_json);
                    }
                }
                ParsedEvent::ContentBlockStop { index } => {
                    if let Some(pending) = pending_tools.remove(&index) {
                        let input = pending.final_input();
                        let arguments =
                            serde_json::to_string(&input).unwrap_or_else(|_| "{}".to_string());
                        yield ResponseEvent::OutputItemDone(ResponseItem::FunctionCall {
                            id: None,
                            name: pending.name,
                            arguments,
                            call_id: pending.id,
                        });
                    } else if thinking_started && thinking_block_index == Some(index) {
                        let id = thinking_id
                            .clone()
                            .unwrap_or_else(|| "anthropic_message:thinking".to_string());
                        let text = std::mem::take(&mut thinking_accumulated);
                        yield ResponseEvent::OutputItemDone(ResponseItem::Reasoning {
                            id,
                            summary: Vec::new(),
                            content: Some(vec![ReasoningItemContent::ReasoningText { text }]),
                            encrypted_content: None,
                        });
                        thinking_started = false;
                        thinking_block_index = None;
                    }
                }
                ParsedEvent::MessageStop => {
                    completed = true;
                    let final_text = accumulated.clone();

                    if thinking_started {
                        let id = thinking_id
                            .clone()
                            .unwrap_or_else(|| "anthropic_message:thinking".to_string());
                        let text = std::mem::take(&mut thinking_accumulated);
                        yield ResponseEvent::OutputItemDone(ResponseItem::Reasoning {
                            id,
                            summary: Vec::new(),
                            content: Some(vec![ReasoningItemContent::ReasoningText { text }]),
                            encrypted_content: None,
                        });
                    }

                    // Defensive: if the stream ends without emitting ContentBlockStop for pending
                    // tool blocks, flush them so downstream tool routing still runs.
                    if !pending_tools.is_empty() {
                        let mut indices: Vec<u32> = pending_tools.keys().copied().collect();
                        indices.sort_unstable();
                        for index in indices {
                            if let Some(pending) = pending_tools.remove(&index) {
                                let input = pending.final_input();
                                let arguments = serde_json::to_string(&input)
                                    .unwrap_or_else(|_| "{}".to_string());
                                yield ResponseEvent::OutputItemDone(ResponseItem::FunctionCall {
                                    id: None,
                                    name: pending.name,
                                    arguments,
                                    call_id: pending.id,
                                });
                            }
                        }
                    }

                    if assistant_started || !final_text.trim().is_empty() {
                        yield ResponseEvent::OutputItemDone(ResponseItem::Message {
                            id: None,
                            role: "assistant".to_string(),
                            content: vec![ContentItem::OutputText { text: final_text }],
                        });
                    }

                    let response_id = response_id.unwrap_or_else(|| "anthropic_message".to_string());
                    yield ResponseEvent::Completed {
                        response_id,
                        token_usage: None,
                    };
                    break;
                }
                ParsedEvent::Ping | ParsedEvent::Ignore => {}
                ParsedEvent::Error(msg) => Err(AnthropicError::Protocol(msg))?,
            }
        }

        if !completed {
            Err(AnthropicError::StreamClosedEarly)?;
        }
    }
}

#[derive(Debug)]
enum ParsedEvent {
    MessageStart {
        id: String,
    },
    ContentBlockStart {
        index: u32,
        content_block: ContentBlock,
    },
    TextDelta {
        delta: String,
    },
    ThinkingDelta {
        index: u32,
        delta: String,
    },
    InputJsonDelta {
        index: u32,
        partial_json: String,
    },
    ContentBlockStop {
        index: u32,
    },
    MessageStop,
    Ping,
    Error(String),
    Ignore,
}

fn parse_event(event: Event) -> Result<ParsedEvent, AnthropicError> {
    let event_name = if event.event.is_empty() {
        "message"
    } else {
        event.event.as_str()
    };

    parse_wire_event(event_name, &event.data)
}

fn parse_wire_event(event_name: &str, data: &str) -> Result<ParsedEvent, AnthropicError> {
    if event_name == "ping" {
        return Ok(ParsedEvent::Ping);
    }

    if data.trim().is_empty() {
        return Ok(ParsedEvent::Ignore);
    }

    let parsed: WireEvent = serde_json::from_str(data)?;
    match parsed {
        WireEvent::MessageStart { message } => Ok(ParsedEvent::MessageStart { id: message.id }),
        WireEvent::ContentBlockStart {
            index,
            content_block,
        } => Ok(ParsedEvent::ContentBlockStart {
            index,
            content_block,
        }),
        WireEvent::ContentBlockDelta { index, delta } => match delta {
            ContentBlockDeltaPayload::TextDelta { text } => {
                Ok(ParsedEvent::TextDelta { delta: text })
            }
            ContentBlockDeltaPayload::ThinkingDelta { thinking } => {
                Ok(ParsedEvent::ThinkingDelta {
                    index,
                    delta: thinking,
                })
            }
            ContentBlockDeltaPayload::InputJsonDelta { partial_json } => {
                Ok(ParsedEvent::InputJsonDelta {
                    index,
                    partial_json,
                })
            }
            ContentBlockDeltaPayload::Unknown => Ok(ParsedEvent::Ignore),
        },
        WireEvent::MessageStop { .. } => Ok(ParsedEvent::MessageStop),
        WireEvent::Ping => Ok(ParsedEvent::Ping),
        WireEvent::Error { error } => Ok(ParsedEvent::Error(
            error.message.unwrap_or_else(|| "unknown error".to_string()),
        )),
        WireEvent::Unknown => Ok(ParsedEvent::Ignore),
        WireEvent::MessageDelta { .. } => Ok(ParsedEvent::Ignore),
        WireEvent::ContentBlockStop { index } => Ok(ParsedEvent::ContentBlockStop { index }),
    }
}

#[derive(Debug, Deserialize)]
struct WireMessage {
    id: String,
}

#[derive(Debug, Deserialize)]
struct WireError {
    #[serde(default)]
    message: Option<String>,
}

#[derive(Debug, Deserialize)]
#[serde(tag = "type", rename_all = "snake_case")]
enum ContentBlockDeltaPayload {
    TextDelta {
        text: String,
    },
    ThinkingDelta {
        thinking: String,
    },
    InputJsonDelta {
        partial_json: String,
    },
    #[serde(other)]
    Unknown,
}

#[derive(Debug, Deserialize)]
#[serde(tag = "type", rename_all = "snake_case")]
enum WireEvent {
    MessageStart {
        message: WireMessage,
    },
    MessageDelta {
        #[serde(rename = "delta")]
        _delta: serde_json::Value,
    },
    MessageStop {},
    ContentBlockStart {
        index: u32,
        content_block: ContentBlock,
    },
    ContentBlockDelta {
        index: u32,
        delta: ContentBlockDeltaPayload,
    },
    ContentBlockStop {
        index: u32,
    },
    Ping,
    Error {
        error: WireError,
    },
    #[serde(other)]
    Unknown,
}

#[derive(Debug)]
struct PendingToolUse {
    id: String,
    name: String,
    start_input: serde_json::Value,
    json_buffer: String,
}

impl PendingToolUse {
    fn final_input(&self) -> serde_json::Value {
        let buf = self.json_buffer.trim();
        if buf.is_empty() {
            return self.start_input.clone();
        }
        serde_json::from_str(buf).unwrap_or_else(|_| self.start_input.clone())
    }
}

#[cfg(test)]
mod tests {
    use super::ParsedEvent;
    use super::parse_wire_event;
    use serde_json::json;

    #[test]
    fn parses_tool_use_content_block_start() {
        let data = json!({
          "type": "content_block_start",
          "index": 0,
          "content_block": {
            "type": "tool_use",
            "id": "call_1",
            "name": "echo",
            "input": { "text": "hi" }
          }
        })
        .to_string();

        let event = parse_wire_event("message", &data).expect("parse");
        match event {
            ParsedEvent::ContentBlockStart {
                index,
                content_block,
            } => {
                assert_eq!(index, 0);
                match content_block {
                    crate::request::ContentBlock::ToolUse {
                        id, name, input, ..
                    } => {
                        assert_eq!(id, "call_1");
                        assert_eq!(name, "echo");
                        assert_eq!(input, json!({"text":"hi"}));
                    }
                    other => panic!("expected tool_use, got {other:?}"),
                }
            }
            other => panic!("expected tool_use, got {other:?}"),
        }
    }

    #[test]
    fn parses_input_json_delta() {
        let data = json!({
          "type": "content_block_delta",
          "index": 2,
          "delta": {
            "type": "input_json_delta",
            "partial_json": "{\"command\":"
          }
        })
        .to_string();

        let event = parse_wire_event("message", &data).expect("parse");
        match event {
            ParsedEvent::InputJsonDelta {
                index,
                partial_json,
            } => {
                assert_eq!(index, 2);
                assert_eq!(partial_json, "{\"command\":");
            }
            other => panic!("expected input_json_delta, got {other:?}"),
        }
    }

    #[test]
    fn parses_thinking_delta() {
        let data = json!({
          "type": "content_block_delta",
          "index": 1,
          "delta": {
            "type": "thinking_delta",
            "thinking": "step"
          }
        })
        .to_string();

        let event = parse_wire_event("message", &data).expect("parse");
        match event {
            ParsedEvent::ThinkingDelta { index, delta } => {
                assert_eq!(index, 1);
                assert_eq!(delta, "step");
            }
            other => panic!("expected thinking_delta, got {other:?}"),
        }
    }

    #[test]
    fn pending_tool_use_prefers_buffered_json() {
        let pending = super::PendingToolUse {
            id: "call_1".to_string(),
            name: "echo".to_string(),
            start_input: json!({}),
            json_buffer: r#"{"text":"hi"}"#.to_string(),
        };

        assert_eq!(pending.final_input(), json!({"text":"hi"}));
    }
}
