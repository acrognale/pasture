# Pasture Agent Guide

Pasture is a GUI for Codex.

## Repository Orientation

- `apps/desktop/` – Pasture desktop workspace that bundles the React renderer and Tauri host.
  - `apps/desktop/src/` – React front-end that talks to the embedded Codex runtime via Tauri IPC.
  - `apps/desktop/src-tauri/` – Rust backend (Tauri v2) that manages the window lifecycle, menus, and Codex runtime.
- `packages/` – Shared libraries and UI/mocking utilities that can be consumed by any app in the monorepo.
- `codex/` – Vendored Codex workspace (CLI, runtime crates, SDK, docs). Reference this when you need to inspect upstream Codex behavior.

## Codex Code

If the user instructs you to take a look at the Codex code, such as the TUI, inspect the Codex crates from `~/.cargo/git/checkouts/codex-<hash>`.

## Environment & Commands

- Use Node 22+; run `npm install` at the repo root to hydrate all workspaces (including `apps/desktop`).
- Dev mode: `npm run dev` (launches the `apps/desktop` Vite + Tauri dev window with hot reload).
- Build/package: `npm run build` or `npm run package` (drives `tauri build` for the desktop app).
- Lint & formatting: `npm run lint`, `npm run format:check`, `npm run format:fix`, and `npm run format:rust`.
- Typechecking & tests: `npm run typecheck`, `npm run test`, `npm run test:watch`, `npm run test:coverage`.
- The Tauri backend embeds the Codex runtime directly via `codex_core` crates rather than spawning a separate process.

## Architecture Overview

- **Rust backend (`apps/desktop/src-tauri/src/`)** owns Tauri lifecycle, native window management, menu bar, logging, and embeds the Codex runtime.
- **Codex runtime** (`apps/desktop/src-tauri/src/codex_runtime.rs`) wraps `codex_core` crates (AuthManager, ConversationManager) and provides direct access without IPC overhead.
- **Tauri commands** (`apps/desktop/src-tauri/src/commands.rs`) expose Rust functions to the front-end via `#[tauri::command]` macros with type-safe IPC.
- **Front-end (`apps/desktop/src/`)** is a React application.

## Project Structure Highlights

- `apps/desktop/src-tauri/src/lib.rs` – Tauri entry point; initialize plugins, register commands, set up menu bar and window.
- `apps/desktop/src-tauri/src/commands.rs` – Tauri command handlers for workspace operations, conversation management, and app state.
- `apps/desktop/src-tauri/src/menu.rs` – Native menu bar construction with dynamic workspace menus.
- `apps/desktop/src-tauri/src/codex_runtime.rs` – Embedded Codex runtime wrapping AuthManager and ConversationManager from codex_core.
- `apps/desktop/src-tauri/src/event_listener.rs` – Event subscription manager for streaming conversation events to the front-end.
- `apps/desktop/src-tauri/src/workspace_manager.rs` – Workspace state persistence and window context management.
- `apps/desktop/src-tauri/tauri.conf.json` – Tauri configuration (window settings, permissions, build config).
- `apps/desktop/src-tauri/tauri.dev.conf.json` – Dev-mode overrides (dev icons, window settings).
- `apps/desktop/src/app/` – Global providers (`CodexProvider`), hooks, and shared utilities.
- `apps/desktop/src/components/` – Presentational primitives.
- `apps/desktop/src/codex/` – Front-end Codex domain (queries, transcript reducer, runtime helpers, composer state).

## Design Tokens & Styling

**Always reference `apps/desktop/src/index.css` for design tokens—do not use hardcoded Tailwind colors or arbitrary font sizes.** Use semantic utilities like `text-transcript-base`, `leading-transcript`, `text-success-foreground`, `text-error-foreground`, etc. Hardcoded values like `text-[13px]`, `text-emerald-700`, or `text-rose-600` should be replaced with the appropriate design token. You must also update `apps/desktop/src/lib/utils.ts#twMerge` with any tokens you add.

## TS <> Rust Contract

- Coordinate runtime contract changes across the Rust crates and Tauri client—update the Rust crate, regenerate types, and adjust any downstream wrappers in sync.
- Whenever you add a new Tauri command, register it in `tauri_command_definitions!` (`apps/desktop/src-tauri/src/protocol.rs`) so the generated TypeScript bindings stay current with the backend API.
- Use the generated Codex client (`apps/desktop/src/codex/client.ts`) in the front-end rather than calling `invoke` directly.
- After modifying command payloads or responses in Rust, run `npm run generate:types` (ts-export) so `apps/desktop/src/codex.gen` and `apps/desktop/src/codex/client.ts` stay in sync; consume the exported types instead of hand-writing interfaces.

## Github Workflows

- Validate changes to github workflows and actions with `actionlint`
