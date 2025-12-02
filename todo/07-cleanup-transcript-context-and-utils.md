# Pasture transcript refactor – Task 07: clean up `TranscriptContext` and transcript utilities

Pasture’s transcript UI is being refactored so both the desktop Tauri app and the web share app can share the same transcript view model and React components via the `@pasture/transcript-ui` package, backed by `@pasture/protocol`. The overall goals are:

- Define a single canonical transcript state and cell model that is rich enough for the desktop app and reused by the web app.
- Move layout and per-cell rendering into shared components, with per-host customization via well-typed overrides instead of ad‑hoc render functions.
- Consolidate approval / patch UI and platform services (clipboard, timestamps, image URLs, toasts) behind a shared `TranscriptProvider`.

This task focuses on tightening the `TranscriptContext` and related utilities so that shared components rely on the context consistently, and unused or misleading props are removed.

## Task instructions

1. **Remove unused timestamp props from shared components**
   - Audit `packages/transcript-ui/src/components` for `timestamp?: string` props that are declared but not used (e.g., `AgentMessage`, `AgentReasoning`, `ExecutionResult`, `Errors`, `ExplorationCell`, `StatusEvents`, `PlanUpdate`, `TaskLifecycle`, `UserMessage`).
   - Remove these unused props from component signatures and from all call sites in the desktop and web apps.
   - Keep timestamp *data* on the cells themselves; we can still surface timestamps in the future via context without threading pre-formatted strings through every component.

2. **Clarify and use `TranscriptContext` where appropriate**
   - Review `packages/transcript-ui/src/context/TranscriptContext.tsx` and its `TranscriptContext` type in `types/index.ts`.
   - Ensure that clipboard (`copyToClipboard`), timestamp formatting (`formatTimestamp`), image URL conversion (`convertImageSrc`), and toast notifications (`showToast`) are exposed only via the context and not imported directly from hard-coded utilities within shared components.
   - Where components currently import helpers like `copyToClipboard` directly from `lib/utils`, prefer to use `useTranscriptContext()` so hosts can override behavior (e.g., Tauri clipboard vs. browser clipboard, Tauri image URLs vs. HTTP URLs, desktop toasts vs. console logs).

3. **Make shared utilities safe across environments**
   - In `packages/transcript-ui/src/lib/utils.ts`, make sure `copyToClipboard` and other browser-specific helpers:
     - Gracefully handle environments where `navigator.clipboard` is unavailable (e.g., SSR or non-browser contexts).
     - Log failures in a way that doesn’t crash components.
   - Consider making the default `copyToClipboard` implementation a best-effort helper while encouraging host apps (desktop and web) to provide their own implementations via `TranscriptProvider`.

4. **Ensure desktop and web configure `TranscriptProvider` correctly**
   - In `apps/desktop/src/conversation/store/ConversationProvider.tsx`, confirm that:
     - The `TranscriptProvider` is wrapping all transcript UI.
     - `copyToClipboard`, `formatTimestamp`, `workspacePath`, `convertImageSrc`, and `showToast` are passed in correctly, using the desktop-specific runtime utilities (`copyToClipboard` from `~/lib/utils`, `formatTimestampClock` from `~/lib/time`, Tauri’s `convertFileSrc`, Sonner toasts).
   - In `apps/web/src/components/transcript/TranscriptView.tsx`, make sure that:
     - A `TranscriptProvider` is present and configured appropriately for the web environment (e.g., relying on the shared defaults or a minimal wrapper).

5. **Keep transcript design tokens usage consistent**
   - While making these changes, double-check that transcript components in `packages/transcript-ui` rely on the design tokens and Tailwind utilities emitted by `dist/index.css` (e.g., `font-transcript`, `text-transcript-base`, `leading-transcript`, token-based foreground colors) and do not introduce new hard-coded colors or font sizes.
   - If you need new token-like utilities for transcript components, add them carefully to the shared Tailwind config (`twMerge` config in `packages/transcript-ui/src/lib/utils.ts`) and follow the monorepo’s design token conventions.

6. **Run type-checks and smoke tests**
   - Run `turbo typecheck` and relevant tests after updating signatures and context usage to ensure no regressions.
   - Manually test clipboard, image preview, and basic transcript rendering in both the desktop and web apps to confirm context wiring still works as expected.

## Code references

- `packages/transcript-ui/src/context/TranscriptContext.tsx`
- `packages/transcript-ui/src/types/index.ts`
- `packages/transcript-ui/src/lib/utils.ts`
- `packages/transcript-ui/src/components/CopyButton.tsx`
- `packages/transcript-ui/src/components/ImagePreview.tsx`
- `packages/transcript-ui/src/components/UserMessage.tsx`
- `packages/transcript-ui/src/components/AgentMessage.tsx`
- `packages/transcript-ui/src/components/AgentReasoning.tsx`
- `packages/transcript-ui/src/components/ExecutionResult.tsx`
- `packages/transcript-ui/src/components/Patches.tsx`
- `packages/transcript-ui/src/components/StatusEvents.tsx`
- `packages/transcript-ui/dist/index.css`
- `apps/desktop/src/conversation/store/ConversationProvider.tsx`
- `apps/web/src/components/transcript/TranscriptView.tsx`

