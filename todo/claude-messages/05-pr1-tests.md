# PR1 Task: add unit tests for request compilation and stream parsing

Goal: lock in the provider crate behavior with fast, deterministic tests that don’t hit the network.

## Scope

- Tests live in `codex/codex-rs/codex-provider-anthropic/tests/`
- Use fixtures to simulate Anthropic SSE streams.

## Test 1: request compilation (text-only)

File: `codex/codex-rs/codex-provider-anthropic/tests/request_compilation.rs`

Create a canonical `codex_api::common::Prompt` with:

- `instructions: "sys"`
- `input` containing:
  - a `user` message with `InputText("hi")`
  - an `assistant` message with `OutputText("hello")`
  - a `developer` message with `InputText("dev")` (should be folded into `system`)

Assert the serialized Anthropic request JSON includes:

- `system` contains `"sys"` and `"dev"`
- `messages` include only user+assistant
- Each message content block is `{type:"text", text: ...}`

## Test 2: streaming parse emits Codex events in correct order

File: `codex/codex-rs/codex-provider-anthropic/tests/stream_parsing.rs`

- Provide an in-memory SSE fixture that represents:
  - message_start
  - content_block_start (text)
  - a few content_block_delta (text_delta) events
  - content_block_stop
  - message_stop

Drive the parser and assert:

- First non-created event is `OutputItemAdded(assistant message)`
- Every `text_delta` becomes `ResponseEvent::OutputTextDelta`
- Finalization yields `OutputItemDone(assistant message with full text)` and then `Completed`

## Acceptance criteria

- `cargo test -p codex-provider-anthropic --manifest-path codex/codex-rs/Cargo.toml` passes.
- Tests do not require real API keys or network access.

