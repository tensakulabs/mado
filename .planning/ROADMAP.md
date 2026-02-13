# Roadmap: Kobo

## Overview

Kobo delivers a chat-friendly tmux for AI conversations through six phases that follow the critical dependency chain: daemon infrastructure, then terminal rendering, then Claude CLI integration, then the differentiating features (git versioning and change indicators), and finally UX polish. Each phase delivers a coherent, independently verifiable capability. The daemon-first architecture is the foundation -- getting it wrong poisons everything downstream.

## Phases

**Phase Numbering:**
- Integer phases (1, 2, 3): Planned milestone work
- Decimal phases (2.1, 2.2): Urgent insertions (marked with INSERTED)

Decimal phases appear between their surrounding integers in numeric order.

- [x] **Phase 1: Foundation** - Daemon lifecycle, IPC, and project scaffolding
- [x] **Phase 2: Terminal** - Multi-pane xterm.js rendering with PTY streaming
- [x] **Phase 3: Claude Integration** - Claude CLI as PTY process with model selection
- [x] **Phase 4: Versioning** - Local git repos with save, restore, and diff
- [x] **Phase 5: Change Indicators** - Real-time per-pane file change tracking
- [x] **Phase 6: Polish** - Command palette, keyboard shortcuts, and UX refinements

## Phase Details

### Phase 1: Foundation
**Goal**: The daemon infrastructure exists and works reliably -- daemon starts, persists, recovers from crashes, and the Tauri app connects/reconnects to it
**Depends on**: Nothing (first phase)
**Requirements**: FOUND-01, FOUND-02, FOUND-03, FOUND-04, FOUND-05, FOUND-06, PLAT-01, PLAT-02
**Success Criteria** (what must be TRUE):
  1. User launches the app and the daemon starts automatically without manual intervention
  2. User closes the app window and reopens it -- the daemon is still running and the app reconnects
  3. User force-kills the daemon, relaunches the app, and it recovers cleanly (no stale socket errors, no duplicate instances)
  4. App builds and runs on both macOS (Intel + Apple Silicon) and Linux (Ubuntu)
**Plans**: 3 plans (Wave 1 -> Wave 2 -> Wave 3)

Plans:
- [x] 01-01: Rust workspace scaffold + kobo-core types + kobo-daemon with axum over Unix socket (Wave 1)
- [x] 01-02: Daemon lifecycle -- PID file, daemonization, crash recovery, state persistence (Wave 2)
- [x] 01-03: Tauri app shell with daemon client, lifecycle management, and React status UI (Wave 3)

### Phase 2: Terminal
**Goal**: Users can create, split, resize, and interact with multiple terminal panes in a spatial layout with proper streaming and no memory leaks
**Depends on**: Phase 1
**Requirements**: TERM-01, TERM-02, TERM-03, TERM-04, TERM-05, TERM-06, TERM-07, TERM-08, TERM-09, TERM-10, TERM-11, TERM-12, TERM-13, TERM-14, PLAT-03
**Success Criteria** (what must be TRUE):
  1. User can create a new pane, split horizontally, split vertically, and resize panes with both mouse drag and keyboard shortcut
  2. User can click to focus a pane and see the active pane highlighted while inactive panes are visually dimmed
  3. User can scroll through terminal history, copy text with Cmd+C, and paste with Cmd+V
  4. User can close a conversation and immediately undo it within a short window
  5. Terminal output streams smoothly without memory leaks when the app runs for extended periods, and panes render correctly when the window is resized or minimized and restored
**Plans**: 3 plans (Wave 1 -> Wave 2 -> Wave 3)

Plans:
- [x] 02-01: PTY process management + session CRUD endpoints + SSE streaming (Wave 1)
- [x] 02-02: xterm.js terminal pane + PTY streaming via Tauri IPC (Wave 2)
- [x] 02-03: Multi-pane layout manager with Zustand + keyboard shortcuts (Wave 3)

### Phase 3: Claude Integration
**Goal**: Users can have real Claude CLI conversations inside panes with full terminal fidelity -- colors, interactive sub-processes, and model selection
**Depends on**: Phase 2
**Requirements**: AI-01, AI-02, AI-03, AI-04, AI-05, AI-06
**Success Criteria** (what must be TRUE):
  1. User can start a new Claude CLI conversation in any pane and interact with it naturally (typing, receiving streamed responses with colors and formatting preserved)
  2. User can select between opus, sonnet, and haiku models before or during a conversation
  3. Interactive sub-processes launched by Claude (vim, git rebase) work correctly inside the pane
  4. API key is stored securely (Keychain on macOS, libsecret on Linux) and connection errors are displayed clearly to the user
**Plans**: 2 plans (Wave 1 -> Wave 2)

Plans:
- [x] 03-01: Claude CLI as PTY process + model selection + fallback (Wave 1)
- [x] 03-02: Secure API key storage via OS keychain + setup UI (Wave 2)

### Phase 4: Versioning
**Goal**: Users can save milestones of their conversation workspace, view a timeline of saves, and restore or diff between them
**Depends on**: Phase 3
**Requirements**: VER-01, VER-02, VER-03, VER-04, VER-05
**Success Criteria** (what must be TRUE):
  1. Each conversation automatically has a local git repo backing it in ~/.kobo/
  2. User can save a milestone (with a description) and see it appear in a timeline of saved milestones
  3. User can select any two milestones and view a diff of what changed between them
  4. User can restore to any previous milestone and the conversation workspace reflects that state
**Plans**: 2 plans (Wave 1 -> Wave 2)

Plans:
- [x] 04-01: git2 integration + daemon endpoints + client methods for milestones (Wave 1)
- [x] 04-02: Timeline UI + save button + Tauri commands + IPC wrappers (Wave 2)

### Phase 5: Change Indicators
**Goal**: Users can see at a glance what files changed in each conversation's workspace and drill into the details
**Depends on**: Phase 4
**Requirements**: CHNG-01, CHNG-02, CHNG-03, CHNG-04
**Success Criteria** (what must be TRUE):
  1. Each pane displays a [+N -M] indicator showing the count of added and removed lines in the workspace
  2. The indicator updates in real-time as files change (without manual refresh)
  3. User can click the indicator to see a per-file breakdown of changes
  4. After saving a milestone, the indicator resets to show 0 changes
**Plans**: 1 plan

Plans:
- [x] 05-01: workspace_changes endpoint + polling hook + clickable indicator with file breakdown (Wave 1)

### Phase 6: Polish
**Goal**: All features are discoverable via command palette and keyboard shortcuts, the UX uses friendly vocabulary, and destructive actions are safe
**Depends on**: Phase 5
**Requirements**: UX-01, UX-02, UX-03, UX-04, UX-05, UX-06, UX-07, UX-08, UX-09, UX-10, UX-11, UX-12, UX-13
**Success Criteria** (what must be TRUE):
  1. User can open command palette with Cmd+K, fuzzy-search for any action, and execute it -- every app action is accessible through the palette
  2. User can perform all common actions via tmux-like keyboard shortcuts with a prefix key
  3. Status bar shows the current model and connection status at all times
  4. New users see contextual hints that are dismissible and can be recalled later; the UI consistently uses "Conversations" and "Spaces" vocabulary
  5. Destructive actions show a preview before executing and offer an undo option within an 8-second window; Home button returns to single-pane view as an escape hatch
**Plans**: 3 plans (Wave 1 -> Wave 2 -> Wave 3)

Plans:
- [x] 06-01: Command palette with fuzzy search (Cmd+K) (Wave 1)
- [x] 06-02: Status bar with model + connection status (Wave 2)
- [x] 06-03: Contextual hints + Home button + vocabulary updates (Wave 3)

## Progress

**Execution Order:**
Phases execute in numeric order: 1 -> 2 -> 3 -> 4 -> 5 -> 6

| Phase | Plans Complete | Status | Completed |
|-------|----------------|--------|-----------|
| 1. Foundation | 3/3 | Complete | 2026-02-12 |
| 2. Terminal | 3/3 | Complete | 2026-02-12 |
| 3. Claude Integration | 2/2 | Complete | 2026-02-12 |
| 4. Versioning | 2/2 | Complete | 2026-02-12 |
| 5. Change Indicators | 1/1 | Complete | 2026-02-12 |
| 6. Polish | 3/3 | Complete | 2026-02-12 |
