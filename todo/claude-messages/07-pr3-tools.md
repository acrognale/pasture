# PR3 Task: tool definitions + tool_use/tool_result round-trips (no core tool handler changes)

Goal: enable Claude tool use while keeping Codex tool execution unchanged.

## Scope

- Provider crate:
  - Translate Codex tool specs (currently serialized for OpenAI) into Anthropic tool definitions.
  - Parse tool calls from Anthropic streaming into Codex tool call `ResponseItem`s.
  - Convert Codex tool outputs back into Anthropic `tool_result` blocks on the next request.
- Core remains unchanged: existing `ToolRouter` executes tool calls emitted as:
  - `ResponseItem::FunctionCall { name, call_id, arguments }`
  - or `ResponseItem::CustomToolCall { name, call_id, input }` for “freeform” tools.

## Tool definition mapping (recommended)

1. Only support OpenAI-style function tools in the first tool PR:
   - Input: OpenAI tool JSON like `{ "type": "function", "name": ..., "description": ..., "parameters": <json schema> }`
   - Output: Anthropic tool `{ name, description, input_schema }`

2. Ignore unsupported “built-in” tool types (`local_shell`, `web_search`) in Anthropic mode.

## Streaming: tool_use → Codex tool call items

When Anthropic emits `tool_use`:

- Emit a Codex item that the existing tool router recognizes, e.g.:
  - `ResponseEvent::OutputItemDone(ResponseItem::FunctionCall { call_id: tool_use.id, name, arguments: serde_json::to_string(input) })`
- Ensure this matches the existing behavior where `arguments` is a JSON string.

Important: The core tool router triggers on `OutputItemDone`, so it’s fine to skip `OutputItemAdded` for tool calls.

## Tool results: Codex tool output → Anthropic tool_result blocks

In request compilation, when the history contains:

- `ResponseItem::FunctionCallOutput { call_id, output }`
- or `ResponseItem::CustomToolCallOutput { call_id, output }`

Convert them into a `user` message whose content begins with one or more `tool_result` blocks referencing the corresponding `tool_use_id` (Anthropic naming), with:

- `content` as a string (and optionally support image blocks later using `FunctionCallOutputPayload.content_items`).

Ordering constraints:

- Tool results must be sent *immediately after* the tool_use they respond to.
- The `tool_result` blocks must come first in the user message content array.

## Tests

- Request compilation:
  - A tool call + tool output in history becomes a tool_result block in the next request.
- Streaming parse:
  - tool_use becomes `ResponseItem::FunctionCall` with correct `call_id/name/arguments`.

## Acceptance criteria

- Claude can request a tool; Codex executes it; the next request includes the tool result; Claude continues.
- No changes to Codex tool handlers in `codex-core`.

