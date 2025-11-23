# Thread-First Refactor Plan (Pasture)

This document describes how to make Pasture “thread‑first” while still using
Codex conversations/rollouts under the hood. It reflects these constraints:

- Threads are the primary unit of interaction.
- A conversation is a specific version of a thread.
- Rollouts are lower‑level artifacts that record a conversation’s
  trajectory on disk.
- Pasture only loads threads that it created and persisted itself.
  Sessions started in the Codex TUI/CLI are intentionally ignored.
- Routing in the GUI is by `threadId`, not by `conversationId`.
- The GUI surface should no longer expose conversation‑level listing/creation
  APIs; those become internal implementation details behind thread commands.

This plan focuses on the foundations: creating threads, loading them, and using
them as the top‑level UX container. Editing/forking (multiple rollouts per
thread) is an explicit later phase.

---

## 1. Terminology

- **Thread**
  - A logical conversation in the UI.
  - Identified by a stable `threadId` (UUID string) scoped to a workspace.
  - Owns one or more conversations (versions) over time.

- **Conversation (Codex)**
  - A specific version of a thread.
  - The runtime Codex session object used for streaming events.
  - Backed by a rollout file; the Pasture backend knows how to spawn,
    resume, and fork conversations.
  - Not a first‑class UX unit in Pasture once this refactor is complete.

- **Rollout**
  - The on‑disk recording of a conversation’s trajectory.
  - Implemented as a JSONL rollout file:
    `rollout-YYYY-MM-DDThh-mm-ss-<conversation-id>.jsonl`.
  - Identified by its path (`rollout_path`) and implicitly tied to a
    `ConversationId`.

The mapping we’re moving toward:

- Today: `thread ≈ conversation`, and each conversation has a rollout
  recording.
- Future: `thread` is stable; `conversation` is the versioned runtime
  unit; rollouts are the recording layer used to resume/fork those
  conversations.

---

## 2. Goals & Non‑Goals

### Goals

- Make Pasture GUI thread‑first:
  - Users create **threads**, not “sessions”/conversations.
  - The main navigation, routing, and state are keyed by `threadId`.
  - A brand‑new thread implicitly has a single initial rollout.
- Introduce thread lifecycle commands at the Tauri layer:
  - Create a thread and its initial rollout.
  - List threads for a workspace (from Pasture persistence only).
  - Initialize a thread by resuming its current rollout and subscribing
    to events.
- Prepare for future “edit message → fork rollout” semantics:
  - Threads can later hold multiple rollouts, one marked as current.
  - Forking a rollout reuses Codex’s existing fork semantics.

### Non‑Goals (for this phase)

- No changes to codex‑core or the Codex protocol:
  - Do not modify `SessionMeta`, `InitialHistory`, or add thread IDs to
    rollout metadata.
  - Do not change `ConversationManager::new_conversation`,
    `resume_conversation_from_rollout`, or `fork_conversation`.
- Do not load or surface rollouts discovered directly via
  `RolloutRecorder::list_conversations`:
  - We do not support browsing or resuming Codex TUI/CLI sessions.
  - Only threads that Pasture persisted are visible.
- Do not implement message editing / backtrack UI yet:
  - This plan only lays the groundwork so that forking can be layered
    on later.

---

## 3. Backend (Tauri) Design: Thread Primitives

### 3.1. Thread persistence in `WorkspaceManager`

Location: `apps/desktop/src-tauri/src/workspace_manager.rs`

Extend the workspace persistence state to track threads per workspace:

- `WorkspacePersistenceState` currently:
  - `recent: Vec<String>`
  - `workspace_defaults: HashMap<String, WorkspaceComposerDefaults>`
- Add:
  - `threads: HashMap<String /* normalizedWorkspacePath */, Vec<ThreadRecord>>`

Define a new serializable `ThreadRecord`:

- Fields (initial version):
  - `thread_id: String` (UUID string).
  - `created_at: String` (ISO timestamp).
  - `updated_at: String` (ISO timestamp; last activity).
  - `current_conversation_id: String` (Codex `ConversationId` string).
  - `rollouts: Vec<ThreadRollout>` (see below).
  - Optional UX metadata:
    - `title: Option<String>` (derived from first user message later).
    - `preview: Option<String>` (short human preview, redundant with
      non‑persistent list response, but can be useful for pre‑populating).

Define `ThreadRollout`:

- Fields:
  - `conversation_id: String`.
  - `rollout_path: String` (absolute path as string).
  - `created_at: String`.
  - Optional: `label: Option<String>` (e.g., “Original”, “Fork 1”).

Responsibilities:

- `WorkspaceManager` owns:
  - Adding a new `ThreadRecord` when a thread is created.
  - Updating `current_conversation_id`, `updated_at`, and appending a
    `ThreadRollout` when a rollout is created (initial or future forks).
  - Persisting threads in `WorkspacePersistenceState` via `save_state`.
- No automatic synthesis from existing rollout files:
  - Threads exist only if they were explicitly created and persisted by
    Pasture.
  - CLI/TUI sessions and pre‑existing rollout files are ignored.

### 3.2. Active conversation lookup for a thread

`ActiveConversation` remains a runtime cache of:

- `rollout_path: PathBuf`
- `cwd: PathBuf`
- `environment` cache
- `review_snapshots`

Extend `WorkspaceManager` with helpers:

- `get_threads_for_workspace(normalized_path: &str) -> Vec<ThreadRecord>`
- `get_thread(normalized_path: &str, thread_id: &str) -> Option<ThreadRecord>`
- `upsert_thread(normalized_path: &str, thread: ThreadRecord)`

Support mapping thread → active conversation:

- When a thread is created or its rollout changes:
  - Call `store_active_conversation(conversation_id, rollout_path, cwd)` as
    today to keep `ActiveConversation` in sync.
- For initialization:
  - Given `thread_id`, resolve `ThreadRecord` → `current_conversation_id`.
  - Resolve `ActiveConversation` via `get_active_conversation` using the
    current conversation id; if missing, reconstruct from `ThreadRollout`.

### 3.3. New thread lifecycle commands

Location: `apps/desktop/src-tauri/src/commands/conversations.rs`

Introduce new command types and handlers; register them in the Tauri command
registry and protocol macro so they are exported to TS via `ts-rs`.

#### 3.3.1. `ListThreads`

Command:

- `list_threads(ListThreadsParams) -> ListThreadsResponse`

Types:

- `ListThreadsParams`:
  - `workspace_path: String`
  - Optional pagination:
    - For simplicity, start without cursor/limit; add later if needed.
- `ListThreadsResponse`:
  - `items: Vec<ThreadSummary>`

`ThreadSummary`:

- Fields:
  - `thread_id: String`
  - `workspace_path: String` (normalized string).
  - `current_conversation_id: String`
  - `preview: String` (short description; can be derived on the fly or
    stored in `ThreadRecord`).
  - `timestamp: String` (last activity; from `ThreadRecord.updated_at`).
  - `rollout_count: usize`

Implementation:

- Normalize `workspace_path` via `WorkspaceManager::normalize_workspace_path`.
- Load `WorkspacePersistenceState`, fetch threads for that workspace.
- Map each `ThreadRecord` into a `ThreadSummary`.
- **Do not** call `RolloutRecorder::list_conversations`; threads are the
  sole source of truth for user‑visible sessions.

#### 3.3.2. `NewThread`

Command:

- `new_thread(NewThreadCommandParams) -> NewThreadResponse`

Types:

- `NewThreadCommandParams`:
  - `workspace_path: String`
  - `options: Option<NewConversationParams>` (reuse existing structure).
- `NewThreadResponse`:
  - `thread_id: String`
  - `conversation_id: String`
  - `model: String`
  - `rollout_path: String`

Implementation steps:

1. Normalize `workspace_path`; derive workspace root `cwd` as in
   `new_conversation`.
2. Apply `WorkspaceComposerDefaults` to incoming `options`.
3. Derive `Config` from `options` and base runtime config (reuse
   `derive_config_from_params`).
4. Call `ConversationManager::new_conversation(config)` (unchanged core).
5. Extract:
   - `conversation_id`
   - `session_configured.rollout_path`
6. Generate a new `thread_id` (UUID); capture `created_at`/`updated_at`.
7. Build a `ThreadRecord` with:
   - `thread_id`
   - `current_conversation_id = conversation_id`
   - `rollouts = [ThreadRollout { conversation_id, rollout_path, created_at }]`
8. Persist via `WorkspaceManager.upsert_thread(normalized_workspace, thread)`.
9. Call `store_active_conversation(conversation_id, rollout_path, cwd)` and
   cache workspace environment (as `new_conversation` does today).
10. Return `NewThreadResponse`.

#### 3.3.3. `InitializeThread`

Command:

- `initialize_thread(InitializeThreadParams) -> InitializeThreadResponse`

Types:

- `InitializeThreadParams`:
  - `thread_id: String`
  - `workspace_path: String`
- `InitializeThreadResponse`:
  - `session_configured: SessionConfiguredEvent`
  - `reasoning_summary: ReasoningSummary`

Implementation steps:

1. Normalize `workspace_path`.
2. Look up `ThreadRecord` for `(workspace, thread_id)`:
   - If missing, error `"Unknown thread"`.
3. Read `current_conversation_id` from the thread.
4. Resolve `ActiveConversation` via `get_active_conversation`:
   - If present, use its `rollout_path` and `cwd`.
   - If absent (e.g., fresh process), reconstruct from the `ThreadRollout`:
     - Use the rollout whose `conversation_id` matches
       `current_conversation_id`.
     - Re‑insert into `active_conversations` via `store_active_conversation`.
5. Clone runtime config; set `config.cwd` to the thread’s `cwd`.
6. Prepare environment:
   - Use `ActiveConversation.workspace_environment` to get env vars and
     embed into `config.shell_environment_policy`.
7. Call `ConversationManager::resume_conversation_from_rollout(config,
   rollout_path, auth_manager)` as in `initialize_conversation`.
8. Subscribe to events via `EventSubscriptionManager::subscribe` using
   `current_conversation_id` (preserving the existing streaming model).
9. Return `session_configured` and `reasoning_summary`.

### 3.4. Conversation‑level commands (backend)

The following backend commands remain, but are now considered internal
building blocks used by thread commands and the event pipeline:

- `send_user_message`
- `interrupt_conversation`
- `compact_conversation`
- `add_conversation_listener`
- `remove_conversation_listener`

They keep the same semantics (keyed by `conversation_id`) so that:

- Threads are resolved to a `conversation_id` when sending a message or
  interrupting.
- The event stream remains keyed by `conversation_id`, as expected by the
  front‑end conversation store.

The **conversation‑level listing/creation APIs** are no longer part of the
Pasture app surface:

- `list_conversations`
- `new_conversation`
- `initialize_conversation`

Plan:

1. Introduce and migrate to thread commands.
2. Update the TypeScript client so only thread equivalents are exported
   and used.
3. Once no code references the conversation‑level list/create/initialize
   commands, remove them from the Tauri command registry and TS bindings.

Core (`codex-core`) remains unchanged throughout.

---

## 4. Front‑End Design: Thread‑First GUI

### 4.1. Thread client API (`Codex.threads`)

Location: `apps/desktop/src/codex/client.ts`

Expose thread commands via a dedicated namespace:

- `Codex.threads.listThreads(params: ListThreadsParams): Promise<ListThreadsResponse>`
- `Codex.threads.newThread(params: NewThreadCommandParams): Promise<NewThreadResponse>`
- `Codex.threads.initializeThread(params: InitializeThreadParams): Promise<InitializeThreadResponse>`

The underlying types come from `codex.gen` generated from the Tauri
thread commands.

Remove or deprecate high‑level conversation APIs from the TS client:

- Stop exporting:
  - `listConversations`
  - `newConversation`
  - `initializeConversation`
- Keep lower‑level conversation methods that still make sense by ID:
  - `sendUserMessage`
  - `interruptConversation`
  - `compactConversation`
  - listener/approval utilities

### 4.2. Workspace provider: threads + conversations

Location: `apps/desktop/src/workspace/WorkspaceProvider.tsx`

Current responsibilities:

- Manages `ConversationStore`s keyed by `conversationId`.
- Exposes `loadConversation(conversationId)` and `getConversationStore`.
- Tracks open conversations in `openConversationIds: string[]`.

Updates:

1. **Introduce thread‑level state in the provider:**
   - New fields:
     - `openThreadIds: string[]`
     - `markThreadOpen(threadId: string)`
     - `closeThread(threadId: string)`
   - `openThreadIds` is in‑memory UI state only (not persisted).

2. **Thread loading:**
   - Add `loadThread(threadId: string, options?: { force?: boolean })`:
     - Marks the thread as open.
     - Calls `Codex.threads.initializeThread` to get
       `{ sessionConfigured, reasoningSummary }`.
     - Uses the returned `sessionConfigured` to obtain the active
       `conversation_id` and `initial_messages` (as today, but via thread).
     - Ensures there is a `ConversationStore` for that conversation id
       (via `createConversationStore`).
     - Replays `initial_messages` into the store.

3. **Conversation store remains conversation‑keyed:**
   - `getConversationStore(conversationId)` and the reducer remain
     unchanged.
   - Threads map to a current `conversationId` which is used to:
     - Feed events into the correct `ConversationStore`.
     - Bind the composer, transcript, and status to the correct store.

4. **Helpers:**
   - `useWorkspaceOpenThreads()` hook:
     - Returns `openThreadIds`.
   - Keep `useWorkspaceConversationStores()` for low‑level access, with
     thread‑aware helpers as needed (e.g., resolving thread → current
     conversationId in the future).

### 4.3. Thread‑based routing

Location: `apps/desktop/src/routes`

Introduce a thread route as the primary entry point:

- New route:
  - `'/workspaces/$workspaceId/threads/$threadId'`
  - Component: `ThreadPane`

`ThreadPane` responsibilities:

- Decode `workspaceId` into `workspacePath`.
- Call `loadThread(threadId)` via `WorkspaceProvider`.
- Resolve the active `conversationId` for this thread:
  - For the initial implementation, `conversationId` is the one returned
    during `initializeThread`.
  - Later, when multiple rollouts exist, `ThreadPane` will choose among a
    thread’s rollouts (e.g., current vs historical).
- Render `ConversationPane` (or a refactored inner component) with the
  resolved `conversationId` and `workspacePath`.

Existing route:

- `'/workspaces/$workspaceId/conversations/$conversationId'`

Migration plan:

1. Introduce the new thread route and have “New” navigate to it.
2. Keep the conversation route temporarily for backward compatibility and
   deep links while internals are being refactored.
3. Once thread routing is stable and all entry points use threads, remove
   the conversation route and its usages.

Key constraint: **UI always routes by `threadId`, not `conversationId`, in
the end state.**

### 4.4. Sidebar: open threads only

Location: `apps/desktop/src/workspace/SidebarPanel.tsx`

Current behavior:

- Displays “Sessions” using `useOpenWorkspaceConversations`, which is tied
  to conversation summaries.
- “New” uses `Codex.newConversation`.
- “Open” uses the conversation switcher to pick among sessions.

Updated behavior:

- Data source:
  - Introduce `useWorkspaceThreads` hook:
    - Calls `Codex.threads.listThreads` for the current workspace.
    - Returns `{ items: ThreadSummary[], query }`.
  - Introduce `useOpenWorkspaceThreads`:
    - Intersects `ThreadSummary` items with `openThreadIds` from the
      provider; only those appear in the sidebar.
- Rendering:
  - Replace `sessions: ConversationSummary[]` with
    `threads: ThreadSummary[]`.
  - Sidebar list shows only **open threads**.
  - The label can remain “Sessions” initially or be renamed to “Threads”.
- Interaction:
  - “New”:
    - Calls `Codex.threads.newThread({ workspacePath, options: null })`.
    - On success:
      - Add the new `threadId` to `openThreadIds`.
      - Navigate to `/workspaces/$workspaceId/threads/$threadId`.
  - “Open”:
    - The conversation switcher becomes a **thread switcher**:
      - It can show all threads returned by `listThreads` for the
        workspace.
      - Selecting one marks it open and navigates to its thread route.
  - Closing:
    - “Close” removes the thread from `openThreadIds`.
    - If the closed thread was active in a pane, navigate to another open
      thread if available, or to the workspace root route.

This satisfies:

- Sidebar shows only **open** threads.
- All navigation is by `threadId`.

### 4.5. Conversation pane remains conversation‑centric

Location: `apps/desktop/src/conversation/ConversationPane.tsx`

`ConversationPane` can stay focused on a single `conversationId`:

- It binds composer, transcript, status indicator, and review overlay to
  that `conversationId`.
- It does not need to know about threads; `ThreadPane` takes care of
  mapping thread → conversation.

Minor changes:

- Ensure `ConversationPane` is easily reusable:
  - Accept `workspacePath` and `conversationId` (as today).
  - Avoid assuming that `conversationId` is globally routed; treat it
    purely as a prop.

Message sending and other actions continue to use:

- `useSendMessage(workspacePath, conversationId)`
- `useInterruptConversation(conversationId)`
- Conversation store selectors keyed by `conversationId`.

---

## 5. Future Work: Multiple Rollouts per Thread (Editing/Forking)

This phase is **not** part of the initial implementation, but the above
design is intended to make it straightforward to add:

1. Extend `ThreadRecord.rollouts` with additional metadata (e.g., parent
   rollout, branch labels).
2. Add a thread‑level fork command in Tauri:
   - `fork_thread_rollout({ workspace_path, thread_id, base_conversation_id, nth_user_message })`
   - Implementation:
     - Use core’s `Op::GetPath` + `ConversationPathResponseEvent` to
       obtain a flushed rollout path (as the TUI does).
     - Call `ConversationManager::fork_conversation` with that path and
       nth user message.
     - Add a new `ThreadRollout` for the returned conversation.
     - Update `current_conversation_id` to point at the new rollout.
3. UI:
   - Expose editing/backtrack UI which computes `nth_user_message` from
     the transcript and calls `fork_thread_rollout`.
   - Add a simple rollout/version selector inside `ThreadPane` to allow
     switching between rollouts for the same thread.

These features will reuse the thread primitives defined in this document
without requiring changes to core.

---

## 6. Migration Steps Summary

1. **Backend: thread primitives**
   - Extend `WorkspacePersistenceState` with `threads` and define
     `ThreadRecord`/`ThreadRollout`.
   - Implement `list_threads`, `new_thread`, and `initialize_thread`
     commands.
   - Wire these into `WorkspaceManager` and the Tauri protocol; run
     `npm run generate:types`.

2. **Front‑end: thread client and provider**
   - Add `Codex.threads.*` wrappers.
   - Update `WorkspaceProvider`:
     - Add `openThreadIds` and thread helpers.
     - Add `loadThread(threadId)` using `Codex.threads.initializeThread`.

3. **Routing and sidebar**
   - Introduce `/workspaces/$workspaceId/threads/$threadId` route and
     `ThreadPane`.
   - Update `SidebarPanel` and workspace conversation switcher to work
     with threads:
     - “New” → `Codex.threads.newThread` → navigate to thread route.
     - “Open” → thread switcher.
     - Sidebar shows only open threads.

4. **Remove conversation‑level list/create from the GUI surface**
   - Stop calling `Codex.listConversations`, `Codex.newConversation`,
     and `Codex.initializeConversation`.
   - Remove those exports from `codex/client.ts`.
   - Optionally, remove the corresponding Tauri commands once fully
     unused.

5. **Prepare for editing**
   - Ensure thread persistence and thread routing are stable.
   - Document the expected fork flow for later implementation using
     `ConversationManager::fork_conversation` and `ConversationPath`.

At the end of this plan, Pasture is thread‑first: users create, open, and
navigate by threads, and each thread implicitly owns the current Codex
conversation/rollout used for streaming and persistence.
