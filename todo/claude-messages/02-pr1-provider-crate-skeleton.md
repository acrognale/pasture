# PR1 Task: create `codex-provider-anthropic` crate skeleton

Goal: add a new crate under the vendored Codex workspace that will own all Anthropic-specific behavior (request compilation + SSE parsing), while keeping `codex-core` changes minimal.

## Scope

- Add a new crate directory: `codex/codex-rs/codex-provider-anthropic/`
- Add it to the Codex workspace: `codex/codex-rs/Cargo.toml` `members`.
- Provide a minimal public API that `codex-core` can call.
- No UI/app changes in this PR.

## New crate API (minimum viable)

Create `codex/codex-rs/codex-provider-anthropic/src/lib.rs` with:

- `pub struct AnthropicClient { ... }`
  - Holds `base_url`, `reqwest::Client`, `api_key`, and `anthropic_version` (default `"2023-06-01"`).
- `pub struct StreamParams { pub model: String, pub prompt: codex_api::common::Prompt, pub max_tokens: u32 }`
- `pub fn stream(client: AnthropicClient, params: StreamParams) -> impl futures::Stream<Item = Result<codex_api::common::ResponseEvent, AnthropicError>>`

You can start with stubs that return a stream error, but the types should be stable for PR1 Task 03.

## Module layout

Create files (can start empty/stubbed):

- `src/lib.rs` (exports the public API)
- `src/error.rs` (defines `AnthropicError`)
- `src/request.rs` (serde structs + compiler from Codex prompt)
- `src/stream.rs` (SSE parser → `ResponseEvent`)
- `src/http.rs` (POST `/v1/messages` and SSE wiring)

## Dependencies

In `codex/codex-rs/codex-provider-anthropic/Cargo.toml`, add:

- Internal:
  - `codex-api` (for canonical `Prompt` + `ResponseEvent`)
  - `codex-protocol` (for `ResponseItem` + `ContentItem`)
- External:
  - `reqwest`, `tokio`, `futures`, `eventsource-stream`, `serde`, `serde_json`
  - (optional in PR1) `thiserror` for errors

## Acceptance criteria

- `cargo build -p codex-provider-anthropic --manifest-path codex/codex-rs/Cargo.toml` succeeds.
- `codex-core` can add a dependency on this crate (feature-gated optional is fine) without cyclic deps.
- The crate exports the streaming API surface used by `codex-core` (even if not fully implemented yet).

