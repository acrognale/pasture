# Pasture transcript refactor – Task 05: migrate desktop conversation transcript to `TranscriptView` + overrides

Pasture’s transcript UI is being refactored so both the desktop Tauri app and the web share app can share the same transcript view model and React components via the `@pasture/transcript-ui` package, backed by `@pasture/protocol`. The overall goals are:

- Define a single canonical transcript state and cell model that is rich enough for the desktop app and reused by the web app.
- Move layout and per-cell rendering into shared components, with per-host customization via well-typed overrides instead of ad‑hoc render functions.
- Consolidate approval / patch UI and platform services (clipboard, timestamps, image URLs, toasts) behind a shared `TranscriptProvider`.

This task assumes `TranscriptView` and its per-kind overrides API exist (Task 03) and that the apps are using the shared transcript types (Task 02). The goal here is to stop the desktop app from hand-rolling the transcript cell mapping and instead use `TranscriptView` with a small set of overrides that attach desktop-specific behavior.

## Task instructions

1. **Wire `ConversationTranscriptSection` to use `TranscriptView`**
   - In `apps/desktop/src/conversation/components/ConversationTranscriptSection.tsx`, replace the direct use of `TranscriptList` with the new `TranscriptView` component from `@pasture/transcript-ui`.
   - Pass the desktop transcript state (`turns` + `turnOrder`) into `TranscriptView` in the shape it expects (ideally as a canonical `TranscriptState` from the shared package).
   - Keep the existing autoscroll and “scroll to latest” behavior by continuing to manage `scrollContainerRef`, `bottomAnchorRef`, and `transcriptContentRef` around `TranscriptView`.

2. **Use per-kind overrides instead of a custom `TranscriptCells` switch**
   - Examine `apps/desktop/src/conversation/components/TranscriptCells.tsx` and identify which cell kinds require desktop-specific behavior:
     - `user-message` → retry/edit, message versions, workspace actions.
     - `agent-message` and `agent-reasoning` → streaming text animation.
     - `exec-approval`, `patch`, `patch-approval` → approvals hooks.
     - `tool` → richer MCP / web-search / view-image rendering.
   - Implement `TranscriptView` overrides for those kinds that:
     - Delegate to the existing containers (`UserMessageContainer`, `AgentMessageContainer`, `AgentReasoningContainer`, `ExecutionApprovalContainer`, `PatchesContainer`, `Tools`) where appropriate.
     - Use the shared components from `@pasture/transcript-ui` inside those containers (e.g., `UserMessage`, `AgentMessage`, `ExecutionApproval`, `Patches`, `Cell`, `CellIcon`).
   - Once the overrides are in place, simplify or remove `TranscriptCells.tsx` if it is no longer needed as a generic `switch (cell.kind)` mapper.

3. **Preserve the existing collapsing and animation behavior**
   - Ensure that the collapsing rules currently implemented by the shared `TranscriptList` (which came from the original desktop `TranscriptList` implementation) still behave as expected when used via `TranscriptView`.
   - Validate that turn expansion state (`expandedTurns`, `onToggleTurn`) continues to work when threaded through `TranscriptView` instead of a local `TranscriptList`.

4. **Clean up now-unused desktop-only components**
   - After migrating to `TranscriptView` overrides, remove any desktop components that only existed to support the old mapping and are now redundant (e.g., legacy `TranscriptList` or `CollapsedTranscriptSection` implementations that are fully replaced by the shared ones).
   - Be careful not to delete containers or hooks that still provide side-effects or business logic; only remove pure UI components that duplicate `@pasture/transcript-ui` behavior.

5. **Verify interaction flows in the desktop UI**
   - Manually or via tests, verify key flows in the desktop conversation pane:
     - Streaming agent messages and reasoning still animate correctly.
     - User message copy / retry / edit / version selection still work as before.
     - Exec approvals and patch approvals still integrate with the approvals store as expected.
     - MCP tooling and view-image cells still render correctly with the shared transcript components.

## Code references

- `apps/desktop/src/conversation/components/ConversationTranscriptSection.tsx`
- `apps/desktop/src/conversation/components/TranscriptCells.tsx`
- `apps/desktop/src/conversation/components/UserMessageContainer.tsx`
- `apps/desktop/src/conversation/components/AgentMessageContainer.tsx`
- `apps/desktop/src/conversation/components/AgentReasoningContainer.tsx`
- `apps/desktop/src/conversation/components/ExecutionApprovalContainer.tsx`
- `apps/desktop/src/conversation/components/PatchesContainer.tsx`
- `apps/desktop/src/conversation/components/Tools.tsx`
- `apps/desktop/src/conversation/hooks/useStreamingText.ts`
- `apps/desktop/src/conversation/hooks/useMessageVersions.ts`
- `packages/transcript-ui/src/components/TranscriptView.tsx`
- `packages/transcript-ui/src/components/UserMessage.tsx`
- `packages/transcript-ui/src/components/AgentMessage.tsx`
- `packages/transcript-ui/src/components/AgentReasoning.tsx`
- `packages/transcript-ui/src/components/ExecutionApproval.tsx`
- `packages/transcript-ui/src/components/Patches.tsx`

