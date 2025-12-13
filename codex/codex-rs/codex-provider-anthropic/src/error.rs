use thiserror::Error;

/// Errors returned by the Anthropic provider adapter.
#[derive(Debug, Error)]
pub enum AnthropicError {
    #[error("Anthropic API key is required")]
    MissingApiKey,

    #[error("Anthropic credentials are required (api key or access token)")]
    MissingCredentials,

    #[error("unexpected status {status}: {body}")]
    HttpStatus {
        status: reqwest::StatusCode,
        body: String,
    },

    #[error("HTTP error: {0}")]
    Http(#[from] reqwest::Error),

    #[error("stream error: {0}")]
    Stream(#[from] eventsource_stream::EventStreamError<reqwest::Error>),

    #[error("invalid payload: {0}")]
    Serde(#[from] serde_json::Error),

    #[error("protocol error: {0}")]
    Protocol(String),

    #[error("stream closed before completion")]
    StreamClosedEarly,
}
