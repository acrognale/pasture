# Pasture transcript refactor – Task 02: switch desktop and web to shared transcript types

Pasture’s transcript UI is being refactored so both the desktop Tauri app and the web share app can share the same transcript view model and React components via the `@pasture/transcript-ui` package, backed by `@pasture/protocol`. The overall goals are:

- Define a single canonical transcript state and cell model that is rich enough for the desktop app and reused by the web app.
- Move layout and per-cell rendering into shared components, with per-host customization via well-typed overrides instead of ad‑hoc render functions.
- Consolidate approval / patch UI and platform services (clipboard, timestamps, image URLs, toasts) behind a shared `TranscriptProvider`.

This task assumes the canonical transcript types have been introduced into `@pasture/transcript-ui` (see Task 01) and focuses on updating the desktop and web apps to consume those shared types directly.

## Task instructions

1. **Update desktop transcript code to import from `@pasture/transcript-ui`**
   - In `apps/desktop/src/conversation/transcript`:
     - Change imports of `TranscriptCell`, `TranscriptTurn`, `TranscriptState`, and related view types to come from `@pasture/transcript-ui` instead of the local `./types` module wherever possible.
     - Keep any desktop-only types in `types.ts` that are not part of the shared view model (e.g., aliases for specific protocol events like `TranscriptExecBeginEvent`, `TranscriptPatchApprovalEvent`, or extra diff metadata) but avoid re-exporting shared types “just to rename them”.
     - Ensure `state.ts` and `selectors.ts` use the canonical `TranscriptState` type from the shared package.

2. **Update UI components and tests to rely on the shared types**
   - In desktop conversation components and tests (e.g., `ConversationTranscriptSection`, `TranscriptCells`, storybook mocks, conversation store tests), replace imports of transcript view types from `~/conversation/transcript/types` with imports from `@pasture/transcript-ui` where those types are now canonical.
   - Keep using the local desktop transcript types only when you need desktop-specific metadata or event aliases that are intentionally not part of the shared view model.

3. **Update the web share app to use the canonical transcript types**
   - In `apps/web/src/routes/s.$id.tsx` and the transcript components under `apps/web/src/components/transcript`, update imports to take `TranscriptState` and `TranscriptCell` from `@pasture/transcript-ui`.
   - Ensure the Prisma model / Zod `TranscriptSchema` in `apps/web/src/routes/api.share.tsx` remains compatible with the canonical transcript state (it does not need to validate every field, but it should not contradict the new shape).

4. **Remove obsolete or duplicate type definitions**
   - Once all call sites in the desktop and web apps are using the shared transcript view types, delete any now-redundant local view-model definitions from `apps/desktop/src/conversation/transcript/types.ts` that merely duplicate the shared types.
   - Do not introduce new intermediate re-export modules for types; follow the repo rule to import exported types directly from their primary source.

5. **Verify type safety across the workspace**
   - Run `turbo typecheck` (or the relevant subset for `apps/desktop`, `apps/web`, and `packages/transcript-ui`) and fix any remaining type mismatches.
   - Pay particular attention to places that previously used `as TranscriptState` or similar casting to bridge differences between local and shared types; those casts should become unnecessary once everything is aligned.

## Code references

- `apps/desktop/src/conversation/transcript/types.ts`
- `apps/desktop/src/conversation/transcript/state.ts`
- `apps/desktop/src/conversation/transcript/selectors.ts`
- `apps/desktop/src/conversation/components/ConversationTranscriptSection.tsx`
- `apps/desktop/src/conversation/components/TranscriptCells.tsx`
- `apps/desktop/src/conversation/__stories__/mocks/data.ts`
- `apps/desktop/src/conversation/__stories__/TranscriptList.stories.tsx`
- `apps/desktop/src/conversation/transcript/__tests__/transcript.test.ts`
- `apps/web/src/routes/s.$id.tsx`
- `apps/web/src/routes/api.share.tsx`
- `apps/web/src/components/transcript/TranscriptView.tsx`
- `apps/web/src/components/transcript/TranscriptCellRenderer.tsx`
- `packages/transcript-ui/src/types/index.ts`

