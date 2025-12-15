mod error;
mod http;
pub mod oauth;
mod request;
mod stream;

pub use error::AnthropicError;
pub use http::AnthropicClient;
pub use stream::PromptCachingParams;
pub use stream::StreamParams;
pub use stream::ThinkingParams;
pub use stream::stream;

#[doc(hidden)]
pub use stream::test_support;

/// Default Anthropic API version header value.
pub const DEFAULT_ANTHROPIC_VERSION: &str = "2023-06-01";

// Claude "extended thinking" requires `max_tokens > thinking.budget_tokens`.
// Claude Code defaults to 64k output tokens for thinking-capable models.
pub const DEFAULT_ANTHROPIC_MAX_TOKENS: u32 = 64_000;
pub const DEFAULT_ANTHROPIC_THINKING_BUDGET_TOKENS: u32 = 31_999;
