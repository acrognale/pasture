use std::pin::Pin;

use crate::DEFAULT_ANTHROPIC_VERSION;
use crate::error::AnthropicError;
use crate::request::MessagesRequest;
use eventsource_stream::EventStream;
use eventsource_stream::Eventsource;
use futures::Stream;
use reqwest::header::AUTHORIZATION;
use reqwest::header::CONTENT_TYPE;
use reqwest::header::HeaderMap;
use reqwest::header::HeaderValue;
use reqwest::header::USER_AGENT;

const MAX_ERROR_BODY_BYTES: usize = 16 * 1024;

/// Thin wrapper around `reqwest::Client` with Anthropic-specific defaults.
#[derive(Clone)]
pub struct AnthropicClient {
    pub(crate) base_url: String,
    pub(crate) api_key: Option<String>,
    pub(crate) access_token: Option<String>,
    pub(crate) anthropic_version: String,
    pub(crate) client: reqwest::Client,
}

impl AnthropicClient {
    pub fn new(base_url: impl Into<String>, api_key: impl Into<String>) -> Self {
        Self::with_version_and_auth(
            base_url,
            Some(api_key.into()),
            None,
            DEFAULT_ANTHROPIC_VERSION,
            reqwest::Client::new(),
        )
    }

    pub fn with_version(
        base_url: impl Into<String>,
        api_key: impl Into<String>,
        anthropic_version: impl Into<String>,
    ) -> Self {
        Self::with_version_and_client(base_url, api_key, anthropic_version, reqwest::Client::new())
    }

    pub fn with_version_and_client(
        base_url: impl Into<String>,
        api_key: impl Into<String>,
        anthropic_version: impl Into<String>,
        client: reqwest::Client,
    ) -> Self {
        Self::with_version_and_auth(
            base_url,
            Some(api_key.into()),
            None,
            anthropic_version,
            client,
        )
    }

    pub fn with_version_and_auth(
        base_url: impl Into<String>,
        api_key: Option<String>,
        access_token: Option<String>,
        anthropic_version: impl Into<String>,
        client: reqwest::Client,
    ) -> Self {
        Self {
            base_url: base_url.into(),
            api_key,
            access_token,
            anthropic_version: anthropic_version.into(),
            client,
        }
    }
}

/// Open an SSE stream for the Anthropic Messages API.
pub async fn open_stream(
    client: AnthropicClient,
    request: &MessagesRequest,
) -> Result<
    EventStream<Pin<Box<dyn Stream<Item = Result<bytes::Bytes, reqwest::Error>> + Send>>>,
    AnthropicError,
> {
    let url = format!("{}/v1/messages", client.base_url.trim_end_matches('/'));

    let mut headers = HeaderMap::new();

    if let Some(token) = &client.access_token {
        headers.insert(
            AUTHORIZATION,
            HeaderValue::from_str(&format!("Bearer {token}")).map_err(|err| {
                AnthropicError::Protocol(format!("invalid access token header value: {err}"))
            })?,
        );
        // Required beta header for OAuth access tokens.
        headers.insert(
            "anthropic-beta",
            HeaderValue::from_static("oauth-2025-04-20"),
        );
    } else if let Some(api_key) = &client.api_key {
        headers.insert(
            "x-api-key",
            HeaderValue::from_str(api_key).map_err(|err| {
                AnthropicError::Protocol(format!("invalid api key header value: {err}"))
            })?,
        );
    } else {
        return Err(AnthropicError::MissingCredentials);
    }

    headers.insert(
        "anthropic-version",
        HeaderValue::from_str(&client.anthropic_version).map_err(|err| {
            AnthropicError::Protocol(format!("invalid anthropic-version header: {err}"))
        })?,
    );
    headers.insert(CONTENT_TYPE, HeaderValue::from_static("application/json"));
    if !headers.contains_key(USER_AGENT) {
        if let Ok(agent) = HeaderValue::from_str(&format!(
            "codex-provider-anthropic/{version}",
            version = env!("CARGO_PKG_VERSION")
        )) {
            headers.insert(USER_AGENT, agent);
        }
    }

    let response = client
        .client
        .post(url)
        .headers(headers)
        .json(request)
        .send()
        .await?;

    let status = response.status();
    if !status.is_success() {
        let request_id = response
            .headers()
            .get("request-id")
            .or_else(|| response.headers().get("x-request-id"))
            .and_then(|value| value.to_str().ok())
            .map(|value| value.trim().to_string())
            .filter(|value| !value.is_empty());
        let body = response.text().await.unwrap_or_default();
        let body = truncate_body(body, MAX_ERROR_BODY_BYTES);
        return Err(AnthropicError::HttpStatus {
            status,
            body,
            request_id,
        });
    }

    let stream = response.bytes_stream();
    let boxed: Pin<Box<dyn Stream<Item = Result<bytes::Bytes, reqwest::Error>> + Send>> =
        Box::pin(stream);
    let event_stream = boxed.eventsource();
    Ok(event_stream)
}

fn truncate_body(mut body: String, max_bytes: usize) -> String {
    if body.len() <= max_bytes {
        return body;
    }
    body.truncate(max_bytes);
    body.push_str("…(truncated)");
    body
}
