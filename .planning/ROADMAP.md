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
- [ ] **Phase 7: Git View** - Lazygit-style full UI for staging, diffs, and commits
- [ ] **Phase 8: Session Management** - View, filter, and clean up Claude CLI sessions across projects
- [ ] **Phase 9: MCP Skills** - Browse, configure, and manage MCP tool servers per session
- [ ] **Phase 10: Agent Management** - View, create, and launch custom AI agents from the GUI
- [ ] **Phase 11: Pane Enhancement** - Zoom toggle, keyboard resize, swap panes, select by number
- [ ] **Phase 12: Search** - Find-in-conversation search with highlight and navigation
- [ ] **Phase 13: Layout Enhancement** - Persistence across restarts, cycle presets, equal/tiled layout
- [ ] **Phase 14: Windows** - Tab-like window groups for organizing conversations into workspaces

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

### Phase 7: Git View
**Goal**: Users get a full lazygit-style interface when clicking [+ -] indicators -- view diffs, stage files, and commit directly from the UI
**Depends on**: Phase 5 (Change Indicators)
**Requirements**: GIT-01 (file list), GIT-02 (diff view), GIT-03 (staging), GIT-04 (commit)
**Success Criteria** (what must be TRUE):
  1. User clicks [+ -] indicator and sees a full-screen git view showing staged and unstaged files
  2. User can select a file and see its diff (added/removed lines with syntax highlighting)
  3. User can stage/unstage individual files (and optionally individual hunks)
  4. User can write a commit message and commit directly from the UI
  5. User can press back/Escape to return to the chat view
**Execution**: SWARM — Plans 07-01 (backend) and 07-02 (frontend) are independent and run in parallel
**Plans**: 3 plans (Wave 1: 07-01 + 07-02 parallel, Wave 2: 07-03)

Plans:
- [ ] 07-01: Backend git IPC commands (status, diff, add, reset, commit) — Wave 1
- [ ] 07-02: GitView component with file list and diff viewer — Wave 1 (parallel with 07-01)
- [ ] 07-03: Staging controls and commit UI — Wave 2 (depends on 07-01 + 07-02)

### Phase 8: Session Management
**Goal**: Users can view, filter, and clean up Claude CLI sessions across all projects with trash-based deletion
**Depends on**: Phase 6 (core app complete)
**Requirements**: SESSION-01, SESSION-02, SESSION-03, SESSION-04, SESSION-05
**Success Criteria** (what must be TRUE):
  1. User can see all Claude sessions grouped by project with metadata (date, size, message count)
  2. User can filter sessions by project, date range, or size
  3. User can select multiple sessions and move them to Trash (recoverable)
  4. User can view a session's transcript in a read-only viewer
  5. User can see total storage usage and cleanup suggestions
**Plans**: 3 plans (Wave 1 -> Wave 2 -> Wave 3)

Plans:
- [ ] 08-01: claude_sessions.rs module in daemon (scan, metadata, trash via `trash` crate) — Wave 1
- [ ] 08-02: IPC commands (claude_sessions_list, claude_sessions_delete, claude_sessions_transcript) — Wave 2
- [ ] 08-03: SessionManager UI component with filters, bulk select, and transcript viewer — Wave 3

### Phase 9: MCP Skills
**Goal**: Users can browse, enable/disable, and configure MCP tool servers directly from the GUI -- see what tools are available, check server status, and adjust settings without editing config files
**Depends on**: Phase 3 (Claude Integration)
**Requirements**: MCP-01, MCP-02, MCP-03, MCP-04, MCP-05
**Success Criteria** (what must be TRUE):
  1. User can see a list of all configured MCP servers with their connection status (connected, error, disabled)
  2. User can enable or disable an MCP server per session or globally and the change takes effect without restarting
  3. User can view the tools provided by each connected MCP server with name and description
  4. User can edit MCP server configuration (env vars, command args) through a settings UI
  5. User can search/filter MCP servers and tools by name or keyword
**Plans**: 3 plans (Wave 1 -> Wave 2 -> Wave 3)

Plans:
- [ ] 09-01: Backend MCP config reader (parse claude_desktop_config.json, query server status) — Wave 1
- [ ] 09-02: IPC commands (mcp_list, mcp_toggle, mcp_tools, mcp_configure) — Wave 2
- [ ] 09-03: MCP Manager UI component with server list, tool browser, and config editor — Wave 3

### Phase 10: Agent Management
**Goal**: Users can view available agents (built-in and custom), create custom agent profiles, and launch agent sessions into panes directly from the GUI
**Depends on**: Phase 3 (Claude Integration), Phase 8 (Session Management)
**Requirements**: AGENT-01, AGENT-02, AGENT-03, AGENT-04, AGENT-05
**Success Criteria** (what must be TRUE):
  1. User can see a list of all available agents (built-in types and custom agents from ~/.claude/custom-agents/)
  2. User can create a new custom agent with name, system prompt, model selection, and allowed tools
  3. User can edit or delete existing custom agent profiles
  4. User can launch an agent session into a new or existing pane with one click
  5. User can see which agent is running in each pane via a pane-level indicator
**Plans**: 3 plans (Wave 1 -> Wave 2 -> Wave 3)

Plans:
- [ ] 10-01: Backend agent discovery (scan built-in + custom-agents directory, parse agent configs) — Wave 1
- [ ] 10-02: IPC commands (agents_list, agent_create, agent_update, agent_delete, agent_launch) — Wave 2
- [ ] 10-03: Agent Manager UI with agent browser, profile editor, and launch controls — Wave 3

### Phase 11: Pane Enhancement
**Goal**: Pane management reaches tmux parity -- users can zoom, resize via keyboard, swap positions, and jump to panes by number
**Depends on**: Phase 2 (Terminal)
**Requirements**: PANE-01, PANE-02, PANE-03, PANE-04
**Success Criteria** (what must be TRUE):
  1. User can press Ctrl+B z to toggle a pane between fullscreen and its original layout position
  2. User can press Ctrl+B Ctrl+arrows to resize the active pane in that direction without touching the mouse
  3. User can press Ctrl+B { or } to swap the active pane with its sibling
  4. User can press Ctrl+B q to flash pane numbers, then press a number to jump to that pane
**Plans**: 2 plans (Wave 1 -> Wave 2)

Plans:
- [ ] 11-01: Pane zoom toggle + keyboard resize (store actions + useKeyboard bindings) — Wave 1
- [ ] 11-02: Swap panes + select-by-number (pane numbering UI + store actions) — Wave 2

### Phase 12: Search
**Goal**: Users can search within conversation output to find specific text, with match highlighting and prev/next navigation
**Depends on**: Phase 2 (Terminal)
**Requirements**: SEARCH-01, SEARCH-02, SEARCH-03
**Success Criteria** (what must be TRUE):
  1. User can press Cmd+F to open a search bar within the active conversation
  2. All matches are highlighted in the scrollback and the view scrolls to the first match
  3. User can press Enter/Shift+Enter or arrows to navigate between matches with a match counter (e.g., "3 of 12")
**Plans**: 1 plan

Plans:
- [ ] 12-01: Search bar component + xterm.js SearchAddon integration + keyboard bindings — Wave 1

### Phase 13: Layout Enhancement
**Goal**: Layouts persist across app restarts, can be cycled with a single keystroke, and include an equal/tiled preset
**Depends on**: Phase 2 (Terminal), Phase 11 (Pane Enhancement)
**Requirements**: LAYOUT-01, LAYOUT-02, LAYOUT-03
**Success Criteria** (what must be TRUE):
  1. User closes the app, reopens it, and the pane layout (splits, sizes, session assignments) is exactly restored
  2. User can press Ctrl+B space to cycle through layout presets (even, focus-left, focus-right, golden, tiled)
  3. An equal/tiled preset exists that makes all panes exactly the same size
**Plans**: 2 plans (Wave 1 -> Wave 2)

Plans:
- [ ] 13-01: Layout state serialization + persistence to daemon config — Wave 1
- [ ] 13-02: Cycle-layouts keybinding + equal/tiled preset — Wave 2

### Phase 14: Windows
**Goal**: Users can organize conversations into separate window groups (like tmux windows/tabs), switching between them to manage different workspaces
**Depends on**: Phase 2 (Terminal), Phase 8 (Session Management)
**Requirements**: WIN-01, WIN-02, WIN-03, WIN-04, WIN-05
**Success Criteria** (what must be TRUE):
  1. User can create a new window (tab) that has its own independent set of panes
  2. User can switch between windows via keyboard shortcut (Ctrl+B n/p for next/prev, Ctrl+B 0-9 for direct)
  3. User can rename a window to give it a descriptive label
  4. User can see all windows in a tab bar or list with the active window highlighted
  5. User can close a window (with confirmation if it has active conversations)
**Plans**: 3 plans (Wave 1 -> Wave 2 -> Wave 3)

Plans:
- [ ] 14-01: Window data model in pane store + daemon state persistence — Wave 1
- [ ] 14-02: Window tab bar UI component + switch/create/close actions — Wave 2
- [ ] 14-03: Keyboard shortcuts (Ctrl+B n/p/0-9/,) + command palette integration — Wave 3

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
| 7. Git View | 0/3 | Planned | - |
| 8. Session Management | 0/3 | Planned | - |
| 9. MCP Skills | 0/3 | Planned | - |
| 10. Agent Management | 0/3 | Planned | - |
| 11. Pane Enhancement | 0/2 | Planned | - |
| 12. Search | 0/1 | Planned | - |
| 13. Layout Enhancement | 0/2 | Planned | - |
| 14. Windows | 0/3 | Planned | - |

## Parking Lot

Features mentioned but not yet scoped:

- **Plugins** — Plugin architecture for extensibility (TBD)
