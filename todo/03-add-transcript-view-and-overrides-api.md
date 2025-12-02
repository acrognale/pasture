# Pasture transcript refactor – Task 03: introduce `TranscriptView` and per-kind overrides

Pasture’s transcript UI is being refactored so both the desktop Tauri app and the web share app can share the same transcript view model and React components via the `@pasture/transcript-ui` package, backed by `@pasture/protocol`. The overall goals are:

- Define a single canonical transcript state and cell model that is rich enough for the desktop app and reused by the web app.
- Move layout and per-cell rendering into shared components, with per-host customization via well-typed overrides instead of ad‑hoc render functions.
- Consolidate approval / patch UI and platform services (clipboard, timestamps, image URLs, toasts) behind a shared `TranscriptProvider`.

This task introduces a high-level `TranscriptView` component and a typed “per-kind overrides” API so apps no longer have to pass a generic `renderCell` function or re‑implement the `switch (cell.kind)` mapping themselves.

## Task instructions

1. **Add a `TranscriptView` component to `@pasture/transcript-ui`**
   - Create a new component (e.g. `TranscriptView`) in `packages/transcript-ui/src/components/` that:
     - Accepts a `TranscriptState` (or `{ transcript: TranscriptState }`) as its primary input.
     - Internally uses the existing `TranscriptList` component to handle scrolling, collapsing, and animation.
     - Owns the default mapping from `TranscriptCell.kind` to the shared components (`UserMessage`, `AgentMessage`, `AgentReasoning`, `TaskLifecycle`, `ExecutionResult`, `ExplorationCell`, `ExecutionApproval`, `Patches`, `StatusEvents`, `Errors`, etc.).

2. **Design a typed per-kind overrides API**
   - Define a `TranscriptRenderContext` type (e.g. `{ turnId: string; cellIndex: number; nthUserMessage?: number }`) that `TranscriptView` passes into overrides.
   - Define a `TranscriptViewOverrides` type that allows overriding specific cell kinds instead of providing a generic function, e.g.:
     - `'user-message'?: (props: { cell: TranscriptUserMessageCell; context: TranscriptRenderContext; defaultNode: ReactNode }) => ReactNode`
     - `'agent-message'?: (props: { cell: TranscriptAgentMessageCell; context: TranscriptRenderContext; defaultNode: ReactNode }) => ReactNode`
     - Similar overrides for `agent-reasoning`, `exec-approval`, `patch`, `patch-approval`, `tool`, and any other kinds that hosts may want to customize.
   - Implement `TranscriptView` so that it:
     - Builds a `defaultNode` using the canonical `switch (cell.kind)` mapping.
     - Looks up the appropriate override for `cell.kind` (if provided) and, if present, calls it with `{ cell, context, defaultNode }`.
     - Falls back to `defaultNode` when there is no override.

3. **Keep `TranscriptList` lower-level and avoid exposing `renderCell` as the primary API**
   - Keep `TranscriptList` as an internal building block that still accepts a `renderCell` function, but treat it as an implementation detail of `TranscriptView` for now.
   - Expose `TranscriptView` (and its `overrides` prop) as the main public API for rendering transcripts from `@pasture/transcript-ui/src/index.ts`.
   - Avoid adding new generic `renderCell` props on exported components; the goal is that most consumers never need to re‑implement cell mapping themselves.

4. **Wire up the default mapping based on current desktop behavior**
   - Use the logic in `apps/desktop/src/conversation/components/TranscriptCells.tsx` and the current `apps/web/src/components/transcript/TranscriptCellRenderer.tsx` as the source of truth for how each `TranscriptCell.kind` should render by default in `TranscriptView`.
   - Ensure the default mapping remains side-effect free: `TranscriptView` should only compose shared components and read data from `TranscriptContext`; callbacks that trigger Codex calls, approvals, or navigation will be supplied later via per-kind overrides in host apps.

5. **Add targeted tests / stories for `TranscriptView`**
   - Add storybook stories or tests in `packages/transcript-ui` that:
     - Render a sample transcript using `TranscriptView` with no overrides (pure shared behavior).
     - Demonstrate a simple override (e.g., customizing `'user-message'` to wrap the default node with extra chrome or an icon), to validate the overrides API.

## Code references

- `packages/transcript-ui/src/components/TranscriptList.tsx`
- `packages/transcript-ui/src/components/UserMessage.tsx`
- `packages/transcript-ui/src/components/AgentMessage.tsx`
- `packages/transcript-ui/src/components/AgentReasoning.tsx`
- `packages/transcript-ui/src/components/TaskLifecycle.tsx`
- `packages/transcript-ui/src/components/ExecutionResult.tsx`
- `packages/transcript-ui/src/components/ExecutionApproval.tsx`
- `packages/transcript-ui/src/components/Patches.tsx`
- `packages/transcript-ui/src/components/StatusEvents.tsx`
- `packages/transcript-ui/src/components/ExplorationCell.tsx`
- `apps/desktop/src/conversation/components/TranscriptCells.tsx`
- `apps/web/src/components/transcript/TranscriptCellRenderer.tsx`
- `apps/desktop/src/conversation/__stories__/mocks/data.ts`

