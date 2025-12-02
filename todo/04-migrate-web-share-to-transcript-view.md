# Pasture transcript refactor – Task 04: migrate web share app to use `TranscriptView`

Pasture’s transcript UI is being refactored so both the desktop Tauri app and the web share app can share the same transcript view model and React components via the `@pasture/transcript-ui` package, backed by `@pasture/protocol`. The overall goals are:

- Define a single canonical transcript state and cell model that is rich enough for the desktop app and reused by the web app.
- Move layout and per-cell rendering into shared components, with per-host customization via well-typed overrides instead of ad‑hoc render functions.
- Consolidate approval / patch UI and platform services (clipboard, timestamps, image URLs, toasts) behind a shared `TranscriptProvider`.

This task assumes that `TranscriptView` and its overrides API exist in `@pasture/transcript-ui` (see Task 03) and focuses on simplifying the web share app to use the shared defaults with minimal customization.

## Task instructions

1. **Replace the web-specific cell renderer with `TranscriptView`**
   - In `apps/web/src/components/transcript/TranscriptView.tsx`, replace the current `TranscriptList` + `renderTranscriptCell` usage with the new `TranscriptView` component from `@pasture/transcript-ui`.
   - Use the canonical `TranscriptState` type from the shared package and pass it directly into `TranscriptView`.
   - Keep the existing `TranscriptProvider` wrapper so that clipboard, timestamp formatting, and token-based styles can be wired in per the shared context design.

2. **Remove or reduce `renderTranscriptCell` in the web app**
   - Inspect `apps/web/src/components/transcript/TranscriptCellRenderer.tsx` and identify behavior that differs from the shared default mapping (for example, how user messages are rendered and how tools are displayed).
   - Where possible, rely on the shared default behavior from `TranscriptView` instead of maintaining a separate mapping; the share view is intentionally read-only and should avoid side-effects like approvals or retries.
   - If any remaining customization is needed for the share view (e.g., a slightly different treatment for `tool` or `generic` cells), replace the generic `renderTranscriptCell` with a small `overrides` object passed into `TranscriptView` rather than a full `switch (cell.kind)`.

3. **Ensure the share route passes the canonical transcript through unmodified**
   - Confirm that `apps/web/src/routes/s.$id.tsx` still:
     - Treats `result.transcript` from the database as a `TranscriptState` from `@pasture/transcript-ui`.
     - Passes that transcript directly into the new `TranscriptView` component.
   - Avoid transforming the transcript structure in the web app; it should match the canonical view model used by the desktop.

4. **Clean up unused code and validate behavior**
   - Remove any now-unused helpers, types, or components from `apps/web/src/components/transcript` that were only needed to support the old `TranscriptList + renderTranscriptCell` approach.
   - Verify that a shared thread rendered via `/s/:id` matches expectations:
     - Transcript layout and collapsing mirror the desktop behavior where appropriate.
     - No desktop-only actions (approvals, retries, editing) are present in the share view.
     - Styles are consistent with the transcript design tokens imported via `@pasture/transcript-ui/tokens.css`.

## Code references

- `apps/web/src/components/transcript/TranscriptView.tsx`
- `apps/web/src/components/transcript/TranscriptCellRenderer.tsx`
- `apps/web/src/routes/s.$id.tsx`
- `apps/web/src/routes/api.share.tsx`
- `apps/web/src/styles.css`
- `packages/transcript-ui/src/components/TranscriptView.tsx` (added in Task 03)
- `packages/transcript-ui/src/context/TranscriptContext.tsx`

