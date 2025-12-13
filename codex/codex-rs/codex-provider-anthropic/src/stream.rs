use async_stream::try_stream;
use codex_api::common::ResponseEvent;
use codex_protocol::models::ContentItem;
use codex_protocol::models::ResponseItem;
use eventsource_stream::Event;
use futures::Stream;
use futures::StreamExt;
use serde::Deserialize;

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
        let mut accumulated = String::new();
        let mut completed = false;

        // Keep parity with other providers: emit a Created marker when the SSE stream opens.
        yield ResponseEvent::Created;

        while let Some(event) = event_stream.next().await {
            let event = event?;
            match parse_event(event)? {
                ParsedEvent::MessageStart { id } => {
                    response_id = Some(id);
                }
                ParsedEvent::ContentBlockStart { is_text } => {
                    if is_text && !assistant_started {
                        assistant_started = true;
                        yield ResponseEvent::OutputItemAdded(ResponseItem::Message {
                            id: None,
                            role: "assistant".to_string(),
                            content: vec![ContentItem::OutputText { text: String::new() }],
                        });
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
                ParsedEvent::MessageStop => {
                    completed = true;
                    let final_text = accumulated.clone();
                    yield ResponseEvent::OutputItemDone(ResponseItem::Message {
                        id: None,
                        role: "assistant".to_string(),
                        content: vec![ContentItem::OutputText { text: final_text }],
                    });

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
    MessageStart { id: String },
    ContentBlockStart { is_text: bool },
    TextDelta { delta: String },
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

    if event_name == "ping" {
        return Ok(ParsedEvent::Ping);
    }

    if event.data.trim().is_empty() {
        return Ok(ParsedEvent::Ignore);
    }

    let parsed: WireEvent = serde_json::from_str(&event.data)?;
    match parsed {
        WireEvent::MessageStart { message } => Ok(ParsedEvent::MessageStart { id: message.id }),
        WireEvent::ContentBlockStart { content_block, .. } => Ok(ParsedEvent::ContentBlockStart {
            is_text: matches!(content_block, ContentBlock::Text { .. }),
        }),
        WireEvent::ContentBlockDelta { delta, .. } => match delta {
            ContentBlockDeltaPayload::TextDelta { text } => {
                Ok(ParsedEvent::TextDelta { delta: text })
            }
            ContentBlockDeltaPayload::Unknown => Ok(ParsedEvent::Ignore),
        },
        WireEvent::MessageStop { .. } => Ok(ParsedEvent::MessageStop),
        WireEvent::Ping => Ok(ParsedEvent::Ping),
        WireEvent::Error { error } => Ok(ParsedEvent::Error(
            error.message.unwrap_or_else(|| "unknown error".to_string()),
        )),
        WireEvent::Unknown => Ok(ParsedEvent::Ignore),
        WireEvent::MessageDelta { .. } | WireEvent::ContentBlockStop { .. } => {
            Ok(ParsedEvent::Ignore)
        }
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
        #[serde(rename = "index")]
        _index: u32,
        content_block: ContentBlock,
    },
    ContentBlockDelta {
        #[serde(rename = "index")]
        _index: u32,
        delta: ContentBlockDeltaPayload,
    },
    ContentBlockStop {
        #[serde(rename = "index")]
        _index: u32,
    },
    Ping,
    Error {
        error: WireError,
    },
    #[serde(other)]
    Unknown,
}
