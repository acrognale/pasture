# PR5 Task: hardening (max_tokens config, token usage, retries, better errors)

Goal: make Anthropic support production-grade without widening core interfaces.

## Items

1. `max_tokens` configurability:
   - Support (in priority order):
     - env var `ANTHROPIC_MAX_TOKENS`
     - provider-specific TOML setting (if there’s an existing “extra provider settings” mechanism; otherwise keep env-only)
     - default constant

2. Token usage:
   - If Anthropic streaming provides token usage fields (varies by API version/model), map into `codex_protocol::protocol::TokenUsage` and populate `ResponseEvent::Completed { token_usage: Some(...) }`.
   - If not available, leave `None` (don’t fake values).

3. Error mapping:
   - Surface status code + response body (truncated) in `AnthropicError`.
   - Map common failures to `CodexErr::InvalidRequest`, `CodexErr::QuotaExceeded`, etc., if there’s a clean mapping.

4. Streaming robustness:
   - Handle unexpected SSE ordering gracefully.
   - Handle reconnect semantics via core’s existing retry loop (no new retry logic in provider).
   - Respect provider `stream_idle_timeout` if feasible (or document limitations).

5. Fixtures + regression tests:
   - Add fixtures for:
     - empty deltas
     - multiple content blocks
     - tool_use with json delta streaming
     - server-side error events

## Acceptance criteria

- Anthropic mode behaves predictably under transient disconnects and API errors.
- Tests cover at least one “weird but valid” streaming trace.

