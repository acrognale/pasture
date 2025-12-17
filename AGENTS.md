# Pasture Agent Guide

Pasture is a GUI for Codex.

## Repository Orientation

- `apps/desktop/` – Pasture desktop workspace that bundles the React renderer and Tauri host.
  - `apps/desktop/src/` – React front-end that talks to the embedded Codex runtime via Tauri IPC.
  - `apps/desktop/src-tauri/` – Rust backend (Tauri v2) that manages the window lifecycle, menus, and Codex runtime.
- `apps/web/` – Web app allowing users to share threads with others.
- `packages/` – Shared libraries and UI/mocking utilities that can be consumed by any app in the monorepo.
  - `@pasture/theme` – shared design tokens and Tailwind merge config used by all apps (desktop, web, and `@pasture/transcript-ui`).
  - `@pasture/transcript-ui` – shared transcript UI components used by all apps.
  - `@pasture/protocol` – shared protocol definitions used by all apps.
  - `@pasture/configs` – shared configuration files used by all apps.
- `codex/` – Vendored Codex workspace (CLI, runtime crates, SDK, docs). Reference this when you need to inspect upstream Codex behavior.

## Environment & Commands

Node version: 22.14.0
Package manager: pnpm 10.9.0
Uses turborepo for monorepo management.

- Dev mode: `pnpm run dev` (launches the `apps/desktop` Vite + Tauri dev window with hot reload).
- Build/package: `pnpm run build` or `pnpm run package` (drives `tauri build` for the desktop app).
- Lint & formatting: `turbo lint`, `turbo format:check`, `turbo format:fix`, and `npm run format:rust`.
- Typechecking & tests: `turbo typecheck`, `turbo test`, `turbo test:watch`, `turbo test:coverage`.

## Workflow

Important: always run `turbo lint` and `turbo typecheck` when you finish making changes to verify there are no errors.

## Git Hygiene (Rebases / Stacked PRs)

- Prefer **non-interactive** rebases/cherry-picks. When continuing a rebase in automation, set `GIT_EDITOR=true` (and `GIT_SEQUENCE_EDITOR=true` for interactive rebases) to prevent hanging on an editor prompt.
- Before starting a rebase/cherry-pick, ensure there isn’t another Git process running (e.g. an interactive rebase/commit spawned by an IDE). A stuck `git commit` can surface as an `index.lock` error in worktree repos.
- If you hit an `index.lock` error:
  - Check for and stop the conflicting Git process, then retry.
  - Only delete a lock file if you’ve confirmed no Git process is active.
- Don’t leave half-finished operations: if conflicts can’t be resolved quickly, run `git rebase --abort` (or `git cherry-pick --abort`) and regroup.

## Design Tokens & Styling

- The single source of truth for colors, typography, radii, and transcript styles is the `@pasture/theme` package:
  - Tokens: `packages/theme/src/tokens.css`
  - Tailwind merge config: `packages/theme/src/tw-merge.ts`
- Every app (`apps/desktop`, `apps/web`, and shared packages like `@pasture/transcript-ui`) must import `@pasture/theme/tokens.css` in their global styles rather than defining their own color systems.
- Use semantic Tailwind utilities that map to theme tokens instead of hardcoded Tailwind colors or font sizes. Examples:
  - Surfaces/text: `bg-background`, `text-foreground`, `bg-card`, `bg-popover`, `border-border`, `text-muted-foreground`, `bg-sidebar`, `text-sidebar-foreground`, `bg-sidebar-accent`, `text-sidebar-accent-foreground`.
  - Transcript: `font-transcript`, `text-transcript-base`, `text-transcript-code`, `text-transcript-micro`, `leading-transcript`, `leading-transcript-code`, `rounded-transcript`, `text-transcript-muted-foreground`, `border-transcript-border`, etc.
  - Status/feedback: `text-success-foreground`, `text-error-foreground`, `bg-info`, `bg-success`, `bg-warning`, `bg-error`, and their `*-foreground` variants.
- Do not use raw Tailwind color tokens or arbitrary sizes like `bg-slate-950`, `bg-zinc-900`, `text-slate-400`, `text-[13px]`, etc. Always find or introduce an appropriate semantic token instead.
- When you need a new semantic token:
  - Add the underlying CSS variable in `packages/theme/src/tokens.css`.
  - Expose it via the `@theme` block (e.g. `--color-…`, `--text-…`, `--radius-…`).
  - Update `packages/theme/src/tw-merge.ts` so `twMerge` understands any new `text-*`, `leading-*`, `font-*`, `radius-*`, or `color-*` utilities.
- In React components, use the shared `cn` helper from `@pasture/theme` (or a thin app-local wrapper around it) for class name composition instead of custom `twMerge` setups in each app.

## TS <> Rust Contract

- Coordinate runtime contract changes across the Rust crates and Tauri client—update the Rust crate, regenerate types, and adjust any downstream wrappers in sync.
- Whenever you add a new Tauri command, register it in `tauri_command_definitions!` (`apps/desktop/src-tauri/src/protocol.rs`) so the generated TypeScript bindings stay current with the backend API.
- Use the generated Codex client (`apps/desktop/src/codex/client.ts`) in the front-end rather than calling `invoke` directly.
- After modifying command payloads or responses in Rust, run `npm run generate:types` (ts-export) so `apps/desktop/src/codex.gen` and `apps/desktop/src/codex/client.ts` stay in sync; consume the exported types instead of hand-writing interfaces.

## Notes

- You **MUST** escape dollar signs in file paths when using the shell tool.
- You must **NEVER** re-export types needlessly. If a type is already exported, use it directly.

## Github Workflows

- Validate changes to github workflows and actions with `actionlint`
