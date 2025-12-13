# PR1 Task: make it possible to select Anthropic as a provider (config-only)

Goal: allow developers/users to run Anthropic mode without adding lots of core UI/preset logic yet.

## Approach (preferred for minimal upstream diff)

Do NOT add a built-in provider entry in `codex-core` for PR1. Instead, document a `~/.codex/config.toml` provider stanza and verify it works end-to-end.

## Steps

1. Document a config snippet (in a repo doc or internal developer note) like:

- Provider definition:
  - `name = "Anthropic"`
  - `base_url = "https://api.anthropic.com"`
  - `env_key = "ANTHROPIC_API_KEY"`
  - `wire_api = "anthropic_messages"`

2. Ensure auth code path works:
  - For non-OpenAI providers, Codex typically uses `env_key` for API keys.
  - Verify the Anthropic branch reads the key from `provider.api_key()` (or an equivalent helper) rather than OpenAI auth storage.

3. Validate that selecting a Claude model slug works:
  - For PR1, assume the configured model string is used as-is (no provider-aware listing yet).

## Optional (only if Pasture UI can’t select custom providers)

If the desktop app cannot practically select an unlisted provider, add a minimal built-in provider entry:

- In `codex/codex-rs/core/src/model_provider_info.rs` `built_in_model_providers()`:
  - Add an `"anthropic"` provider with `wire_api = AnthropicMessages`
  - `env_key = Some("ANTHROPIC_API_KEY".into())`
  - `env_key_instructions` with a short hint
  - `requires_openai_auth = false`

Keep this optional because it increases the core diff surface.

## Acceptance criteria

- A developer can run Anthropic mode by editing config and exporting `ANTHROPIC_API_KEY`.
- No additional protocol/model-manager refactors required for PR1.

