# PR1 Task: implement text-only Anthropic Messages streaming end-to-end

Goal: make a single Claude model stream assistant text to the UI, using Anthropic Messages API streaming, without tools/images.

## Scope

- Implement in `codex/codex-rs/codex-provider-anthropic`:
  - Request compilation: `codex_api::common::Prompt` → Anthropic `messages` request JSON
  - Streaming parser: Anthropic SSE → Codex `ResponseEvent`
- Integrate with the new `WireApi::AnthropicMessages` branch added in PR1 Task 01.
- No tools, no images, no token usage mapping yet.

## Request compilation rules (text-only)

Anthropic request fields (minimum):

- `model`: from `StreamParams.model`
- `max_tokens`: from `StreamParams.max_tokens` (Anthropic requires this)
- `stream: true`
- `system`: from `prompt.instructions`
- `messages`: derived from `prompt.input`:
  - Only include `ResponseItem::Message { role: "user" | "assistant" }`
  - Convert `ContentItem::{InputText,OutputText}` into Anthropic content blocks `{type:"text", text:"..."}`
  - Ignore images and ignore all other `ResponseItem` variants for PR1.
  - Fold any `role: "developer"` or `role: "system"` messages into the `system` string (append with separators) rather than emitting them as messages.

## Streaming parse → Codex events (required ordering)

Codex core expects a non-tool assistant item to be “active” before text deltas arrive.

Implement a state machine that emits:

1. `ResponseEvent::Created` (optional, but consistent with other providers)
2. When first assistant content block begins:
   - `ResponseEvent::OutputItemAdded(ResponseItem::Message { role:"assistant", content:[OutputText{ text:"" }], id: None })`
3. For each Anthropic `text_delta`:
   - `ResponseEvent::OutputTextDelta(delta)`
   - Accumulate into a full assistant string in the parser state.
4. On message end (`message_stop` or equivalent):
   - `ResponseEvent::OutputItemDone(ResponseItem::Message { role:"assistant", content:[OutputText{ text: full }], id: None })`
   - `ResponseEvent::Completed { response_id: <anthropic message id or fallback>, token_usage: None }`

Edge cases:

- Ignore `ping` events.
- If an `error` SSE event arrives, turn it into an `Err(AnthropicError::...)`.
- If the stream ends before a “completed” event, return an error consistent with other providers (“stream closed early”).

## HTTP behavior

- Endpoint: `POST {base_url}/v1/messages`
- Headers:
  - `x-api-key: <api key>`
  - `anthropic-version: 2023-06-01` (configurable field with default)
  - `content-type: application/json`
- Use `reqwest` streaming + `eventsource-stream` to parse SSE.

## Core integration

- In `codex/codex-rs/core/src/client.rs`, ensure the Anthropic branch:
  - Builds `instructions` from `prompt.get_full_instructions(&model_family)`
  - Builds a `codex_api::common::Prompt` (same as OpenAI paths do)
  - Supplies a default `max_tokens` for PR1 (e.g. 4096)
  - For PR1, passes `tools: vec![]` and `parallel_tool_calls: false`

## Acceptance criteria

- With a provider configured as:
  - `wire_api = "anthropic_messages"`
  - `env_key = "ANTHROPIC_API_KEY"`
  - `base_url = "https://api.anthropic.com"`
- A simple user prompt streams assistant text and completes without panics.

## Suggested commands

- Unit tests (if added in Task 05):
  - `cargo test -p codex-provider-anthropic --manifest-path codex/codex-rs/Cargo.toml`
- Smoke run (manual):
  - Run the desktop app and select the Anthropic provider + a Claude model slug.

