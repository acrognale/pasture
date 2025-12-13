use codex_api::Prompt as ApiPrompt;
use codex_protocol::models::ContentItem;
use codex_protocol::models::ResponseItem;
use serde::Deserialize;
use serde::Serialize;

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
#[serde(tag = "type", rename_all = "snake_case")]
pub enum ContentBlock {
    Text {
        text: String,
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
    let text = extract_text(content)?;
    Some(ChatMessage {
        role: role.to_string(),
        content: vec![ContentBlock::Text { text }],
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
