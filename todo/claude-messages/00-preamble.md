# Overall task: add Anthropic Claude (Messages API) support

We’re adding first-class Anthropic Claude support (Messages API + streaming) to this repo while keeping `codex/codex-rs/core` changes as small as possible (we maintain a fork and want easy upstream merges). The approach is:

- Add a new provider crate (e.g. `codex/codex-rs/codex-provider-anthropic`) that **translates between Codex’s canonical types** (`codex_api::common::{Prompt, ResponseEvent}` + `codex_protocol::models::{ResponseItem, ContentItem}`) and Anthropic’s Messages API wire format (request compilation + SSE streaming parsing).
- Add **minimal core glue**: one new `WireApi` variant and one new `ModelClient::stream()` branch that delegates to the new provider crate.
- Keep existing tool handlers unchanged; the adapter emits Codex-native tool call items so the existing tool router runs them.

Notes / constraints:

- Codex core currently assumes OpenAI wire formats (Responses/Chat). Anthropic support must live mostly outside core.
- Anthropic requires `max_tokens`. Codex doesn’t currently have a general “max output tokens” knob; start with a provider-default and make it configurable later.
- Developer/system roles differ: core injects a `developer` role message; Anthropic has only `system` + `user`/`assistant`. The adapter must fold `developer` into `system`.
- Images in Codex are currently `data:` URLs; Anthropic expects `{source:{type:"base64", media_type, data}}`.

Process:

- Each file in this folder is a standalone “complete task” suitable for a PR.
- Keep PR1 intentionally tiny: **stream text only** end-to-end; defer images/tools/model catalog to follow-ups.

