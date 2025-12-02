# Pasture transcript refactor – Task 01: introduce canonical transcript view types

Pasture’s transcript UI is being refactored so both the desktop Tauri app and the web share app can share the same transcript view model and React components via the `@pasture/transcript-ui` package, backed by `@pasture/protocol`. The overall goals are:

- Define a single canonical transcript state and cell model that is rich enough for the desktop app and reused by the web app.
- Move layout and per-cell rendering into shared components, with per-host customization via well-typed overrides instead of ad‑hoc render functions.
- Consolidate approval / patch UI and platform services (clipboard, timestamps, image URLs, toasts) behind a shared `TranscriptProvider`.

This task is the first step in that work: introduce the canonical transcript *view model* types into `@pasture/transcript-ui` by basing them on the current desktop transcript types.

## Task instructions

1. **Define canonical transcript types in `@pasture/transcript-ui`**
   - Copy the *view-level* transcript types from `apps/desktop/src/conversation/transcript/types.ts` (the `TranscriptCellKind`, each `Transcript*Cell` type, `TranscriptTurnStatus`, `TranscriptTurn`, and `TranscriptState` definitions) into `packages/transcript-ui/src/types/`.
   - Wire these types to `@pasture/protocol` for shared primitives (e.g., `FileChange`, `ParsedCommand`, `McpInvocation`, event IDs) rather than re-declaring them in the shared package.
   - Ensure the canonical `TranscriptState` you expose is rich enough for the desktop (including task/exec/patch/tool cells and any fields the UI needs), not a simplified subset.

2. **Align the existing `transcript-ui` types with the canonical ones**
   - Remove or replace the simplified transcript cell and state definitions currently in `packages/transcript-ui/src/types/index.ts` in favor of the canonical ones you just introduced.
   - Keep non-view “helper” types that are still useful for the shared components (e.g., `TranscriptContext`) but avoid duplicating protocol types that already exist in `@pasture/protocol`.
   - Make sure the default export surface of `@pasture/transcript-ui` exposes the canonical transcript view types (you can keep the existing `export * from './types';` pattern, but do not add new unnecessary re-export layers elsewhere in the repo).

3. **Update shared components to use the canonical types**
   - Update `packages/transcript-ui` components (e.g., `TranscriptList`, `UserMessage`, `AgentMessage`, `ExecutionResult`, `Patches`, `ExecutionApproval`, `StatusEvents`, `ExplorationCell`, `TaskLifecycle`, etc.) to import and use the canonical `Transcript*Cell` and `TranscriptState` types from the new type module.
   - Ensure internal helper types in `transcript-ui` that represent commands, file changes, or MCP invocations either use the protocol types directly or thin wrappers around them, rather than parallel “almost-the-same” shapes.

4. **Keep desktop and web apps compiling without changing their imports yet**
   - For this task, do **not** change imports in the desktop or web apps to use the new shared types. The goal is to get `packages/transcript-ui` compiling cleanly with the canonical types; app wiring will happen in follow-up tasks.
   - Run type-checking and tests for the `packages/transcript-ui` package (and any workspace-wide typecheck) to confirm all shared components now build against the canonical types.

## Code references

- `apps/desktop/src/conversation/transcript/types.ts`
- `apps/desktop/src/conversation/transcript/state.ts`
- `apps/desktop/src/conversation/transcript/selectors.ts`
- `packages/transcript-ui/src/types/index.ts`
- `packages/transcript-ui/src/components/TranscriptList.tsx`
- `packages/transcript-ui/src/components/UserMessage.tsx`
- `packages/transcript-ui/src/components/AgentMessage.tsx`
- `packages/transcript-ui/src/components/AgentReasoning.tsx`
- `packages/transcript-ui/src/components/ExecutionResult.tsx`
- `packages/transcript-ui/src/components/Patches.tsx`
- `packages/transcript-ui/src/components/ExecutionApproval.tsx`
- `packages/transcript-ui/src/index.ts`
- `packages/protocol/src/index.ts`

