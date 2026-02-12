# Project Research Summary

**Project:** Kobo - Chat-friendly tmux for AI conversations
**Domain:** Desktop terminal multiplexer with AI integration (Tauri v2 + xterm.js + Rust daemon)
**Researched:** 2026-02-12
**Confidence:** HIGH

## Executive Summary

Kobo is a desktop application that bridges the tmux terminal multiplexer UX with modern AI chat interfaces. Expert consensus strongly favors a daemon-first architecture where a persistent Rust daemon owns Claude CLI processes inside PTYs, while a Tauri v2 app acts as a thin client/viewer. This architectural decision is non-negotiable - it's the only way to achieve true session persistence across app restarts, which is the core differentiator.

The recommended stack is mature and proven: Tauri v2 (desktop shell), xterm.js v6 (terminal rendering with WebGL acceleration), React 19 (UI), and Rust with portable-pty (daemon process management). The critical success factors are: (1) building the daemon lifecycle correctly from day one - daemon orphaning is the most common failure mode, (2) implementing proper terminal output flow control to prevent webview memory leaks, and (3) synchronizing terminal resize between xterm.js and the PTY. Each of these has well-documented pitfalls with clear mitigation strategies.

The unique value proposition - per-pane git change indicators and local versioning - requires tight integration between file system watching, git2 operations, and UI state synchronization. This is technically achievable but complex. The roadmap must sequence phases to establish the daemon infrastructure first, then terminal integration, then AI integration, then the differentiating features. Attempting to build everything simultaneously will fail due to the tight coupling between layers.

## Key Findings

### Recommended Stack

The core technology stack has emerged as a clear consensus across multiple reference architectures and is supported by recent stable releases. Tauri v2.10.x provides the desktop shell with sidecar support, xterm.js v6.0.x delivers battle-tested terminal emulation with GPU acceleration, and Rust Edition 2024 powers both the daemon and Tauri backend.

**Core technologies:**
- **Tauri v2.10.x**: Desktop app framework - only serious Electron alternative with native webview (10-30MB vs 200MB+), Rust backend required for daemon architecture, stable since Oct 2024
- **xterm.js v6.0.x (@xterm scope)**: Terminal rendering - powers VS Code terminal, WebGL renderer critical for multi-pane performance, handles all edge cases (Unicode, mouse, accessibility)
- **Rust 1.93+ (Edition 2024)**: Backend language - required by Tauri, Edition 2024 brings async closures and improved safety, shared across all three crates (daemon, core, tauri)
- **portable-pty 0.9.0**: PTY management - cross-platform abstraction from wezterm, allows Claude CLI to run in real PTY with proper terminal capabilities
- **React 19.2.x**: UI framework - Tauri's official template, concurrent rendering improves multi-pane performance, largest component ecosystem
- **Zustand 5.0.x**: State management - lightweight alternative to Redux, perfect for desktop apps with 5-6 state domains (panes, sessions, preferences)
- **git2 0.20.x**: Git operations - libgit2 bindings for local versioning, thread-safe, no system git dependency
- **axum (over Unix sockets)**: Daemon IPC - HTTP semantics over local socket, battle-tested routing and middleware, streaming support via SSE

**Critical version notes:**
- xterm.js v5 packages (unscoped) are deprecated - must use @xterm/xterm v6
- Tailwind v4.1.x has zero-config CSS-first setup (no tailwind.config.js)
- TypeScript 6.0 beta dropped Feb 11 2026 - too new, stick with 5.9.x
- Vite 8 (Rolldown-based) exists but not stable - use Vite 7.3.x

### Expected Features

Research across terminal multiplexers (tmux, Zellij, Warp, iTerm2) and AI chat apps (ChatGPT, Claude web, LibreChat, TypingMind) reveals clear feature expectations. Missing table stakes features makes the product feel incomplete; including the right differentiators sets it apart.

**Must have (table stakes):**
- Multi-pane split view (horizontal/vertical) - every terminal multiplexer and modern terminal has this
- Session persistence across app restarts - tmux's defining feature, expected by target users
- Keyboard shortcuts (tmux-like prefix key) - professional users won't adopt without keyboard-first interaction
- Mouse support (click, drag, resize) - "normal users" expect mouse interaction, not just keyboard
- Visual focus indicator - must instantly know which pane is active (dim inactive, highlight border)
- Copy/paste (Cmd+C/Cmd+V) - universal expectation across all terminal apps
- Scrollback/history - every terminal emulator provides this, expect to scroll through conversation
- Search within conversation (Cmd+F) - iTerm2, Cursor, ChatGPT all have search
- Model selection (opus/sonnet/haiku) - multi-model interfaces require explicit selection
- New/close conversation - standard tab/pane management with undo for destructive actions

**Should have (competitive differentiators):**
- Per-pane [+N -M] change indicators - unique to Kobo, bridges "AI is doing work" with "what actually changed"
- Local git versioning (save/restore/diff) - no AI chat app has built-in version control, GitButler's snapshot concept for conversations
- Daemon persistence (survives crashes) - goes beyond typical session persistence, tmux reliability for everyone
- Command palette (Cmd+K) - emerging standard in professional tools, keyboard-first power without memorizing shortcuts
- Friendly vocabulary ("Conversations" not "sessions") - makes multiplexer UX accessible to non-developers
- Contextual hints (not tutorials) - Zellij-style onboarding, surface hints when relevant, dismissible and recallable
- Undo/preview for destructive actions - Gmail's "undo send" pattern, preview what will happen before executing
- Ambient state indicators - visually distinguish active/idle/dormant conversations

**Defer (v2+):**
- Conversation branching/forking - high value but high complexity, natural extension of git versioning
- Drag-and-drop pane rearrangement - important for "normal users" but can be added after core layout works
- Layout presets/templates - Zellij's killer feature, but needs stable layout system first
- Light mode - ship dark theme first, add light mode in v1.1
- Plugin system - premature for v1, needs stable core and proven user demand
- Windows support - daemon uses Unix sockets, Windows requires named pipes and different process model
- Multi-provider UI - architecture supports it (trait AIProvider), but UI complexity deferred

**Anti-features (explicitly not building):**
- Real-time collaboration/multiplayer - enormous complexity (CRDT/OT), betrays single-user simplicity
- Cloud sync - requires server infrastructure, violates local-first principle
- Built-in API management - Kobo wraps Claude CLI, doesn't replace it
- Chat bubble UI - wrong mental model, terminal rendering is the interface
- Autonomous AI agent mode - dangerous for non-technical users without understanding

### Architecture Approach

The daemon-first architecture is the foundation of the entire system. The daemon is an independent Rust binary that owns all Claude CLI processes inside PTYs and survives when the Tauri app closes. The Tauri app is a thin client that connects to the daemon via Unix domain socket, proxies commands, and streams terminal output. This is the only architecture that delivers true session persistence.

**Major components:**
1. **kobo-daemon (Rust binary)** - Background daemon that owns PTY processes, manages sessions, serves IPC via axum over Unix socket, persists state, survives app close/crash. This is the source of truth.
2. **kobo-core (Rust library)** - Shared types, IPC protocol definitions, trait abstractions (AIProvider), git operations, DaemonClient. Zero runtime logic, only contracts.
3. **kobo-tauri (Tauri app)** - Desktop window shell, thin proxy between UI and daemon via Tauri commands, daemon lifecycle (start/connect/reconnect), event bridge (daemon SSE → Tauri events → React).
4. **kobo-ui (React + TS)** - Terminal panes (xterm.js), layout management, command palette, keyboard shortcuts, status bar. Display layer only, no business logic.

**Key architectural patterns:**
- **Axum over Unix domain sockets**: HTTP-like request/response semantics (routing, middleware, streaming) over a local socket with no network exposure. Socket at `~/.kobo/kobo.sock` with 0600 permissions.
- **PTY-based process management**: Claude CLI spawned inside real PTYs (portable-pty), not piped stdin/stdout. Preserves terminal escape sequences, colors, interactive features, signal handling.
- **SSE + Tauri Channels for streaming**: Terminal output flows daemon (SSE) → Tauri bridge → Tauri Channel → React → xterm.js. Ordered delivery, backpressure via tokio channels.
- **Tauri commands as thin proxies**: Zero business logic in kobo-tauri. All state mutations go through daemon. Enables testing daemon directly, future CLI client reuses daemon API.
- **Build order**: kobo-core (types/protocol) → kobo-daemon (server/PTY/sessions) → kobo-tauri (client/proxy) → kobo-ui (frontend). Bottom-up testing at each layer.

### Critical Pitfalls

Six critical pitfalls emerged from cross-referencing official docs, GitHub issues, and community sources. Each has caused rewrites or major issues in real projects.

1. **Daemon process orphaning on app close** - Most common failure mode. Zombie processes accumulate when daemon lifecycle isn't properly managed. Solution: PID file + socket liveness protocol, heartbeat/watchdog timeout, process group cleanup, launchd/systemd for production.

2. **Tauri event system memory leaks** - Continuous event emission (terminal output streaming) causes unbounded memory growth in webview. Known wry layer bug: 2M events consumed 1.1GB. Solution: Batch terminal data at 60fps max, manually delete Channel onmessage callbacks on unmount, use unlisten() in React cleanup, prefer binary IPC over JSON events.

3. **xterm.js FitAddon resize instability** - Calling fitAddon.fit() on window resize causes erratic behavior: wrong dimensions, garbled display, scroll jumps. Tauri webview resize events can fire before layout settles. Solution: Debounce resize (200-300ms), use proposeDimensions() + explicit resize(), synchronize PTY resize with drain, use ResizeObserver not window events.

4. **Webview background throttling kills terminal sessions** - When window is minimized, webview suspends after ~5 minutes, killing terminal sessions. Solution: Set backgroundThrottling: "disabled" in tauri.conf.json (requires macOSPrivateApi), WebLock workaround for Linux, backend buffers PTY output, replay on re-activation.

5. **Claude CLI process spawning and PTY interaction** - Claude CLI expects TTY, hangs with piped stdin/stdout. The `-p` flag has bugs. Sub-processes (vim, git rebase -i) deadlock without PTY. Solution: Always use portable-pty, connect PTY to xterm.js, implement watchdog timeout, track process tree for cleanup.

6. **Unix socket stale file / "Address already in use"** - When daemon crashes (SIGKILL, panic, reboot), socket file remains on disk. Next launch fails. Solution: On startup, check if socket exists, attempt connect, if fails delete stale socket. Drop impl removes socket on clean shutdown. Validate PID file. Use $XDG_RUNTIME_DIR on Linux.

## Implications for Roadmap

Based on combined research, the recommended phase structure sequences from foundation to features, with each phase building on the previous. The critical path is daemon → terminal → AI → differentiators.

### Phase 1: Foundation (Daemon + IPC)
**Rationale:** The daemon is the architectural foundation. Getting daemon lifecycle wrong poisons every subsequent feature. Must be built correctly from day one, with proper PID file management, socket cleanup, crash recovery, and heartbeat protocol.

**Delivers:**
- kobo-core with types, IPC protocol, trait definitions
- kobo-daemon binary with axum server, session manager, socket lifecycle
- kobo-tauri with daemon client, thin command proxies, lifecycle management
- Health check, reconnection logic, PID file validation

**Addresses:**
- Critical Pitfall #1 (daemon orphaning) - core infrastructure
- Critical Pitfall #6 (stale Unix socket) - socket lifecycle management
- Architecture pattern: daemon-first, independent process

**Avoids:**
- Using Tauri sidecar (wrong lifecycle model)
- Shared mutable state via files without locking
- Business logic in Tauri commands

**Research flag:** SKIP research - well-documented patterns (Tauri v2 IPC, axum UDS examples, daemon patterns)

---

### Phase 2: Terminal Integration (xterm.js + PTY)
**Rationale:** Terminal rendering is the core user experience. Must establish proper terminal data flow with flow control, resize synchronization, and event batching before adding AI complexity.

**Delivers:**
- xterm.js terminals with WebGL rendering and fit management
- PTY spawning via portable-pty with proper SIGWINCH handling
- Terminal output streaming (daemon SSE → Tauri Channel → xterm.js)
- Flow control to prevent memory leaks, resize with debouncing
- Multi-pane layout with focus indicators, copy/paste

**Uses:**
- xterm.js v6 (@xterm/xterm, WebGL addon, fit addon)
- portable-pty for PTY management in daemon
- Tauri Channels for streaming
- React + Zustand for layout state

**Implements:**
- kobo-daemon ProcessManager with PTY lifecycle
- kobo-ui Pane component with xterm.js integration
- Layout manager with split/resize/focus

**Addresses:**
- Critical Pitfall #2 (event memory leaks) - batch output at 60fps, cleanup listeners
- Critical Pitfall #3 (FitAddon resize) - debounce, proposeDimensions, ResizeObserver
- Critical Pitfall #4 (background throttling) - config + buffering architecture
- Table stakes: multi-pane, scrollback, copy/paste, visual focus, mouse support

**Avoids:**
- Polling for output (use push-based streaming)
- Unbatched event emission (batch at display refresh rate)
- Terminal state duplication in React (xterm.js owns buffer)

**Research flag:** SKIP research - xterm.js and portable-pty are well-documented, pitfalls are known

---

### Phase 3: Claude Integration (AI Process Management)
**Rationale:** With terminal infrastructure solid, add Claude CLI as a specific PTY process type. Requires understanding Claude CLI's TTY requirements and interactive session behavior.

**Delivers:**
- Claude CLI spawning inside PTY with proper env vars
- Model selection (opus/sonnet/haiku) integration
- Input/output bridging between xterm.js and Claude CLI
- Process tree tracking for Claude sub-processes
- Error handling for auth/network failures

**Uses:**
- portable-pty (already from Phase 2)
- Claude CLI as PTY child process
- Keyring crate for API key storage

**Addresses:**
- Critical Pitfall #5 (Claude CLI PTY requirements) - real PTY, watchdog timeout
- Table stakes: model selection, new/close conversation
- Anti-pattern: piped stdin/stdout for Claude CLI

**Avoids:**
- Running Claude without PTY
- Embedding API key management (use CLI's auth)

**Research flag:** NEEDS research - Claude CLI's specific behavior, auth flow, error modes, sub-process interaction patterns need investigation

---

### Phase 4: Local Versioning (Git Integration)
**Rationale:** With Claude sessions running reliably, add the first key differentiator: local git versioning. This requires file system watching, git2 operations, and UI state sync.

**Delivers:**
- Git repo per session in ~/.kobo/repos/
- Save milestone (git commit) with user message
- Restore to previous commit
- Diff between commits
- Timeline view of saved states

**Uses:**
- git2 crate for all git operations
- File system watching (notify crate or manual polling)
- kobo-core git API wrappers

**Implements:**
- kobo-daemon GitOps module
- kobo-ui timeline UI, commit creation dialog
- Background git operations (async, progress callbacks)

**Addresses:**
- Differentiator: local git versioning (save/restore/diff)
- Performance trap: synchronous git operations freeze UI

**Avoids:**
- Shelling out to git CLI (use git2 library)
- Running git operations on UI thread
- Shared mutable state without daemon coordination

**Research flag:** SKIP research - git2 API is well-documented, GitButler provides reference UX

---

### Phase 5: Change Indicators (File Watching + Diff UI)
**Rationale:** The second key differentiator builds on git integration. Requires real-time file watching and per-pane diff aggregation.

**Delivers:**
- File system watching for session workspaces
- Per-pane [+N -M] indicators in UI
- Click to expand file-level breakdown
- Real-time updates as files change
- Git diff computation per session

**Uses:**
- notify crate (or equivalent) for file watching
- git2 for diff computation
- Zustand for change indicator state

**Implements:**
- kobo-daemon FileWatcher with debouncing
- kobo-ui ChangeIndicator component
- Efficient diff aggregation (count adds/deletes)

**Addresses:**
- Differentiator: per-pane change indicators
- UX: ambient state indicators (what changed while I wasn't looking)

**Avoids:**
- Polling file system (use watch events)
- Full diff on every file change (aggregate counts only)
- UI freezes from large diffs

**Research flag:** SKIP research - file watching patterns are standard, git2 diff API is documented

---

### Phase 6: Polish (Command Palette + Keyboard + UX)
**Rationale:** With core features working, add the UX layer that makes everything discoverable and keyboard-accessible.

**Delivers:**
- Command palette (Cmd+K) with fuzzy search
- Keyboard shortcuts (tmux-like prefix key)
- Contextual hints/hotspots
- Undo/preview for destructive actions
- Status bar with ambient information
- Search within conversation (Cmd+F)

**Uses:**
- Fuzzy search library (fuse.js or similar)
- Keyboard event handling (React + Tauri shortcuts)
- Toast notifications for undo

**Implements:**
- CommandPalette component with action registry
- KeyboardHandler with prefix key pattern
- ToastManager for undo/preview
- StatusBar with model, connection, mode indicators

**Addresses:**
- Table stakes: keyboard shortcuts, command palette, search, status bar
- Differentiator: contextual hints, undo/preview
- UX: friendly vocabulary throughout

**Avoids:**
- Single-letter shortcuts (accessibility conflict)
- Tutorial wizards (use contextual hints)
- Modal "are you sure?" dialogs (use undo pattern)

**Research flag:** SKIP research - command palette patterns well-established (VS Code, Linear, GitHub)

---

### Phase Ordering Rationale

- **Foundation first:** Daemon lifecycle is the hardest part and most likely to require rework if wrong. Build it correctly before adding complexity.
- **Terminal before AI:** Terminal data flow (streaming, flow control, resize) is complex and must be solid before adding Claude CLI's specific requirements.
- **AI before differentiators:** Claude integration validates that the PTY infrastructure works for real use before building git features on top.
- **Versioning before indicators:** Change indicators require git infrastructure, so versioning must come first.
- **Polish last:** UX enhancements like command palette benefit from having real features to make discoverable. Build when there's something to polish.

**Dependency chain:**
```
Phase 1 (Foundation) → Phase 2 (Terminal) → Phase 3 (Claude)
                                              ↓
Phase 4 (Versioning) → Phase 5 (Change Indicators)
                       ↓
Phase 6 (Polish)
```

### Research Flags

Phases likely needing deeper research during planning:
- **Phase 3 (Claude Integration):** Claude CLI's specific TTY behavior, auth flow, error modes, sub-process handling needs investigation. The `-p` flag has documented bugs. Interactive sub-processes (vim, git rebase) may require special handling.

Phases with standard patterns (skip research-phase):
- **Phase 1 (Foundation):** Tauri v2 IPC, axum over Unix sockets, daemon patterns all well-documented
- **Phase 2 (Terminal Integration):** xterm.js v6 API, portable-pty, flow control patterns are standard
- **Phase 4 (Local Versioning):** git2 API well-documented, GitButler provides reference architecture
- **Phase 5 (Change Indicators):** File watching patterns standard, git diff API documented
- **Phase 6 (Polish):** Command palette, keyboard shortcuts, toast notifications all have established patterns

## Confidence Assessment

| Area | Confidence | Notes |
|------|------------|-------|
| Stack | HIGH | All core technologies are stable releases with official docs. Tauri v2.10.2 (Feb 4 2026), xterm.js v6.0.0 (Dec 2024), Rust Edition 2024 (stable), git2 0.20.x (mature). Version compatibility verified. |
| Features | MEDIUM-HIGH | Feature landscape well-established across terminal multiplexers and AI chat apps. Table stakes are clear. Differentiators (git versioning, change indicators) are novel but draw from proven patterns (GitButler snapshots, VS Code gutter indicators). |
| Architecture | HIGH | Daemon-first pattern verified with official Tauri docs, GitButler reference architecture, and Rust ecosystem crates. Axum over Unix sockets has official examples. PTY management patterns from wezterm (portable-pty). |
| Pitfalls | MEDIUM-HIGH | All six critical pitfalls verified across official docs and GitHub issues (Tauri #3273, #8689, #12724, #13133; xterm.js #3368, #3584, #3887, #4841). Prevention strategies documented with examples. Some areas need validation during implementation (Claude CLI specific behavior). |

**Overall confidence:** HIGH

The architecture is well-proven, the stack is mature, and the pitfalls are known with clear mitigations. The main uncertainty is Claude CLI's specific behavior inside a PTY (Phase 3), which requires hands-on investigation but doesn't affect the foundational architecture.

### Gaps to Address

1. **Claude CLI PTY interaction specifics** - The `-p` flag behavior, interactive sub-process handling (vim, git rebase), and auth flow need hands-on testing. Research confirms PTY is required, but exact integration patterns need validation. Address during Phase 3 planning with `/gsd:research-phase`.

2. **Multi-terminal WebGL performance** - xterm.js issues document that >4-6 terminals with WebGL can cause GPU memory exhaustion. Need to test WebGL context sharing vs. fallback to canvas renderer for inactive tabs. Address during Phase 2 with performance testing and fallback implementation.

3. **Cross-platform testing (macOS vs Linux)** - WebKitGTK (Linux) has different behavior for background throttling (no config support, requires WebLock workaround), font rendering, and WebGL availability. Pitfalls research confirms platform differences but exact workarounds need validation. Address during Phase 1 (background throttling config) and Phase 2 (WebGL fallback).

4. **File watching performance at scale** - For large repos (>10K files), file system watching and git diff operations may cause performance issues. The notify crate has debouncing, but thresholds need tuning. Address during Phase 5 with performance testing on large repos.

5. **Conversation branching UX** - Feature research identifies branching as high-value but deferred to v1.x due to UI complexity (tree navigation vs. flat list). If implemented, the conversation sidebar UX needs design work. Defer to post-v1 based on user demand.

## Sources

### Primary (HIGH confidence)
- [Tauri v2 Official Documentation](https://v2.tauri.app/) - Process model, IPC concepts, sidecar, state management, shell plugin, architecture
- [Tauri v2 GitHub Releases](https://github.com/tauri-apps/tauri/releases) - v2.10.2 (Feb 4 2026) verified
- [xterm.js GitHub](https://github.com/xtermjs/xterm.js) - v6.0.0 release notes, addon migration, performance issues
- [xterm.js Official Docs](https://xtermjs.org/docs/) - Flow control guide, API reference
- [Axum Examples](https://github.com/tokio-rs/axum/tree/main/examples) - Unix domain socket example
- [portable-pty crate](https://docs.rs/portable-pty) - PTY allocation, cross-platform support
- [git2-rs GitHub](https://github.com/rust-lang/git2-rs) - libgit2 bindings, v0.20.3
- [tokio GitHub](https://github.com/tokio-rs/tokio) - LTS versions, async runtime
- [Rust 2024 Edition](https://blog.rust-lang.org/2025/02/20/Rust-1.85.0/) - Edition 2024 stability announcement

### Secondary (MEDIUM confidence)
- [GitButler Monorepo Analysis (DeepWiki)](https://deepwiki.com/gitbutlerapp/gitbutler/3.1-but-cli-and-mcp-servers) - Reference architecture for Tauri + daemon pattern
- [Tauri GitHub Issues](https://github.com/tauri-apps/tauri/issues) - #3273 (process cleanup), #8689 (sidecar orphaning), #12724 (event memory leak), #13133 (Channel leak), #5250 (background throttling)
- [xterm.js GitHub Issues](https://github.com/xtermjs/xterm.js/issues) - #3368 (multi-instance performance), #3584, #3887, #4841 (FitAddon resize), #1518 (dispose cleanup), #5447 (GPU usage)
- [Warp Features](https://www.warp.dev/all-features) - Modern terminal with AI feature inventory
- [iTerm2 Features](https://iterm2.com/features.html) - Terminal multiplexer feature reference
- [Zellij About](https://zellij.dev/about/) - Session persistence, layout system, WASM plugins
- [LibreChat Forking](https://www.librechat.ai/docs/features/fork) - Conversation branching implementation
- [Unix Socket IPC in Rust](https://medium.com/@alfred.weirich/inter-process-communication-ipc-with-rust-on-unix-linux-and-macos-6253084819b7) - Stale socket cleanup patterns
- [NNGroup Onboarding](https://www.nngroup.com/articles/onboarding-tutorials/) - Pull revelations pattern
- [W3C Keyboard Interface](https://www.w3.org/WAI/ARIA/apg/practices/keyboard-interface/) - Accessibility patterns

### Tertiary (LOW confidence)
- Community blog posts on Tauri + xterm.js integration (individual developer experiences, not authoritative)
- Reddit discussions on terminal emulator performance (anecdotal, needs validation)

---
*Research completed: 2026-02-12*
*Ready for roadmap: yes*
