# PR2 Task: add image support (Codex data URLs → Anthropic base64 image blocks)

Goal: allow user-provided images (including local images converted to data URLs) to be sent to Claude using Anthropic’s vision format.

## Scope

- Implement in `codex-provider-anthropic`:
  - Parse `ContentItem::InputImage { image_url }` where `image_url` is a `data:<mime>;base64,<data>` URL.
  - Convert to Anthropic content block:
    - `{ "type": "image", "source": { "type": "base64", "media_type": "<mime>", "data": "<base64>" } }`
- For non-`data:` URLs:
  - Decide one of:
    - Degrade to text `image_url: ...` (default-safe), OR
    - Add explicit opt-in fetching (later).

## Steps

1. Add a `data_url` parser helper:
   - Input: `data:image/png;base64,AAA...`
   - Output: `{ mime: "image/png", data_base64: "AAA..." }`
   - Validate supported image types (`image/jpeg`, `image/png`, `image/gif`, `image/webp`).

2. Update request compilation to emit image blocks when present.

3. Add tests:
   - data-url parses correctly and produces expected JSON.
   - unsupported mime degrades to text (or errors—pick behavior and test it).

## Acceptance criteria

- A user can attach an image and Claude receives it as an image block (no runtime errors).
- Existing text-only behavior unchanged.

