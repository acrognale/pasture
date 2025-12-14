use crate::StreamParams;
use crate::stream::PromptCachingParams;
use crate::stream::ThinkingParams;

/// Recommended prompt caching configuration (modeled after Claude Code).
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct PromptCachingPreset {
    pub enabled: bool,
    pub last_n_messages: usize,
}

const MAX_TOKENS: u32 = 64_000;
const THINKING_BUDGET_TOKENS: u32 = 31_999;

impl PromptCachingPreset {
    pub const CLAUDE_CODE_DEFAULT: Self = Self {
        enabled: true,
        last_n_messages: 2,
    };

    pub fn into_params(self) -> PromptCachingParams {
        PromptCachingParams {
            enabled: self.enabled,
            last_n_messages: self.last_n_messages,
        }
    }
}

/// Anthropic model preset with a stable model id and sensible defaults.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct ModelPreset {
    /// Human-friendly preset name (e.g. `"sonnet"`).
    pub name: &'static str,
    /// Anthropic Messages API model id (e.g. `"claude-sonnet-4-20250514"`).
    pub model: &'static str,
    /// Recommended default output limit.
    pub default_max_tokens: u32,
    /// Recommended prompt caching behavior for this preset.
    pub prompt_caching: PromptCachingPreset,
    /// Whether Anthropic thinking should be enabled by default for this preset.
    pub thinking_enabled: bool,
}

impl ModelPreset {
    pub const fn new(
        name: &'static str,
        model: &'static str,
        default_max_tokens: u32,
        prompt_caching: PromptCachingPreset,
        thinking_enabled: bool,
    ) -> Self {
        Self {
            name,
            model,
            default_max_tokens,
            prompt_caching,
            thinking_enabled,
        }
    }

    pub fn stream_params(self, prompt: codex_api::Prompt) -> StreamParams {
        StreamParams {
            model: self.model.to_string(),
            prompt,
            max_tokens: self.default_max_tokens,
            thinking: Some(ThinkingParams {
                enabled: self.thinking_enabled,
                budget_tokens: THINKING_BUDGET_TOKENS,
            }),
            prompt_caching: Some(self.prompt_caching.into_params()),
        }
    }
}

pub const HAIKU: ModelPreset = ModelPreset::new(
    "haiku",
    "claude-haiku-4-5-20251001",
    MAX_TOKENS,
    PromptCachingPreset::CLAUDE_CODE_DEFAULT,
    false,
);

pub const SONNET: ModelPreset = ModelPreset::new(
    "sonnet",
    "claude-sonnet-4-5-20250929",
    MAX_TOKENS,
    PromptCachingPreset::CLAUDE_CODE_DEFAULT,
    true,
);

pub const OPUS: ModelPreset = ModelPreset::new(
    "opus",
    "claude-opus-4-5-20251101",
    MAX_TOKENS,
    PromptCachingPreset::CLAUDE_CODE_DEFAULT,
    true,
);

pub const ALL: [ModelPreset; 3] = [HAIKU, SONNET, OPUS];

pub fn by_name(name: &str) -> Option<ModelPreset> {
    ALL.into_iter()
        .find(|preset| preset.name.eq_ignore_ascii_case(name.trim()))
}

#[cfg(test)]
mod tests {
    use super::HAIKU;
    use super::OPUS;
    use super::SONNET;
    use super::by_name;
    use crate::StreamParams;
    use crate::request::build_request;
    use codex_api::Prompt as ApiPrompt;
    use codex_protocol::models::ContentItem;
    use codex_protocol::models::ResponseItem;

    fn minimal_prompt() -> ApiPrompt {
        ApiPrompt {
            instructions: "sys".to_string(),
            input: vec![ResponseItem::Message {
                id: None,
                role: "user".to_string(),
                content: vec![ContentItem::InputText {
                    text: "hi".to_string(),
                }],
            }],
            tools: vec![],
            parallel_tool_calls: false,
            output_schema: None,
        }
    }

    #[test]
    fn sonnet_preset_builds_expected_model_and_defaults() {
        let params = SONNET.stream_params(minimal_prompt());
        let req = build_request(&params);
        let value = serde_json::to_value(req).expect("json");
        assert_eq!(
            value.get("model").and_then(|v| v.as_str()),
            Some(SONNET.model)
        );
        assert_eq!(
            value.get("max_tokens").and_then(|v| v.as_u64()),
            Some(SONNET.default_max_tokens as u64)
        );
        assert_eq!(
            value
                .get("thinking")
                .and_then(|v| v.get("type"))
                .and_then(|v| v.as_str()),
            Some("enabled")
        );
        assert_eq!(
            value
                .get("thinking")
                .and_then(|v| v.get("budget_tokens"))
                .and_then(|v| v.as_u64()),
            Some(31_999)
        );
    }

    #[test]
    fn opus_preset_builds_expected_model_and_defaults() {
        let params = OPUS.stream_params(minimal_prompt());
        let req = build_request(&params);
        let value = serde_json::to_value(req).expect("json");
        assert_eq!(
            value.get("model").and_then(|v| v.as_str()),
            Some(OPUS.model)
        );
        assert_eq!(
            value.get("max_tokens").and_then(|v| v.as_u64()),
            Some(OPUS.default_max_tokens as u64)
        );
        assert_eq!(
            value
                .get("thinking")
                .and_then(|v| v.get("type"))
                .and_then(|v| v.as_str()),
            Some("enabled")
        );
        assert_eq!(
            value
                .get("thinking")
                .and_then(|v| v.get("budget_tokens"))
                .and_then(|v| v.as_u64()),
            Some(31_999)
        );
    }

    #[test]
    fn haiku_preset_builds_expected_model_and_defaults() {
        let params = HAIKU.stream_params(minimal_prompt());
        let req = build_request(&params);
        let value = serde_json::to_value(req).expect("json");
        assert_eq!(
            value.get("model").and_then(|v| v.as_str()),
            Some(HAIKU.model)
        );
        assert_eq!(
            value.get("max_tokens").and_then(|v| v.as_u64()),
            Some(HAIKU.default_max_tokens as u64)
        );
        assert_eq!(value.get("thinking"), None);
    }

    #[test]
    fn by_name_matches_case_insensitively() {
        assert_eq!(by_name("SONNET"), Some(SONNET));
        assert_eq!(by_name("  opus  "), Some(OPUS));
    }

    #[test]
    fn stream_params_from_preset_matches_preset_builder() {
        let prompt = minimal_prompt();
        let from_preset = StreamParams::from_preset(SONNET, prompt.clone());
        let direct = SONNET.stream_params(prompt);
        assert_eq!(from_preset.model, direct.model);
        assert_eq!(from_preset.max_tokens, direct.max_tokens);
        assert_eq!(from_preset.prompt_caching.is_some(), true);
        assert_eq!(direct.prompt_caching.is_some(), true);
    }
}
