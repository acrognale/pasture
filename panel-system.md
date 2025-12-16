# Panel System Spec (Desktop)

This document proposes a VS Code–inspired UI composition system for Pasture Desktop that replaces ad-hoc “open booleans + inline JSX” panes with:

- **Dockable Panels**: tabbed + splittable surfaces (like VS Code Editor/Panel areas).
- **Sidebar Views**: stacked, collapsible sections inside the left sidebar (like VS Code Side Bar views).
- **Navigation & Linking**: panes/views link to each other via typed intents, not direct imports or `window` events.

It is designed to be adopted incrementally without a full rewrite.

## Goals

- Standardize how “things that can open” are registered, created, focused, moved, closed, and persisted.
- Enable multiple panel kinds (Review, Review Map, File, Tools, etc.) with a consistent lifecycle.
- Support docking behaviors: tab groups, splits, drag/drop, resizing.
- Support showing multiple threads at once by allowing the transcript surface to be split/tabbed like an editor area.
- Keep Sidebar “views” (e.g. Changes) distinct from dockable panels, following VS Code’s mental model.
- Replace global `window.dispatchEvent` UI coupling with a typed navigation/command layer.
- Persist user layout preferences (per thread / per conversation / per workspace as chosen).

## Non-Goals (initially)

- Full VS Code extension platform or document model.
- Arbitrary nesting of panels into the sidebar and vice versa (keep regions distinct).
- Cross-window docking (multiple OS windows) and remote collaboration.

---

## Vocabulary

This section defines the terms used across code and documentation.

### Regions (VS Code–inspired)

- **Activity Bar**: icon strip selecting a container of views (Explorer/Search/SCM/…).
- **Side Bar**: the left column that displays views for the selected container.
- **View Container**: a collection of views shown in the Side Bar (e.g. “Changes”, “Threads”, “Search”).
- **View**: a section inside the Side Bar, typically collapsible (e.g. “Changes”, “Repositories”).
- **Dock Area**: an area that can host dockable panels via tab groups and splits.
  - Pasture may have multiple dock areas (recommended): a primary **Editor Dock** and a secondary **Utility Dock**.
- **Editor Dock**: the primary dock area used for “document-like” surfaces that users expect to tab/split (threads, files).
- **Utility Dock**: an optional secondary dock area for utility surfaces (review map, tools, logs), typically adjacent to the Editor Dock.

### Panels (Dockable)

- **Panel Kind**: a registered panel type (e.g. `conversation.review`). Analogous to a “contribution”.
- **Panel Instance**: a concrete opened panel tab created from a panel kind + params.
- **Panel Host**: a component that renders a dock layout for a given scope/context (hosted by a route).
- **Host ID**: unique identifier for a host context (e.g. a specific conversation view).
- **Panel Group**: a tab group containing one or more panel instances, with one active tab.
- **Split Node**: a layout node that splits space into children (row/column), with persisted sizes.
- **Dock Layout Tree**: the serializable tree composed of Split Nodes and Panel Groups.

### Data & Lifecycles

- **Params**: immutable-ish parameters describing what an instance is “about” (conversationId, filePath, etc.).
- **State**: persistent-ish UI state owned by the panel instance (selectedStepId, activeFilePath, etc.).
- **Reveal**: a one-shot, transient instruction sent to an existing instance (focus file, jump to range).
  - Reveal is not normal panel state; it is consumed and cleared by the instance.
- **Dedupe Key**: a deterministic key used to reuse an existing instance instead of creating a new one.
  - Example: “one Review per conversation”, or “one File tab per filePath”.

### Navigation & Linking

- **Navigation Intent**: a typed, serializable request to “go to” something (file, conversation, review, …).
- **Resolver**: maps intents to concrete open/focus/reveal actions in the current UI configuration.
- **Link Group**: an optional grouping ID that couples panels so navigation prefers opening alongside related panes.
  - Similar in spirit to VS Code’s notion of editor group behavior and “reveal in side-by-side”.

---

## Mental Model: How VS Code Works (and Pasture Mapping)

VS Code has:

- **Side Bar Views**: navigation + metadata (Explorer/Search/SCM).
- **Editor Area**: tabbed documents, split into groups.
- **Panel Area**: utility surfaces (Problems/Output/Terminal), dockable and movable.

For Pasture (recommended):

- **Side Bar (Views)**: Threads, Changes, Search, etc.
- **Editor Dock (Panels)**: thread transcript+composer, file viewer/editor, review diffs (tabbed + split, multiple threads visible).
- **Utility Dock (Panels)**: review map, tool runs, logs (optional secondary region).

Key design rule:

> “Changes” is a Side Bar **View**, not a dockable Panel. Clicking it may open/focus Panels in the dock.

---

## System Components

### 1) Panel Registry (Panel Kinds)

The Panel Registry is the catalog of all panel kinds that can be opened.

Each panel kind defines:

- `kindId`: stable string identifier (e.g. `conversation.review`).
- `title(params, state?)`: display label for tabs.
- `icon?`: optional icon.
- `scope`: where it may be hosted (`conversation` | `workspace` | `app`).
- `dedupeKey(params)`: optional, to reuse an existing instance.
- `load()`: lazy-load the React component for rendering.
- `serializeState(state)` / `deserializeState(json)`: optional per-panel state persistence.

Panel kinds should not import the dock layout engine; they declare capabilities and render UI.

### 2) Panel Manager (Instances + Dock Layout)

The Panel Manager owns:

- Panel instances: `{ instanceId, kindId, params, state, linkGroupId? }`
- Layout per host: a `DockLayoutTree`
- Active tracking per host: “which group/tab is focused”
- Operations:
  - `open(hostId, kindId, params, { location?, dedupe?, linkGroup? })`
  - `close(hostId, instanceId)`
  - `focus(hostId, instanceId)`
  - `reveal(hostId, instanceId, revealPayload)`
  - `move(instanceId, fromGroupId, toGroupId, index?)`
  - `split(groupId, direction, initialRatio)`
  - `resize(splitId, sizes)`

The manager should be the only place that mutates layout, so persistence and undo/redo (later) are centralized.

### 3) Panel Host (UI)

The Panel Host:

- Receives `hostId` and renders the dock layout.
- Implements drag/drop for tabs and edge drop zones for splitting.
- Implements resize handles that update split sizes via the Panel Manager.
- Mounts each panel’s view component and supplies a panel runtime context:
  - `params`, `state`, `setState`
  - `reveal`, `consumeReveal`
  - `navigate(intent)` (see navigation section)
  - `host` metadata (hostId, scope)

### 4) View Registry (Sidebar Views)

Sidebar “views” are registered separately from panels.

Each view defines:

- `viewId`: stable string identifier (e.g. `sidebar.changes`).
- `containerId`: which view container it belongs to (e.g. `container.scm`).
- `title`, `icon?`, `order?`, `collapsible?`, `defaultCollapsed?`
- `render(props)` with access to the current workspace/thread selection and a navigation API.

The View system does not support arbitrary splits; it is a vertical stack with collapsible sections.

### 5) View Containers (Sidebar Composition)

A “View Container” groups views and maps to Activity Bar selection.

Examples:

- `container.workspace` (threads, recent)
- `container.scm` (changes, repo presets)
- `container.search` (search input + results)

Pasture may start with a single container and add Activity Bar later. The container concept still helps structure registrations.

---

## Navigation & Linking Between Panes/Views

### Design Principle

Panels and views do not directly open each other by importing concrete components. Instead, they:

1) emit a **Navigation Intent** (serializable object), and
2) the host resolves it into open/focus/reveal behavior.

This prevents tight coupling and supports future layout changes.

### Navigation Intent Shape

Intents should be stable, serializable, and minimally sufficient:

- `target: 'file' | 'conversation' | 'review' | 'reviewMap' | ...`
- `workspacePath?`
- `conversationId?`
- `filePath?`
- `selection?` (line/column range)
- `turnId?`, `cellId?` (for transcript jumps)
- `mode?` + `repoParams?` (for review mode)
- `sourceInstanceId?` (optional, for link group routing)

Example intents:

- “Open file at selection”
  - `{ target: 'file', workspacePath, filePath, selection }`
- “Jump transcript to a tool cell”
  - `{ target: 'conversation', conversationId, turnId, cellId }`
- “Open review focused on a file”
  - `{ target: 'review', conversationId, mode: 'repo', repoParams, filePath }`

### Resolver Responsibilities

The resolver:

- Chooses a panel kind to satisfy a target (e.g. `target:'file'` → `editor.file` panel kind).
- Determines where to open it:
  - same group vs side-by-side split
  - prefer a group linked by `linkGroupId`
  - fall back to default placement rules per host
- Applies `open` vs `reveal` semantics:
  - **open**: create/focus an instance (dedupe if configured)
  - **reveal**: deliver one-shot focus/selection to an existing instance

### Link Groups (Optional Coupling)

Link groups enable behaviors like:

- Review panel left + File panel right stay paired.
- Clicking “Open file” from Review prefers opening in the paired group, not stealing focus elsewhere.

Mechanics:

- Panel instances can carry `linkGroupId`.
- Navigation requests include `sourceInstanceId`.
- Resolver uses `sourceInstanceId` → `linkGroupId` to choose a destination group.

This should be optional and introduced after MVP.

---

## Persistence

Persist per-host layout and panel instance summaries using a versioned schema.

Recommended keys (example):

- `pasture.panels.layout:v1:${workspaceKey}:${threadId ?? conversationId}`

Persist:

- Dock layout tree (splits/groups/tabs + sizes)
- For each instance: `{ kindId, params, state (serialized), linkGroupId? }`
- Active group/tab selection

Guidance:

- Schema should be forward-compatible: unknown panel kinds are dropped or replaced with placeholders.
- Keep params/state small; store references, not large payloads.

---

## Default Layout (Conversation Host)

MVP recommended layout:

- Editor Dock: opens a `conversation.thread` panel for the active thread by default.
- Utility Dock: initially empty (or hidden until first utility panel opens).
- When opening a panel, default placement rules:
  - `conversation.thread` and `editor.file` open in the Editor Dock (tabbed/splittable).
  - `conversation.reviewMap`, `conversation.tools`, `conversation.logs` open in the Utility Dock (unless explicitly requested in the Editor Dock).

Responsive behavior:

- Desktop: Editor Dock + Utility Dock side-by-side (row split) by default.
- Narrow screens: stacked (column split), with the Utility Dock above/below depending on UX preference.

---

## Migration Plan (Incremental)

### Phase 0: Identify “pane” entry points (today)

Current behavior includes:

- `window.dispatchEvent` for opening Review/Review Map overlays.
- `ConversationPane` renders two ad-hoc panes with bespoke resize state.

### Phase 1: Introduce registries + manager + host (no drag/drop yet)

- Implement Panel Registry and Panel Manager.
- Implement Panel Host capable of:
  - opening/closing tabs
  - basic split layout (if needed)
  - resizing (replace bespoke width state)
- Register `conversation.thread` as a panel kind (transcript + composer).
- Register existing Review and Review Map as panel kinds.
- Render thread + utilities through dock hosts rather than inline conditionals in `ConversationPane`.

### Phase 2: Replace global window events with commands/intents

- Replace `window.dispatchEvent` calls with `navigate(intent)` or `commands.execute(...)`.
- Allow multiple subscribers:
  - conversation host opens panels
  - sidebar views can update their own internal selection state when relevant

During migration, provide a thin shim so existing dispatch sites keep working until removed.

### Phase 3: Tabs + reorder within group

- Introduce tab strip UI.
- Drag to reorder tabs within a group.

### Phase 4: Drag-to-split + cross-group moves + persistence

- Add edge drop zones and split creation.
- Allow moving tabs across groups.
- Persist layout/state by host.

### Phase 5: “New Panel…” affordance

- Add UI entry points:
  - header button, context menu, or command palette later
- Panels can also be opened by deep links from transcript cells and sidebar views.

---

## Panel/Views You Likely Want (High Level)

### Sidebar Views

- `sidebar.threads`: thread list / recent
- `sidebar.changes`: “repo” vs “thread” changes (current “Changes” section)
- `sidebar.search`: workspace/conversation search (future)

### Dockable Panels

- `conversation.thread`: transcript + composer for a thread/conversation (editor-like; supports splitting to show multiple threads)
- `conversation.review`: turn/repo review diffs
- `conversation.reviewMap`: review map navigator
- `editor.file`: file viewer/editor (document-like)
- `conversation.tools`: tool runs / outputs (future)
- `conversation.logs`: debugging / events jsonl (future)

---

## Mapping: Current Review/ReviewMap → Panels

Current:

- `ConversationPane` owns open/close booleans, widths, and focus props.
- Other features open overlays via `dispatchOpenReviewOverlayEvent(...)`, etc.

Target:

- Review and Review Map are panel kinds registered in the panel registry.
- The transcript/composer surface becomes a `conversation.thread` panel kind hosted in the Editor Dock, enabling multiple threads via splits/tabs.
- “Open review” becomes a navigation intent:
  - `navigate({ target: 'review', conversationId, mode, repoParams?, filePath?, lineRange? })`
- Focus behavior is handled as a `reveal` payload delivered to the panel instance.
- Sidebar “Changes” view can still react to review navigation (e.g. update repo preset) as a separate subscriber.
