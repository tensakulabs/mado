# Requirements: Kobo

**Defined:** 2026-02-12
**Core Value:** Users can run multiple AI conversations simultaneously in a spatial interface, with sessions that persist across app restarts and changes tracked via local git.

## v1 Requirements

Requirements for initial release. Each maps to roadmap phases.

### Foundation

- [ ] **FOUND-01**: Daemon starts automatically when app launches
- [ ] **FOUND-02**: Daemon survives when Tauri app closes
- [ ] **FOUND-03**: App reconnects to running daemon on relaunch
- [ ] **FOUND-04**: Daemon handles crash recovery (stale socket cleanup)
- [ ] **FOUND-05**: Unix socket secured with 0600 permissions
- [ ] **FOUND-06**: PID file prevents duplicate daemon instances

### Terminal

- [ ] **TERM-01**: User can create new conversation pane
- [ ] **TERM-02**: User can split panes horizontally
- [ ] **TERM-03**: User can split panes vertically
- [ ] **TERM-04**: User can resize panes via drag handle
- [ ] **TERM-05**: User can resize panes via keyboard shortcut
- [ ] **TERM-06**: Active pane is visually highlighted
- [ ] **TERM-07**: Inactive panes are visually dimmed
- [ ] **TERM-08**: User can click to focus a pane
- [ ] **TERM-09**: User can scroll through conversation history
- [ ] **TERM-10**: User can copy text with Cmd+C
- [ ] **TERM-11**: User can paste text with Cmd+V
- [ ] **TERM-12**: User can close a conversation with undo option
- [ ] **TERM-13**: Terminal renders correctly on window resize
- [ ] **TERM-14**: Terminal output streams without memory leaks

### AI Integration

- [ ] **AI-01**: User can start new Claude CLI conversation in pane
- [ ] **AI-02**: User can select model (opus/sonnet/haiku)
- [ ] **AI-03**: Claude CLI runs in real PTY (preserves colors, escape sequences)
- [ ] **AI-04**: Interactive sub-processes (vim, git rebase) work inside conversation
- [ ] **AI-05**: API key stored securely (Keychain/libsecret)
- [ ] **AI-06**: Connection errors displayed clearly to user

### Versioning

- [ ] **VER-01**: Each conversation has local git repo in ~/.kobo/
- [ ] **VER-02**: User can save milestone (manual commit)
- [ ] **VER-03**: User can view timeline of saved milestones
- [ ] **VER-04**: User can restore to previous milestone
- [ ] **VER-05**: User can diff between milestones

### Change Indicators

- [ ] **CHNG-01**: Each pane shows [+N -M] change count
- [ ] **CHNG-02**: Change indicator updates in real-time as files change
- [ ] **CHNG-03**: User can click indicator to see file breakdown
- [ ] **CHNG-04**: Indicator shows 0 changes after save/commit

### Git View

- [ ] **GIT-01**: User can view staged and unstaged files in full-screen git view
- [ ] **GIT-02**: User can select a file and see its diff with syntax highlighting
- [ ] **GIT-03**: User can stage/unstage individual files (and optionally individual hunks)
- [ ] **GIT-04**: User can write a commit message and commit directly from the UI

### UX Polish

- [ ] **UX-01**: Command palette opens with Cmd+K
- [ ] **UX-02**: Command palette has fuzzy search
- [ ] **UX-03**: All actions accessible via command palette
- [ ] **UX-04**: Keyboard shortcuts use tmux-like prefix key
- [ ] **UX-05**: User can search within conversation (Cmd+F)
- [ ] **UX-06**: Status bar shows current model
- [ ] **UX-07**: Status bar shows connection status
- [ ] **UX-08**: Contextual hints appear for new users
- [ ] **UX-09**: Hints are dismissible and recallable
- [ ] **UX-10**: Destructive actions show preview before executing
- [ ] **UX-11**: Destructive actions have undo option (8-second window)
- [ ] **UX-12**: UI uses "Conversations" and "Spaces" vocabulary (no jargon)
- [ ] **UX-13**: Escape hatch: Home button returns to single-pane view

### Session Management

- [ ] **SESSION-01**: User can see all Claude sessions grouped by project with metadata (date, size, message count)
- [ ] **SESSION-02**: User can filter sessions by project, date range, or size
- [ ] **SESSION-03**: User can select multiple sessions and move them to Trash (recoverable)
- [ ] **SESSION-04**: User can view a session's transcript in a read-only viewer
- [ ] **SESSION-05**: User can see total storage usage and cleanup suggestions

### MCP Skills

- [ ] **MCP-01**: User can see all configured MCP servers with connection status
- [ ] **MCP-02**: User can enable/disable MCP servers per session or globally
- [ ] **MCP-03**: User can view tools provided by each MCP server with descriptions
- [ ] **MCP-04**: User can edit MCP server configuration (env vars, args) via settings UI
- [ ] **MCP-05**: User can search/filter MCP servers and tools by name or keyword

### Agent Management

- [ ] **AGENT-01**: User can see all available agents (built-in and custom)
- [ ] **AGENT-02**: User can create custom agent with name, prompt, model, and tools
- [ ] **AGENT-03**: User can edit or delete existing custom agent profiles
- [ ] **AGENT-04**: User can launch an agent session into a pane with one click
- [ ] **AGENT-05**: User can see which agent is running in each pane

### Pane Enhancement

- [ ] **PANE-01**: User can toggle pane zoom (fullscreen/restore) with Ctrl+B z
- [ ] **PANE-02**: User can resize active pane via Ctrl+B Ctrl+arrows
- [ ] **PANE-03**: User can swap active pane with sibling via Ctrl+B {/}
- [ ] **PANE-04**: User can flash pane numbers and jump via Ctrl+B q + number

### Search

- [ ] **SEARCH-01**: User can open search bar in active conversation with Cmd+F
- [ ] **SEARCH-02**: All matches highlighted in scrollback with auto-scroll to first match
- [ ] **SEARCH-03**: User can navigate between matches with match counter display

### Layout Enhancement

- [ ] **LAYOUT-01**: Pane layout persists and restores exactly across app restarts
- [ ] **LAYOUT-02**: User can cycle through layout presets with Ctrl+B space
- [ ] **LAYOUT-03**: Equal/tiled layout preset makes all panes the same size

### Windows

- [ ] **WIN-01**: User can create new window with independent pane set
- [ ] **WIN-02**: User can switch windows via Ctrl+B n/p and Ctrl+B 0-9
- [ ] **WIN-03**: User can rename a window
- [ ] **WIN-04**: User can see all windows in tab bar with active highlighted
- [ ] **WIN-05**: User can close a window with confirmation for active conversations

### Platform

- [ ] **PLAT-01**: App runs on macOS (Intel and Apple Silicon)
- [ ] **PLAT-02**: App runs on Linux (Ubuntu, Fedora)
- [ ] **PLAT-03**: Background throttling disabled (conversations don't die when minimized)

## v2 Requirements

Deferred to future release. Tracked but not in current roadmap.

### Enhanced Features

- **V2-01**: Conversation branching / forking at any point
- **V2-02**: Drag-and-drop pane rearrangement
- **V2-03**: Layout presets / templates (Focus, Side-by-side, Quad)
- **V2-04**: Timeline view with visual diff
- **V2-05**: Offline message queuing
- **V2-06**: Light mode theme
- **V2-07**: Config file (~/.koborc)
- **V2-08**: Windows support

### Advanced Features (v2+)

- **V2-09**: Plugin system
- **V2-10**: Full theming
- **V2-11**: Scripting/CLI automation
- **V2-12**: Multi-provider UI (GPT, Gemini, local models)

## Out of Scope

Explicitly excluded. Documented to prevent scope creep.

| Feature | Reason |
|---------|--------|
| Real-time collaboration / multiplayer | Enormous complexity (CRDT/OT), betrays single-user simplicity |
| Cloud sync | Requires server infrastructure, violates local-first principle |
| Built-in API management | Kobo wraps Claude CLI, doesn't replace it |
| Chat bubble UI | Wrong mental model - terminal rendering is the interface |
| Autonomous AI agent mode | Dangerous for non-technical users without understanding |
| Windows for v1 | Daemon uses Unix sockets; Windows requires different architecture |

## Traceability

Which phases cover which requirements. Updated during roadmap creation.

| Requirement | Phase | Status |
|-------------|-------|--------|
| FOUND-01 | Phase 1 | Pending |
| FOUND-02 | Phase 1 | Pending |
| FOUND-03 | Phase 1 | Pending |
| FOUND-04 | Phase 1 | Pending |
| FOUND-05 | Phase 1 | Pending |
| FOUND-06 | Phase 1 | Pending |
| TERM-01 | Phase 2 | Pending |
| TERM-02 | Phase 2 | Pending |
| TERM-03 | Phase 2 | Pending |
| TERM-04 | Phase 2 | Pending |
| TERM-05 | Phase 2 | Pending |
| TERM-06 | Phase 2 | Pending |
| TERM-07 | Phase 2 | Pending |
| TERM-08 | Phase 2 | Pending |
| TERM-09 | Phase 2 | Pending |
| TERM-10 | Phase 2 | Pending |
| TERM-11 | Phase 2 | Pending |
| TERM-12 | Phase 2 | Pending |
| TERM-13 | Phase 2 | Pending |
| TERM-14 | Phase 2 | Pending |
| AI-01 | Phase 3 | Pending |
| AI-02 | Phase 3 | Pending |
| AI-03 | Phase 3 | Pending |
| AI-04 | Phase 3 | Pending |
| AI-05 | Phase 3 | Pending |
| AI-06 | Phase 3 | Pending |
| VER-01 | Phase 4 | Pending |
| VER-02 | Phase 4 | Pending |
| VER-03 | Phase 4 | Pending |
| VER-04 | Phase 4 | Pending |
| VER-05 | Phase 4 | Pending |
| CHNG-01 | Phase 5 | Pending |
| CHNG-02 | Phase 5 | Pending |
| CHNG-03 | Phase 5 | Pending |
| CHNG-04 | Phase 5 | Pending |
| GIT-01 | Phase 7 | Pending |
| GIT-02 | Phase 7 | Pending |
| GIT-03 | Phase 7 | Pending |
| GIT-04 | Phase 7 | Pending |
| UX-01 | Phase 6 | Pending |
| UX-02 | Phase 6 | Pending |
| UX-03 | Phase 6 | Pending |
| UX-04 | Phase 6 | Pending |
| UX-05 | Phase 6 | Pending |
| UX-06 | Phase 6 | Pending |
| UX-07 | Phase 6 | Pending |
| UX-08 | Phase 6 | Pending |
| UX-09 | Phase 6 | Pending |
| UX-10 | Phase 6 | Pending |
| UX-11 | Phase 6 | Pending |
| UX-12 | Phase 6 | Pending |
| UX-13 | Phase 6 | Pending |
| SESSION-01 | Phase 8 | Pending |
| SESSION-02 | Phase 8 | Pending |
| SESSION-03 | Phase 8 | Pending |
| SESSION-04 | Phase 8 | Pending |
| SESSION-05 | Phase 8 | Pending |
| PANE-01 | Phase 11 | Pending |
| PANE-02 | Phase 11 | Pending |
| PANE-03 | Phase 11 | Pending |
| PANE-04 | Phase 11 | Pending |
| SEARCH-01 | Phase 12 | Pending |
| SEARCH-02 | Phase 12 | Pending |
| SEARCH-03 | Phase 12 | Pending |
| LAYOUT-01 | Phase 13 | Pending |
| LAYOUT-02 | Phase 13 | Pending |
| LAYOUT-03 | Phase 13 | Pending |
| WIN-01 | Phase 14 | Pending |
| WIN-02 | Phase 14 | Pending |
| WIN-03 | Phase 14 | Pending |
| WIN-04 | Phase 14 | Pending |
| WIN-05 | Phase 14 | Pending |
| MCP-01 | Phase 9 | Pending |
| MCP-02 | Phase 9 | Pending |
| MCP-03 | Phase 9 | Pending |
| MCP-04 | Phase 9 | Pending |
| MCP-05 | Phase 9 | Pending |
| AGENT-01 | Phase 10 | Pending |
| AGENT-02 | Phase 10 | Pending |
| AGENT-03 | Phase 10 | Pending |
| AGENT-04 | Phase 10 | Pending |
| AGENT-05 | Phase 10 | Pending |
| PLAT-01 | Phase 1 | Pending |
| PLAT-02 | Phase 1 | Pending |
| PLAT-03 | Phase 2 | Pending |

**Coverage:**
- v1 requirements: 85 total
- Mapped to phases: 85
- Unmapped: 0

---
*Requirements defined: 2026-02-12*
*Last updated: 2026-02-12 after roadmap creation*
