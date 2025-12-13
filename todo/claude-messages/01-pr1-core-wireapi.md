# PR1 Task: minimal core glue for Anthropic Messages streaming

Goal: add a new wire API variant and a single new streaming branch in `codex-core` that delegates Anthropic-specific logic to a new provider crate.

## Scope

- Touch only:
  - `codex/codex-rs/core/src/model_provider_info.rs`
  - `codex/codex-rs/core/src/client.rs`
  - `codex/codex-rs/codex-api/src/provider.rs` (only if needed to keep types in sync)
- Do **not** refactor tools, model selection, or prompt types.

## Steps

1. Add `WireApi::AnthropicMessages` to core:
   - Edit `codex/codex-rs/core/src/model_provider_info.rs`:
     - Add a new enum variant to `pub enum WireApi` near `Responses`/`Chat`.
     - Ensure it deserializes from `"anthropic_messages"` in TOML/JSON:
       - Because the enum uses `#[serde(rename_all = "lowercase")]`, add `#[serde(rename = "anthropic_messages")]` to the variant.

2. Add a new match arm in `ModelClient::stream()`:
   - Edit `codex/codex-rs/core/src/client.rs` around `ModelClient::stream()` (currently matches only `Responses`/`Chat`).
   - Add:
     - `WireApi::AnthropicMessages => self.stream_anthropic_messages(prompt).await`
   - Implement `stream_anthropic_messages()` as a small helper method in `impl ModelClient`:
     - Must compile the core `Prompt` into the “canonical API prompt” type (same as OpenAI paths do).
     - Must call into the new crate (to be added in PR1 Task 02/03) for the actual HTTP + SSE parsing.
     - For PR1, reject unsupported features:
       - If `prompt.output_schema.is_some()`, return `CodexErr::UnsupportedOperation(...)`.
     - For PR1, pass `tools` as empty (tools come later).

3. Keep `codex-api` in sync if required:
   - If any code assumes only `{Responses,Chat,Compact}`, add a matching new variant in `codex/codex-rs/codex-api/src/provider.rs` (or handle it without widening that enum if core no longer calls through `codex-api` for Anthropic).
   - Prefer: keep Anthropic entirely outside `codex-api` for PR1 (so `codex-api` remains OpenAI-shaped), and avoid changing `codex-api::provider::WireApi` unless compilation forces it.

## Acceptance criteria

- `WireApi` can be set to `"anthropic_messages"` via config without serde errors.
- `codex-core` compiles with the new enum variant and match arm.
- The new branch delegates to a provider crate function (even if that crate is stubbed initially in PR1 Task 02).

## Suggested commands

- Build core only:
  - `cargo build -p codex-core --manifest-path codex/codex-rs/Cargo.toml`

