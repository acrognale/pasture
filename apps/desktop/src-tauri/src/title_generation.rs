use codex_core::Prompt;
use codex_core::ResponseItem;
use codex_protocol::models::ContentItem;
use serde_json::json;

const MAX_TITLE_LENGTH: usize = 80;
const MAX_INPUT_LENGTH: usize = 500;

/// Build a prompt asking the model to generate a concise thread title.
pub(crate) fn build_prompt(user_message: &str) -> Prompt {
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

/// Parse a normalized title from the model's response text.
pub(crate) fn parse_title_from_text(text: &str) -> Option<String> {
    let trimmed = text.trim();

    if let Ok(value) = serde_json::from_str::<serde_json::Value>(trimmed) {
        if let Some(title) = value.get("title").and_then(|t| t.as_str()) {
            return normalize_title(title);
        }
    }

    normalize_title(trimmed)
}

pub(crate) fn normalize_title(raw: &str) -> Option<String> {
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
