# PR4 Task: model presets/listing for Anthropic (provider-aware hook, no ModelsManager refactor)

Goal: make it easy to pick Claude models in the Pasture UI without overhauling `ModelsManager` (which is OpenAI-centric).

## Strategy

- Keep `codex-core` model discovery as-is for now.
- Add a provider-aware hook in the desktop app / app-server layer:
  - If selected provider id is `"anthropic"`, return a static list of Claude presets.
  - Otherwise use existing OpenAI model list logic.

## Steps

1. Add a static preset list function in `codex-provider-anthropic`:
   - `pub fn builtin_model_presets() -> Vec<codex_protocol::openai_models::ModelPreset>`
   - Populate with a small curated set (e.g., `claude-3-5-sonnet-latest`, `claude-3-5-haiku-latest`, etc.).

2. In the desktop app backend (Tauri commands that return models):
   - Detect current provider id.
   - If anthropic, call `codex_provider_anthropic::builtin_model_presets()` and return that list.

3. Keep selection behavior minimal:
   - The “model” string is still just a slug; it’s used verbatim when calling the provider.

## Acceptance criteria

- Pasture UI shows a Claude model list when Anthropic provider is selected.
- No refactor of `codex/codex-rs/core/src/openai_models/models_manager.rs`.

