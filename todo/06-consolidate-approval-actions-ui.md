# Pasture transcript refactor – Task 06: consolidate approval actions UI in `@pasture/transcript-ui`

Pasture’s transcript UI is being refactored so both the desktop Tauri app and the web share app can share the same transcript view model and React components via the `@pasture/transcript-ui` package, backed by `@pasture/protocol`. The overall goals are:

- Define a single canonical transcript state and cell model that is rich enough for the desktop app and reused by the web app.
- Move layout and per-cell rendering into shared components, with per-host customization via well-typed overrides instead of ad‑hoc render functions.
- Consolidate approval / patch UI and platform services (clipboard, timestamps, image URLs, toasts) behind a shared `TranscriptProvider`.

This task focuses on the approvals UI. Right now, there are effectively two `ApprovalActions` implementations: one in the desktop approvals module and another in `@pasture/transcript-ui`. The goal is to treat the shared version as canonical and have the desktop use it, instead of duplicating logic.

## Task instructions

1. **Make the shared `ApprovalActions` component canonical**
   - Review `packages/transcript-ui/src/components/ApprovalActions.tsx` and ensure it:
     - Exposes the right props to support both exec and patch approvals (`ApprovalDecision`, `ApprovalType`, `isActive`, `queueSize`, `isPending`, `onApprove`, `onApproveForSession`, `onReject`).
     - Uses transcript design tokens and neutral HTML button primitives (no direct dependency on the desktop’s shadcn/ui `Button` component).
   - Adjust its styling if needed to match the visual design used in the desktop app while still staying self-contained inside the shared package.

2. **Refactor desktop to use the shared `ApprovalActions`**
   - In `apps/desktop/src/approvals/components/ApprovalActions.tsx`, replace the custom implementation with usage of the shared `ApprovalActions` from `@pasture/transcript-ui`.
     - You can either delete the desktop component entirely and update call sites to import from `@pasture/transcript-ui`, or keep a very thin wrapper that forwards props to the shared component (but avoid adding new re-export layers for types).
   - Update the desktop transcript components that currently import their own approval UI to use the shared component:
     - `apps/desktop/src/conversation/components/ExecutionApprovalContainer.tsx` should render `ExecutionApproval` from `@pasture/transcript-ui`, which itself uses the shared `ApprovalActions`.
     - `apps/desktop/src/conversation/components/PatchesContainer.tsx` should likewise rely on the shared `Patches` component and its usage of `ApprovalActions`.

3. **Ensure the approvals store and hooks still behave correctly**
   - Confirm that `useApprovals` and `useRespondToApproval` in the desktop app still receive the correct callbacks from containers and that:
     - The “active request” indication (`isActive`) reflects the approvals queue correctly.
     - “Approve”, “Approve for session”, and “Reject” buttons invoke the right mutations.
     - Queue size messaging (e.g., “N more queued”) reflects the approvals store state.

4. **Clean up duplicate types and exports**
   - Remove duplicate `ApprovalDecision` / `ApprovalType` type definitions from the desktop approvals module if they are now identical to the shared ones, or explicitly distinguish them only if there is a real semantic difference.
   - Do not introduce new needless type re-exports; where possible, import the canonical approval types directly from `@pasture/transcript-ui` or `@pasture/protocol`.

5. **Verify approvals UI in both transcript and non-transcript contexts**
   - Test exec approvals and patch approvals end-to-end in the desktop conversation UI to ensure the shared component behaves identically (or better) than the old one.
   - If there are any other approvals entry points in the desktop app (for example, a dedicated approvals panel), make sure they either use the shared component or intentionally diverge for UX reasons.

## Code references

- `packages/transcript-ui/src/components/ApprovalActions.tsx`
- `packages/transcript-ui/src/components/ExecutionApproval.tsx`
- `packages/transcript-ui/src/components/Patches.tsx`
- `apps/desktop/src/approvals/components/ApprovalActions.tsx`
- `apps/desktop/src/approvals/hooks/useApprovals.ts`
- `apps/desktop/src/approvals/hooks/useRespondToApproval.ts`
- `apps/desktop/src/conversation/components/ExecutionApprovalContainer.tsx`
- `apps/desktop/src/conversation/components/PatchesContainer.tsx`

