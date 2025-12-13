use codex_api::Prompt as ApiPrompt;
use codex_protocol::models::ContentItem;
use codex_protocol::models::ResponseItem;
use serde::Deserialize;
use serde::Serialize;
use thiserror::Error;

use crate::StreamParams;

#[derive(Debug, Serialize)]
pub struct MessagesRequest {
    pub model: String,
    pub max_tokens: u32,
    pub stream: bool,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub system: Option<String>,
    pub messages: Vec<ChatMessage>,
}

#[derive(Debug, Serialize)]
pub struct ChatMessage {
    pub role: String,
    pub content: Vec<ContentBlock>,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct ImageSource {
    #[serde(rename = "type")]
    pub kind: String,
    pub media_type: String,
    pub data: String,
}

#[derive(Debug, Serialize, Deserialize)]
#[serde(tag = "type", rename_all = "snake_case")]
pub enum ContentBlock {
    Text {
        text: String,
    },
    Image {
        source: ImageSource,
    },
    #[serde(other)]
    Unknown,
}

pub fn build_request(params: &StreamParams) -> MessagesRequest {
    let system = fold_system_messages(&params.prompt);
    let messages = build_messages(&params.prompt);

    MessagesRequest {
        model: params.model.clone(),
        max_tokens: params.max_tokens,
        stream: true,
        system: if system.is_empty() {
            None
        } else {
            Some(system)
        },
        messages,
    }
}

fn build_messages(prompt: &ApiPrompt) -> Vec<ChatMessage> {
    prompt
        .input
        .iter()
        .filter_map(|item| match item {
            ResponseItem::Message { role, content, .. } => match role.as_str() {
                // developer/system are folded into the system prompt instead.
                "developer" | "system" => None,
                _ => build_chat_message(role, content),
            },
            _ => None,
        })
        .collect()
}

fn build_chat_message(role: &str, content: &[ContentItem]) -> Option<ChatMessage> {
    let blocks = build_content_blocks(content);
    if blocks.is_empty() {
        return None;
    }
    Some(ChatMessage {
        role: role.to_string(),
        content: blocks,
    })
}

fn extract_text(content: &[ContentItem]) -> Option<String> {
    let segments: Vec<String> = content
        .iter()
        .filter_map(|item| match item {
            ContentItem::InputText { text } | ContentItem::OutputText { text } => {
                Some(text.clone())
            }
            _ => None,
        })
        .collect();

    if segments.is_empty() {
        None
    } else {
        Some(segments.join("\n"))
    }
}

#[derive(Debug, Clone, PartialEq, Eq)]
struct ParsedImageDataUrl {
    mime: String,
    data_base64: String,
}

#[derive(Debug, Error)]
enum DataUrlError {
    #[error("not a data URL")]
    NotDataUrl,
    #[error("invalid data URL")]
    InvalidDataUrl,
    #[error("not base64 data URL")]
    NotBase64,
    #[error("unsupported image mime type: {0}")]
    UnsupportedMime(String),
}

fn parse_image_data_url(url: &str) -> Result<ParsedImageDataUrl, DataUrlError> {
    let rest = url.strip_prefix("data:").ok_or(DataUrlError::NotDataUrl)?;
    let (mime_and_opts, data) = rest.split_once(',').ok_or(DataUrlError::InvalidDataUrl)?;
    let (mime, opts) = mime_and_opts.split_once(';').unwrap_or((mime_and_opts, ""));

    let mime = mime.trim();
    if mime.is_empty() {
        return Err(DataUrlError::InvalidDataUrl);
    }

    let opts_lower = opts.to_ascii_lowercase();
    if !opts_lower.split(';').any(|opt| opt.trim() == "base64") {
        return Err(DataUrlError::NotBase64);
    }

    if !matches!(
        mime,
        "image/jpeg" | "image/png" | "image/gif" | "image/webp"
    ) {
        return Err(DataUrlError::UnsupportedMime(mime.to_string()));
    }

    let data_base64 = data.trim();
    if data_base64.is_empty() {
        return Err(DataUrlError::InvalidDataUrl);
    }

    Ok(ParsedImageDataUrl {
        mime: mime.to_string(),
        data_base64: data_base64.to_string(),
    })
}

fn build_content_blocks(content: &[ContentItem]) -> Vec<ContentBlock> {
    let mut blocks = Vec::new();
    let mut text_buf = String::new();

    let flush_text = |blocks: &mut Vec<ContentBlock>, text_buf: &mut String| {
        if text_buf.chars().any(|c| !c.is_whitespace()) {
            blocks.push(ContentBlock::Text {
                text: text_buf.clone(),
            });
        }
        text_buf.clear();
    };

    for item in content {
        match item {
            ContentItem::InputText { text } | ContentItem::OutputText { text } => {
                if !text_buf.is_empty() {
                    text_buf.push('\n');
                }
                text_buf.push_str(text);
            }
            ContentItem::InputImage { image_url } => {
                flush_text(&mut blocks, &mut text_buf);

                match parse_image_data_url(image_url) {
                    Ok(parsed) => blocks.push(ContentBlock::Image {
                        source: ImageSource {
                            kind: "base64".to_string(),
                            media_type: parsed.mime,
                            data: parsed.data_base64,
                        },
                    }),
                    Err(_) => blocks.push(ContentBlock::Text {
                        text: format!("image_url: {image_url}"),
                    }),
                }
            }
        }
    }

    flush_text(&mut blocks, &mut text_buf);
    blocks
}

fn fold_system_messages(prompt: &ApiPrompt) -> String {
    let mut parts = vec![prompt.instructions.trim().to_string()];
    for item in &prompt.input {
        if let ResponseItem::Message { role, content, .. } = item
            && matches!(role.as_str(), "developer" | "system")
        {
            if let Some(text) = extract_text(content) {
                parts.push(text);
            }
        }
    }

    parts
        .into_iter()
        .filter(|s| !s.trim().is_empty())
        .collect::<Vec<_>>()
        .join("\n\n")
}

#[cfg(test)]
mod tests {
    use super::build_chat_message;
    use super::parse_image_data_url;
    use codex_protocol::models::ContentItem;
    use serde_json::json;
    use serde_json::to_value;

    #[test]
    fn parses_supported_image_data_url() {
        let parsed = parse_image_data_url("data:image/png;base64,AAA").expect("parse");
        assert_eq!(parsed.mime, "image/png");
        assert_eq!(parsed.data_base64, "AAA");
    }

    #[test]
    fn rejects_unsupported_image_mime() {
        assert!(parse_image_data_url("data:image/bmp;base64,AAA").is_err());
    }

    #[test]
    fn request_compilation_emits_image_block_for_data_url() {
        let msg = build_chat_message(
            "user",
            &[
                ContentItem::InputText {
                    text: "hello".to_string(),
                },
                ContentItem::InputImage {
                    image_url: "data:image/png;base64,AAA".to_string(),
                },
            ],
        )
        .expect("message");

        let value = to_value(&msg).expect("json");
        assert_eq!(
            value,
            json!({
              "role": "user",
              "content": [
                {"type":"text","text":"hello"},
                {"type":"image","source":{"type":"base64","media_type":"image/png","data":"AAA"}}
              ]
            })
        );
    }

    #[test]
    fn unsupported_or_non_data_url_degrades_to_text() {
        let msg = build_chat_message(
            "user",
            &[ContentItem::InputImage {
                image_url: "https://example.com/cat.png".to_string(),
            }],
        )
        .expect("message");

        let value = to_value(&msg).expect("json");
        assert_eq!(
            value,
            json!({
              "role": "user",
              "content": [
                {"type":"text","text":"image_url: https://example.com/cat.png"}
              ]
            })
        );
    }
}
