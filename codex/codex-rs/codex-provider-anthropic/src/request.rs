use codex_api::Prompt as ApiPrompt;
use codex_protocol::models::ContentItem;
use codex_protocol::models::ResponseItem;
use serde::Deserialize;
use serde::Serialize;
use serde_json::Value;
use std::collections::HashMap;
use thiserror::Error;

use crate::StreamParams;

const CLAUDE_CODE_SYSTEM_MESSAGE: &str =
    "You are Claude Code, Anthropic's official CLI for Claude.";

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum CacheControlType {
    Ephemeral,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CacheControl {
    #[serde(rename = "type")]
    pub kind: CacheControlType,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub ttl: Option<String>,
}

#[derive(Debug, Serialize)]
#[serde(tag = "type", rename_all = "snake_case")]
pub enum SystemContentBlock {
    Text {
        text: String,
        #[serde(skip_serializing_if = "Option::is_none")]
        cache_control: Option<CacheControl>,
    },
}

#[derive(Debug, Serialize)]
#[serde(untagged)]
pub enum SystemPrompt {
    String(String),
    Blocks(Vec<SystemContentBlock>),
}

#[derive(Debug, Serialize)]
pub struct MessagesRequest {
    pub model: String,
    pub max_tokens: u32,
    pub stream: bool,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub thinking: Option<Thinking>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub system: Option<SystemPrompt>,
    pub messages: Vec<ChatMessage>,
    #[serde(default, skip_serializing_if = "Vec::is_empty")]
    pub tools: Vec<ToolDefinition>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Thinking {
    #[serde(rename = "type")]
    pub kind: ThinkingType,
    pub budget_tokens: u32,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum ThinkingType {
    Enabled,
}

#[derive(Debug, Serialize)]
pub struct ChatMessage {
    pub role: String,
    pub content: Vec<ContentBlock>,
}

#[derive(Debug, Serialize)]
pub struct ToolDefinition {
    pub name: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub description: Option<String>,
    pub input_schema: Value,
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
        #[serde(skip_serializing_if = "Option::is_none")]
        cache_control: Option<CacheControl>,
    },
    Thinking {
        #[serde(default, skip_serializing_if = "Option::is_none")]
        thinking: Option<String>,
        #[serde(default, skip_serializing_if = "Option::is_none")]
        signature: Option<String>,
        #[serde(skip_serializing_if = "Option::is_none")]
        cache_control: Option<CacheControl>,
    },
    Image {
        source: ImageSource,
        #[serde(skip_serializing_if = "Option::is_none")]
        cache_control: Option<CacheControl>,
    },
    ToolUse {
        id: String,
        name: String,
        input: Value,
        #[serde(skip_serializing_if = "Option::is_none")]
        cache_control: Option<CacheControl>,
    },
    ToolResult {
        tool_use_id: String,
        content: String,
        #[serde(skip_serializing_if = "Option::is_none")]
        is_error: Option<bool>,
        #[serde(skip_serializing_if = "Option::is_none")]
        cache_control: Option<CacheControl>,
    },
    #[serde(other)]
    Unknown,
}

pub fn build_request(params: &StreamParams) -> MessagesRequest {
    let caching = PromptCachingConfig::from_params(params);
    build_request_with_caching(params, &caching)
}

#[derive(Debug, Clone)]
struct PromptCachingConfig {
    enabled: bool,
    ttl: Option<String>,
    last_n_messages: usize,
}

impl PromptCachingConfig {
    fn from_params(params: &StreamParams) -> Self {
        let mut enabled = true;
        let mut ttl = std::env::var("CODEX_ANTHROPIC_PROMPT_CACHE_TTL")
            .ok()
            .map(|v| v.trim().to_string())
            .filter(|v| !v.is_empty() && v != "0" && v.eq_ignore_ascii_case("1h"));
        let mut last_n_messages = 2;

        // Global opt-out: allow disabling caching without code changes.
        if env_falsey("CODEX_ANTHROPIC_PROMPT_CACHING") {
            enabled = false;
        }

        // Caller overrides (for consumers using AnthropicClient directly).
        if let Some(overrides) = &params.prompt_caching {
            enabled = overrides.enabled;
            ttl = overrides
                .ttl
                .clone()
                .filter(|v| v.eq_ignore_ascii_case("1h"));
            last_n_messages = overrides.last_n_messages;
        }

        Self {
            enabled,
            ttl,
            last_n_messages,
        }
    }

    fn cache_control(&self) -> CacheControl {
        CacheControl {
            kind: CacheControlType::Ephemeral,
            ttl: self.ttl.clone(),
        }
    }
}

fn env_falsey(key: &str) -> bool {
    match std::env::var(key) {
        Ok(val) => {
            let v = val.trim();
            v.is_empty() || v == "0" || v.eq_ignore_ascii_case("false")
        }
        Err(_) => false,
    }
}

fn build_request_with_caching(
    params: &StreamParams,
    caching: &PromptCachingConfig,
) -> MessagesRequest {
    let system_parts = fold_system_messages(&params.prompt);
    let cache_control = caching.cache_control();

    let mut messages = build_messages(&params.prompt);
    if caching.enabled {
        apply_cache_breakpoints(&mut messages, &cache_control, caching.last_n_messages);
    }
    let tools = translate_tools(&params.prompt.tools);

    MessagesRequest {
        model: params.model.clone(),
        max_tokens: params.max_tokens,
        stream: true,
        thinking: params.thinking.as_ref().and_then(|t| {
            t.enabled.then_some(Thinking {
                kind: ThinkingType::Enabled,
                budget_tokens: t.budget_tokens,
            })
        }),
        system: if system_parts.is_empty() {
            None
        } else if caching.enabled {
            Some(SystemPrompt::Blocks(
                system_parts
                    .into_iter()
                    .map(|text| SystemContentBlock::Text {
                        text,
                        cache_control: Some(cache_control.clone()),
                    })
                    .collect(),
            ))
        } else {
            Some(SystemPrompt::String(system_parts.join("\n\n")))
        },
        messages,
        tools,
    }
}

fn apply_cache_breakpoints(
    messages: &mut [ChatMessage],
    cache_control: &CacheControl,
    last_n: usize,
) {
    if last_n == 0 || messages.is_empty() {
        return;
    }

    let start = messages.len().saturating_sub(last_n);
    for msg in &mut messages[start..] {
        let Some(block) = msg
            .content
            .iter_mut()
            .rev()
            .find(|b| b.can_set_cache_control())
        else {
            continue;
        };
        block.set_cache_control(cache_control.clone());
    }
}

impl ContentBlock {
    fn can_set_cache_control(&self) -> bool {
        !matches!(self, ContentBlock::Unknown)
    }

    fn set_cache_control(&mut self, cache_control: CacheControl) {
        match self {
            ContentBlock::Text {
                cache_control: cc, ..
            } => *cc = Some(cache_control),
            ContentBlock::Thinking {
                cache_control: cc, ..
            } => *cc = Some(cache_control),
            ContentBlock::Image {
                cache_control: cc, ..
            } => *cc = Some(cache_control),
            ContentBlock::ToolUse {
                cache_control: cc, ..
            } => *cc = Some(cache_control),
            ContentBlock::ToolResult {
                cache_control: cc, ..
            } => *cc = Some(cache_control),
            ContentBlock::Unknown => {}
        }
    }
}

fn build_messages(prompt: &ApiPrompt) -> Vec<ChatMessage> {
    let mut messages = Vec::new();
    let mut pending_assistant: Option<ChatMessage> = None;

    // Pre-scan outputs so tool_result blocks can always be emitted immediately after the
    // assistant message that contains the corresponding tool_use blocks, even if the
    // tool outputs arrive later (or earlier) in Codex history.
    let mut tool_results_by_id: HashMap<String, Vec<ContentBlock>> = HashMap::new();
    for item in &prompt.input {
        match item {
            ResponseItem::FunctionCallOutput { call_id, output } => {
                tool_results_by_id.entry(call_id.clone()).or_default().push(
                    ContentBlock::ToolResult {
                        tool_use_id: call_id.clone(),
                        content: output.content.clone(),
                        is_error: None,
                        cache_control: None,
                    },
                );
            }
            ResponseItem::CustomToolCallOutput { call_id, output } => {
                tool_results_by_id.entry(call_id.clone()).or_default().push(
                    ContentBlock::ToolResult {
                        tool_use_id: call_id.clone(),
                        content: output.clone(),
                        is_error: None,
                        cache_control: None,
                    },
                );
            }
            _ => {}
        }
    }

    let flush_assistant =
        |messages: &mut Vec<ChatMessage>,
         pending_assistant: &mut Option<ChatMessage>,
         tool_results_by_id: &mut HashMap<String, Vec<ContentBlock>>| {
            let Some(msg) = pending_assistant.take() else {
                return;
            };
            if msg.content.is_empty() {
                return;
            }

            // Anthropic expects tool_use blocks to be followed by tool_result blocks in the
            // next message. Keep tool_use blocks at the end of the assistant message so we never
            // accidentally claim the assistant continued after issuing a tool call.
            let mut non_tool_use: Vec<ContentBlock> = Vec::new();
            let mut tool_use_blocks: Vec<ContentBlock> = Vec::new();
            for block in msg.content {
                match block {
                    ContentBlock::ToolUse { .. } => tool_use_blocks.push(block),
                    other => non_tool_use.push(other),
                }
            }
            non_tool_use.extend(tool_use_blocks);
            let msg = ChatMessage {
                role: msg.role,
                content: non_tool_use,
            };

            let tool_use_ids: Vec<String> = msg
                .content
                .iter()
                .filter_map(|block| match block {
                    ContentBlock::ToolUse { id, .. } => Some(id.clone()),
                    _ => None,
                })
                .collect();

            messages.push(msg);

            if tool_use_ids.is_empty() {
                return;
            }

            let mut results: Vec<ContentBlock> = Vec::new();
            for tool_use_id in tool_use_ids {
                match tool_results_by_id.remove(&tool_use_id) {
                    Some(mut blocks) => results.append(&mut blocks),
                    None => {
                        results.push(ContentBlock::ToolResult {
                            tool_use_id,
                            content: "aborted".to_string(),
                            is_error: None,
                            cache_control: None,
                        });
                    }
                }
            }

            if !results.is_empty() {
                messages.push(ChatMessage {
                    role: "user".to_string(),
                    content: results,
                });
            }
        };

    for item in &prompt.input {
        match item {
            ResponseItem::Message { role, content, .. } => match role.as_str() {
                "developer" | "system" => {}
                "user" => {
                    flush_assistant(
                        &mut messages,
                        &mut pending_assistant,
                        &mut tool_results_by_id,
                    );

                    let msg = match build_chat_message(role, content) {
                        Some(msg) => msg,
                        None => continue,
                    };
                    messages.push(msg);
                }
                "assistant" => {
                    let blocks = build_content_blocks(content);
                    if blocks.is_empty() {
                        continue;
                    }
                    if let Some(existing) = pending_assistant.as_mut() {
                        existing.content.extend(blocks);
                    } else {
                        pending_assistant = Some(ChatMessage {
                            role: "assistant".to_string(),
                            content: blocks,
                        });
                    }
                }
                _ => {
                    flush_assistant(
                        &mut messages,
                        &mut pending_assistant,
                        &mut tool_results_by_id,
                    );
                    if let Some(msg) = build_chat_message(role, content) {
                        messages.push(msg);
                    }
                }
            },
            ResponseItem::FunctionCall {
                name,
                arguments,
                call_id,
                ..
            } => {
                let assistant = pending_assistant.get_or_insert_with(|| ChatMessage {
                    role: "assistant".to_string(),
                    content: Vec::new(),
                });
                assistant.content.push(ContentBlock::ToolUse {
                    id: call_id.clone(),
                    name: name.clone(),
                    input: parse_json_or_wrap(arguments),
                    cache_control: None,
                });
            }
            ResponseItem::CustomToolCall {
                name,
                input,
                call_id,
                ..
            } => {
                let assistant = pending_assistant.get_or_insert_with(|| ChatMessage {
                    role: "assistant".to_string(),
                    content: Vec::new(),
                });
                assistant.content.push(ContentBlock::ToolUse {
                    id: call_id.clone(),
                    name: name.clone(),
                    input: parse_json_or_wrap(input),
                    cache_control: None,
                });
            }
            ResponseItem::FunctionCallOutput { .. } | ResponseItem::CustomToolCallOutput { .. } => {
                // Tool outputs delimit Anthropic turns: tool_result blocks must be the next message
                // after the assistant message that contained the tool_use blocks.
                flush_assistant(
                    &mut messages,
                    &mut pending_assistant,
                    &mut tool_results_by_id,
                );
            }
            _ => {}
        }
    }

    flush_assistant(
        &mut messages,
        &mut pending_assistant,
        &mut tool_results_by_id,
    );
    messages
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
                cache_control: None,
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
                        cache_control: None,
                    }),
                    Err(_) => blocks.push(ContentBlock::Text {
                        text: format!("image_url: {image_url}"),
                        cache_control: None,
                    }),
                }
            }
        }
    }

    flush_text(&mut blocks, &mut text_buf);
    blocks
}

fn parse_json_or_wrap(input: &str) -> Value {
    serde_json::from_str::<Value>(input).unwrap_or_else(|_| serde_json::json!({ "raw": input }))
}

fn translate_tools(tools: &[Value]) -> Vec<ToolDefinition> {
    tools
        .iter()
        .filter_map(|tool| translate_tool(tool))
        .collect()
}

fn translate_tool(tool: &Value) -> Option<ToolDefinition> {
    if tool.get("type").and_then(|v| v.as_str())? != "function" {
        return None;
    }

    let (name, description, input_schema) = if let Some(function) = tool.get("function") {
        (
            function.get("name").and_then(|v| v.as_str()),
            function.get("description").and_then(|v| v.as_str()),
            function
                .get("parameters")
                .or_else(|| function.get("input_schema"))
                .cloned(),
        )
    } else {
        (
            tool.get("name").and_then(|v| v.as_str()),
            tool.get("description").and_then(|v| v.as_str()),
            tool.get("parameters")
                .or_else(|| tool.get("input_schema"))
                .cloned(),
        )
    };

    Some(ToolDefinition {
        name: name?.to_string(),
        description: description
            .map(|s| s.to_string())
            .filter(|s| !s.trim().is_empty()),
        input_schema: input_schema.unwrap_or(Value::Object(serde_json::Map::new())),
    })
}

fn fold_system_messages(prompt: &ApiPrompt) -> Vec<String> {
    let mut parts = vec![CLAUDE_CODE_SYSTEM_MESSAGE.to_string()];

    let instructions = prompt.instructions.trim();
    if !instructions.is_empty() && instructions != CLAUDE_CODE_SYSTEM_MESSAGE {
        parts.push(instructions.to_string());
    }
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
}

#[cfg(test)]
mod tests {
    use super::build_chat_message;
    use super::build_messages;
    use super::build_request;
    use super::parse_image_data_url;
    use super::translate_tools;
    use crate::StreamParams;
    use crate::stream::PromptCachingParams;
    use codex_api::Prompt as ApiPrompt;
    use codex_protocol::models::ContentItem;
    use codex_protocol::models::FunctionCallOutputPayload;
    use codex_protocol::models::ResponseItem;
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

    #[test]
    fn translates_function_tools_to_anthropic_tools() {
        let tools = vec![
            json!({
                "type": "function",
                "name": "echo",
                "description": "echo input",
                "parameters": { "type": "object", "properties": { "text": { "type": "string" } } }
            }),
            json!({
                "type": "web_search",
                "name": "ignored",
            }),
        ];

        let translated = translate_tools(&tools);
        assert_eq!(translated.len(), 1);
        let value = to_value(&translated[0]).expect("json");
        assert_eq!(
            value,
            json!({
              "name": "echo",
              "description": "echo input",
              "input_schema": { "type": "object", "properties": { "text": { "type": "string" } } }
            })
        );
    }

    #[test]
    fn prompt_caching_marks_system_and_last_two_messages() {
        let prompt = ApiPrompt {
            instructions: "sys".to_string(),
            input: vec![
                ResponseItem::Message {
                    id: None,
                    role: "user".to_string(),
                    content: vec![ContentItem::InputText {
                        text: "hi".to_string(),
                    }],
                },
                ResponseItem::Message {
                    id: None,
                    role: "assistant".to_string(),
                    content: vec![ContentItem::OutputText {
                        text: "calling".to_string(),
                    }],
                },
                ResponseItem::FunctionCall {
                    id: None,
                    name: "echo".to_string(),
                    arguments: r#"{"text":"x"}"#.to_string(),
                    call_id: "call_1".to_string(),
                },
                ResponseItem::FunctionCallOutput {
                    call_id: "call_1".to_string(),
                    output: FunctionCallOutputPayload {
                        content: "ok".to_string(),
                        content_items: None,
                        success: Some(true),
                    },
                },
            ],
            tools: vec![],
            parallel_tool_calls: false,
            output_schema: None,
        };

        let params = StreamParams {
            model: "claude-test".to_string(),
            prompt,
            max_tokens: 10,
            thinking: None,
            prompt_caching: Some(PromptCachingParams {
                enabled: true,
                ttl: Some("1h".to_string()),
                last_n_messages: 2,
            }),
        };

        let req = build_request(&params);
        let value = to_value(&req).expect("json");

        let system = value.get("system").expect("system");
        assert!(
            system.is_array(),
            "system should be blocks when caching enabled"
        );
        let system_blocks = system.as_array().unwrap();
        assert!(
            system_blocks.len() >= 2,
            "expected at least two system blocks"
        );

        let system0 = system_blocks[0].as_object().unwrap();
        assert_eq!(system0.get("type").and_then(|v| v.as_str()), Some("text"));
        assert_eq!(
            system0.get("text").and_then(|v| v.as_str()),
            Some(super::CLAUDE_CODE_SYSTEM_MESSAGE)
        );
        let system1 = system_blocks[1].as_object().unwrap();
        assert_eq!(system1.get("type").and_then(|v| v.as_str()), Some("text"));
        assert_eq!(system1.get("text").and_then(|v| v.as_str()), Some("sys"));
        assert_eq!(
            system0
                .get("cache_control")
                .and_then(|v| v.get("type"))
                .and_then(|v| v.as_str()),
            Some("ephemeral")
        );
        assert_eq!(
            system0
                .get("cache_control")
                .and_then(|v| v.get("ttl"))
                .and_then(|v| v.as_str()),
            Some("1h")
        );

        let system1 = system_blocks[1].as_object().unwrap();
        assert_eq!(
            system1
                .get("cache_control")
                .and_then(|v| v.get("type"))
                .and_then(|v| v.as_str()),
            Some("ephemeral")
        );
        assert_eq!(
            system1
                .get("cache_control")
                .and_then(|v| v.get("ttl"))
                .and_then(|v| v.as_str()),
            Some("1h")
        );

        let messages = value.get("messages").unwrap().as_array().unwrap();
        assert_eq!(messages.len(), 3);

        let first_blocks = messages[0].get("content").unwrap().as_array().unwrap();
        assert!(first_blocks[0].get("cache_control").is_none());

        let assistant_blocks = messages[1].get("content").unwrap().as_array().unwrap();
        let assistant_last = assistant_blocks.last().unwrap().as_object().unwrap();
        assert_eq!(
            assistant_last.get("type").and_then(|v| v.as_str()),
            Some("tool_use")
        );
        assert_eq!(
            assistant_last
                .get("cache_control")
                .and_then(|v| v.get("type"))
                .and_then(|v| v.as_str()),
            Some("ephemeral")
        );

        let result_blocks = messages[2].get("content").unwrap().as_array().unwrap();
        let result_last = result_blocks.last().unwrap().as_object().unwrap();
        assert_eq!(
            result_last.get("type").and_then(|v| v.as_str()),
            Some("tool_result")
        );
        assert_eq!(
            result_last
                .get("cache_control")
                .and_then(|v| v.get("type"))
                .and_then(|v| v.as_str()),
            Some("ephemeral")
        );
    }

    #[test]
    fn request_compilation_emits_tool_use_and_tool_result_blocks() {
        let prompt = codex_api::Prompt {
            instructions: String::new(),
            input: vec![
                ResponseItem::Message {
                    id: None,
                    role: "user".to_string(),
                    content: vec![ContentItem::InputText {
                        text: "hi".to_string(),
                    }],
                },
                ResponseItem::FunctionCall {
                    id: None,
                    name: "echo".to_string(),
                    arguments: "{\"text\":\"hello\"}".to_string(),
                    call_id: "call_1".to_string(),
                },
                ResponseItem::FunctionCallOutput {
                    call_id: "call_1".to_string(),
                    output: FunctionCallOutputPayload {
                        content: "ok".to_string(),
                        content_items: None,
                        success: Some(true),
                    },
                },
            ],
            tools: vec![],
            parallel_tool_calls: false,
            output_schema: None,
        };

        let messages = build_messages(&prompt);
        let value = to_value(&messages).expect("json");
        assert_eq!(
            value,
            json!([
              {"role":"user","content":[{"type":"text","text":"hi"}]},
              {"role":"assistant","content":[{"type":"tool_use","id":"call_1","name":"echo","input":{"text":"hello"}}]},
              {"role":"user","content":[{"type":"tool_result","tool_use_id":"call_1","content":"ok"}]}
            ])
        );
    }

    #[test]
    fn tool_results_are_immediately_after_tool_use_message() {
        let prompt = codex_api::Prompt {
            instructions: String::new(),
            input: vec![
                ResponseItem::Message {
                    id: None,
                    role: "user".to_string(),
                    content: vec![ContentItem::InputText {
                        text: "hi".to_string(),
                    }],
                },
                // Tool call may land in history before the final assistant message item.
                ResponseItem::FunctionCall {
                    id: None,
                    name: "echo".to_string(),
                    arguments: "{\"text\":\"hello\"}".to_string(),
                    call_id: "call_1".to_string(),
                },
                ResponseItem::Message {
                    id: None,
                    role: "assistant".to_string(),
                    content: vec![ContentItem::OutputText {
                        text: "working...".to_string(),
                    }],
                },
                ResponseItem::FunctionCallOutput {
                    call_id: "call_1".to_string(),
                    output: FunctionCallOutputPayload {
                        content: "ok".to_string(),
                        content_items: None,
                        success: Some(true),
                    },
                },
            ],
            tools: vec![],
            parallel_tool_calls: false,
            output_schema: None,
        };

        let messages = build_messages(&prompt);
        let value = to_value(&messages).expect("json");
        assert_eq!(
            value,
            json!([
              {"role":"user","content":[{"type":"text","text":"hi"}]},
              {"role":"assistant","content":[
                {"type":"text","text":"working..."},
                {"type":"tool_use","id":"call_1","name":"echo","input":{"text":"hello"}}
              ]},
              {"role":"user","content":[{"type":"tool_result","tool_use_id":"call_1","content":"ok"}]}
            ])
        );
    }

    #[test]
    fn tool_outputs_can_appear_out_of_order_in_history() {
        let prompt = codex_api::Prompt {
            instructions: String::new(),
            input: vec![
                ResponseItem::Message {
                    id: None,
                    role: "user".to_string(),
                    content: vec![ContentItem::InputText {
                        text: "hi".to_string(),
                    }],
                },
                // Output arrives before the call in history (can happen when history is reconstructed
                // or when upstream items are reordered). Anthropic still requires tool_result to be
                // the next message after tool_use.
                ResponseItem::FunctionCallOutput {
                    call_id: "call_1".to_string(),
                    output: FunctionCallOutputPayload {
                        content: "ok".to_string(),
                        content_items: None,
                        success: Some(true),
                    },
                },
                ResponseItem::FunctionCall {
                    id: None,
                    name: "echo".to_string(),
                    arguments: "{\"text\":\"hello\"}".to_string(),
                    call_id: "call_1".to_string(),
                },
                ResponseItem::Message {
                    id: None,
                    role: "assistant".to_string(),
                    content: vec![ContentItem::OutputText {
                        text: "working...".to_string(),
                    }],
                },
            ],
            tools: vec![],
            parallel_tool_calls: false,
            output_schema: None,
        };

        let messages = build_messages(&prompt);
        let value = to_value(&messages).expect("json");
        assert_eq!(
            value,
            json!([
              {"role":"user","content":[{"type":"text","text":"hi"}]},
              {"role":"assistant","content":[
                {"type":"text","text":"working..."},
                {"type":"tool_use","id":"call_1","name":"echo","input":{"text":"hello"}}
              ]},
              {"role":"user","content":[{"type":"tool_result","tool_use_id":"call_1","content":"ok"}]}
            ])
        );
    }

    #[test]
    fn tool_results_are_grouped_for_all_tool_use_ids_in_message() {
        let prompt = codex_api::Prompt {
            instructions: String::new(),
            input: vec![
                ResponseItem::Message {
                    id: None,
                    role: "user".to_string(),
                    content: vec![ContentItem::InputText {
                        text: "hi".to_string(),
                    }],
                },
                ResponseItem::FunctionCall {
                    id: None,
                    name: "echo".to_string(),
                    arguments: "{\"text\":\"a\"}".to_string(),
                    call_id: "call_a".to_string(),
                },
                ResponseItem::FunctionCall {
                    id: None,
                    name: "echo".to_string(),
                    arguments: "{\"text\":\"b\"}".to_string(),
                    call_id: "call_b".to_string(),
                },
                ResponseItem::Message {
                    id: None,
                    role: "assistant".to_string(),
                    content: vec![ContentItem::OutputText {
                        text: "working...".to_string(),
                    }],
                },
                // Only one output arrives before another assistant message.
                ResponseItem::FunctionCallOutput {
                    call_id: "call_a".to_string(),
                    output: FunctionCallOutputPayload {
                        content: "ok a".to_string(),
                        content_items: None,
                        success: Some(true),
                    },
                },
                ResponseItem::Message {
                    id: None,
                    role: "assistant".to_string(),
                    content: vec![ContentItem::OutputText {
                        text: "still working...".to_string(),
                    }],
                },
                ResponseItem::FunctionCallOutput {
                    call_id: "call_b".to_string(),
                    output: FunctionCallOutputPayload {
                        content: "ok b".to_string(),
                        content_items: None,
                        success: Some(true),
                    },
                },
            ],
            tools: vec![],
            parallel_tool_calls: false,
            output_schema: None,
        };

        let messages = build_messages(&prompt);
        let value = to_value(&messages).expect("json");
        assert_eq!(
            value,
            json!([
              {"role":"user","content":[{"type":"text","text":"hi"}]},
              {"role":"assistant","content":[
                {"type":"text","text":"working..."},
                {"type":"tool_use","id":"call_a","name":"echo","input":{"text":"a"}},
                {"type":"tool_use","id":"call_b","name":"echo","input":{"text":"b"}}
              ]},
              {"role":"user","content":[
                {"type":"tool_result","tool_use_id":"call_a","content":"ok a"},
                {"type":"tool_result","tool_use_id":"call_b","content":"ok b"}
              ]},
              {"role":"assistant","content":[{"type":"text","text":"still working..."}]}
            ])
        );
    }
}
