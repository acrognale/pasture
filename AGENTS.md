# Pasture Agent Guide

Pasture is a GUI for Codex.

## Repository Orientation

- `apps/desktop/` – Pasture desktop workspace that bundles the React renderer and Tauri host.
  - `apps/desktop/src/` – React front-end that talks to the embedded Codex runtime via Tauri IPC.
  - `apps/desktop/src-tauri/` – Rust backend (Tauri v2) that manages the window lifecycle, menus, and Codex runtime.
- `apps/web/` – Web app allowing users to share threads with others.
- `packages/` – Shared libraries and UI/mocking utilities that can be consumed by any app in the monorepo.
- `codex/` – Vendored Codex workspace (CLI, runtime crates, SDK, docs). Reference this when you need to inspect upstream Codex behavior.

## Codex Code

If the user instructs you to take a look at the Codex code, such as the TUI, inspect the Codex crates from `~/.cargo/git/checkouts/codex-<hash>`.

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

## Design Tokens & Styling

**Always reference `apps/desktop/src/index.css` for design tokens—do not use hardcoded Tailwind colors or arbitrary font sizes.** Use semantic utilities like `text-transcript-base`, `leading-transcript`, `text-success-foreground`, `text-error-foreground`, etc. Hardcoded values like `text-[13px]`, `text-emerald-700`, or `text-rose-600` should be replaced with the appropriate design token. You must also update `apps/desktop/src/lib/utils.ts#twMerge` with any tokens you add.

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
