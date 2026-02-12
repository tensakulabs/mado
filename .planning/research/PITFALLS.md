# Pitfalls Research

**Domain:** Tauri v2 desktop app with Rust daemon, xterm.js terminal emulation, and Claude CLI process management
**Researched:** 2026-02-12
**Confidence:** MEDIUM-HIGH (verified across official docs, GitHub issues, and multiple community sources)

## Critical Pitfalls

Mistakes that cause rewrites or major issues.

### Pitfall 1: Daemon Process Orphaning on App Close

**What goes wrong:**
The Rust daemon process continues running after the Tauri app is closed, accumulating orphan processes on the user's machine. This is the single most common complaint in Tauri process management. The problem compounds: every app launch spawns a new daemon, and previous ones never die. Users discover dozens of zombie processes in Activity Monitor.

**Why it happens:**
Tauri's sidecar system is designed for short-lived operations, not long-running daemons. When using `Command::new_sidecar`, Tauri attempts automatic cleanup on exit, but this fails when: (a) the daemon spawns its own child processes that do not propagate termination signals, (b) the app exits abnormally (crash, force quit, SIGKILL), or (c) the daemon intentionally survives app close (which is a Kobo requirement). The fundamental tension is that Kobo's daemon is *designed* to survive app close, but must also be reliably reattachable and eventually stoppable.

**How to avoid:**
- Do NOT use Tauri's sidecar system for the daemon. The daemon should be an independent process managed outside Tauri's lifecycle.
- Implement a PID file + Unix socket liveness protocol: daemon writes its PID to `~/.kobo/daemon.pid` and listens on `~/.kobo/daemon.sock`. On app launch, check if PID is alive AND socket is responsive. If PID exists but socket is dead, the daemon crashed -- clean up and relaunch.
- Implement a heartbeat/watchdog: if the daemon receives no connections for a configurable timeout (e.g., 30 minutes), it self-terminates gracefully.
- Use `command_group` crate for any child processes the daemon spawns (like Claude CLI) to ensure process tree cleanup.
- On macOS, consider `launchd` plist for daemon lifecycle. On Linux, consider a systemd user service. Both handle crash recovery and clean shutdown natively.

**Warning signs:**
- Multiple daemon processes visible in `ps aux | grep kobo`
- Socket file exists but connection refused
- Memory usage climbing on user machines over time
- Users reporting "app won't start" (stale PID file blocking new daemon)

**Phase to address:**
Phase 1 (Foundation) -- daemon lifecycle management must be the first thing built correctly. Getting this wrong poisons every subsequent feature.

---

### Pitfall 2: Tauri Event System Memory Leaks

**What goes wrong:**
Continuous event emission from Rust backend to the frontend (which is how terminal output streaming works) causes unbounded memory growth in the webview. In documented cases, 2 million events consumed ~1.1GB of frontend memory. Separately, Tauri's Channel API permanently stores `onmessage` closures on the `window` object, preventing garbage collection of React components and their closure scopes.

**Why it happens:**
This is a known architectural issue in Tauri's wry layer (the WebView wrapper). The JavaScript-to-native bridge accumulates references that are never freed. The Channel API's `transformCallback` stores callbacks using UUID keys without a removal mechanism. Hot-reloading during development makes it worse -- each reload registers new listeners without clearing old ones.

**How to avoid:**
- For terminal output streaming: do NOT emit one event per line of output. Batch terminal data into chunks and emit at a throttled rate (e.g., 60fps max, matching display refresh).
- Manually delete Channel `onmessage` callbacks when React components unmount: `delete channel.onmessage` in cleanup/finally blocks.
- Use the `unlisten` return value from `listen()` calls in React `useEffect` cleanup functions. This is mandatory, not optional.
- For high-frequency data (terminal output), prefer Tauri's custom protocol handler (`register_uri_scheme_protocol`) or the binary IPC path over the JSON-serialized event system.
- Implement periodic memory monitoring during development to catch leaks early.

**Warning signs:**
- Webview memory growing steadily during terminal sessions
- Sluggish UI after extended use (30+ minutes)
- Browser DevTools showing retained event handler closures in heap snapshots
- Hot-reload during development causing duplicate event handlers

**Phase to address:**
Phase 2 (Terminal Integration) -- must be designed into the terminal streaming architecture from day one. Retrofitting flow control and event batching is painful.

---

### Pitfall 3: xterm.js FitAddon Resize Instability

**What goes wrong:**
Calling `fitAddon.fit()` on window resize causes erratic behavior: terminal width changes during vertical-only resizes, text disappears, scroll position jumps, and after multiple resize cycles the terminal becomes degraded (garbled display, incorrect line wrapping). In Tauri specifically, the webview container dimensions are not always reported correctly to xterm.js during resize transitions, causing the FitAddon to compute wrong column/row counts.

**Why it happens:**
The FitAddon measures the container element's dimensions to calculate terminal rows and columns. During a window resize, the container dimensions change asynchronously, and the FitAddon may read intermediate/incorrect values. Tauri's webview resize events can fire before the layout engine has settled, giving the FitAddon stale measurements. Additionally, the PTY process on the Rust side must also be notified of the new dimensions (SIGWINCH), and there is no guarantee the resize completes before new PTY output arrives formatted for the old dimensions.

**How to avoid:**
- Debounce resize events (200-300ms) before calling fit. Do NOT fit on every resize event.
- After `fitAddon.fit()`, call `fitAddon.proposeDimensions()` and explicitly `terminal.resize(cols, rows)` with the proposed values -- this is more reliable than relying on fit alone.
- Synchronize PTY resize: when xterm reports new dimensions via `terminal.onResize`, send the new cols/rows to the Rust backend which calls `pty.resize()`. Drain the PTY output buffer between the resize signal and rendering new output.
- Use `ResizeObserver` on the terminal container element rather than listening to window resize events -- it is more accurate for container-level layout changes.
- Test resize behavior early and continuously; it degrades subtly over time.

**Warning signs:**
- Terminal content shifts during window resize
- Horizontal scrollbar appearing unexpectedly
- Text wrapping at wrong column boundary after resize
- Different resize behavior between macOS (WKWebView) and Linux (WebKitGTK)

**Phase to address:**
Phase 2 (Terminal Integration) -- build the resize pipeline correctly from the start. FitAddon is the #1 source of xterm.js bugs in desktop apps.

---

### Pitfall 4: Webview Background Throttling Kills Terminal Sessions

**What goes wrong:**
When the Tauri window is minimized or hidden, the webview's suspend policy throttles timers and can unload the view entirely after ~5 minutes. This kills active terminal sessions: xterm.js stops processing output, event listeners stop firing, and the connection between the frontend terminal and backend PTY effectively dies. When the user returns, the terminal is frozen or desynced.

**Why it happens:**
Web browsers (and by extension, system webviews) aggressively throttle background tabs/views to save resources. Tauri inherits this behavior from WKWebView (macOS) and WebKitGTK (Linux). This is sensible for web pages but catastrophic for a terminal emulator where output must be continuously processed.

**How to avoid:**
- Set `backgroundThrottling: "disabled"` in `tauri.conf.json` window configuration. On macOS, this requires the `macOSPrivateApi` feature flag (`tauri > macOSPrivateApi: true`), which prevents App Store submission (acceptable for Kobo's distribution model).
- On Linux (WebKitGTK), `backgroundThrottling` configuration is NOT supported. Implement a WebLock workaround: acquire a `navigator.locks.request()` that holds a lock while the terminal is active, preventing the browser engine from suspending.
- Architecture the terminal data flow so the Rust backend buffers PTY output even when the frontend is throttled. On re-activation, replay the buffered output to xterm.js so no data is lost.
- Keep the daemon's connection to the PTY process alive regardless of frontend state -- the daemon should never depend on the frontend being responsive.

**Warning signs:**
- Terminal freezes when window is minimized then restored
- Missing output lines after returning from background
- Timer-based features (like cursor blink) stopping when minimized
- Different behavior between macOS and Linux

**Phase to address:**
Phase 1 (Foundation) for the configuration, Phase 2 (Terminal Integration) for the buffering architecture.

---

### Pitfall 5: Claude CLI Process Spawning and PTY Interaction

**What goes wrong:**
Claude CLI has specific TTY requirements and interactive session behavior that breaks standard pipe-based process management. Running Claude CLI in non-interactive mode (piped stdin/stdout) can hang, produce incomplete output, or fail to respect the `-p` flag as documented. Interactive commands that Claude CLI executes (like git operations, vim, etc.) can spawn sub-processes that hang waiting for TTY input that never comes.

**Why it happens:**
Claude CLI expects a TTY for full functionality. When spawned with pipes (stdin/stdout/stderr all piped), it loses terminal capabilities. The `-p` flag for non-interactive use has documented bugs where it still requires a TTY. Furthermore, Claude CLI's bash tool can spawn arbitrary interactive processes (vim, git rebase -i, npm init) that immediately deadlock without a PTY.

**How to avoid:**
- Spawn Claude CLI inside a real PTY using `portable-pty`, not with bare `std::process::Command` with piped stdio. This gives Claude CLI the TTY it expects and allows interactive sub-processes to function.
- Connect the PTY's output to xterm.js for rendering, creating a true terminal experience for Claude sessions.
- Implement a watchdog timeout for Claude CLI processes. If no output and no indication of waiting for user input after N seconds, surface a UI prompt to the user.
- Build a process tree tracker: when Claude CLI spawns sub-processes, track them so they can be cleaned up if Claude CLI itself is terminated.
- Test both `claude --print` (non-interactive) and full interactive mode early to understand the behavioral differences.

**Warning signs:**
- Claude CLI commands hanging with no output
- Sub-processes (git, npm) appearing in the process list but not connected to any terminal
- Different behavior between running from Kobo vs. running from a real terminal
- Memory growth from accumulated zombie PTY processes

**Phase to address:**
Phase 3 (Claude Integration) -- but the PTY infrastructure from Phase 2 must be designed with Claude CLI's needs in mind.

---

### Pitfall 6: Unix Socket Stale File / "Address Already in Use"

**What goes wrong:**
Unix domain sockets create filesystem entries. When the daemon crashes, is killed (SIGKILL), or the machine reboots uncleanly, the socket file remains on disk. The next daemon launch fails with "Address already in use" because it cannot bind to the existing socket path. Users see "app won't start" with no clear explanation.

**Why it happens:**
Unlike TCP sockets, Unix domain sockets persist as filesystem entries even after the process that created them exits. Normal shutdown with proper cleanup (`Drop` impl removing the file) works, but abnormal termination (SIGKILL, panic without unwind, power loss) skips cleanup.

**How to avoid:**
- On daemon startup, always check if the socket file exists. If it does, attempt to connect to it. If connection succeeds, another daemon is already running (reuse it). If connection fails, the socket is stale -- delete it and create a new one.
- Implement a `SocketManager` struct with a `Drop` implementation that removes the socket file.
- Use PID file validation as a secondary check: read the PID file, check if that PID is alive via `kill(pid, 0)`, and if not, clean up both the PID file and socket file.
- Place socket files in a well-known location: `$XDG_RUNTIME_DIR/kobo/daemon.sock` on Linux, `~/Library/Application Support/kobo/daemon.sock` on macOS. Using `$XDG_RUNTIME_DIR` on Linux is ideal because it is cleaned on reboot.
- Set filesystem permissions on the socket file (0600) to prevent other users from connecting.

**Warning signs:**
- "Address already in use" errors in daemon logs
- Multiple daemon instances competing for the same socket
- Daemon startup failing after a crash
- Socket file permissions allowing unintended access

**Phase to address:**
Phase 1 (Foundation) -- socket lifecycle is core daemon infrastructure.

---

## Technical Debt Patterns

Shortcuts that seem reasonable but create long-term problems.

| Shortcut | Immediate Benefit | Long-term Cost | When Acceptable |
|----------|-------------------|----------------|-----------------|
| Using Tauri's sidecar for the daemon | Quick setup, auto-bundling | No control over daemon lifecycle, no crash recovery, cannot survive app close | Never -- daemon must be independent |
| JSON serialization for terminal data over IPC | Easy to implement with Tauri's invoke | 5-200ms overhead per call for large payloads, CPU-bound serialization blocks UI thread | Only for small, infrequent data (settings, status) |
| Polling daemon status instead of socket events | Simpler to implement | Wasted CPU cycles, delayed status updates, N+1 polling problem with multiple terminals | Early prototyping only, replace before Phase 2 |
| Storing all terminal state in React state | Familiar React patterns | xterm.js manages its own buffer; duplicating in React state doubles memory usage and causes sync bugs | Never -- let xterm.js own terminal state |
| Using node-pty instead of portable-pty | More examples/docs available | Requires Node.js runtime, adds ~50MB+ to app size, complicates Tauri's Rust-first architecture | Never for Tauri + Rust stack |
| Shelling out to `git` CLI instead of using gitoxide/libgit2 | Works immediately, full git compatibility | Spawns a new process per operation, path resolution issues across platforms, harder to integrate progress | MVP only -- replace with library for operations that need progress/streaming |
| Skipping flow control for terminal output | Terminal appears to work in simple cases | Fast output (e.g., `cat large_file`) crashes the webview with 50MB+ buffer or causes unresponsive UI | Never -- implement flow control from day one |

## Integration Gotchas

Common mistakes when connecting components.

| Integration | Common Mistake | Correct Approach |
|-------------|----------------|------------------|
| xterm.js <-> Rust PTY | Sending raw bytes as JSON strings through Tauri invoke | Use Tauri's binary IPC or custom protocol handler for terminal data. JSON serialization of binary terminal data corrupts escape sequences and adds overhead |
| Daemon <-> App via Unix socket | Assuming the socket connection is always available | Implement reconnection logic with exponential backoff. The daemon may restart, the socket may be interrupted, or the app may resume from background throttling |
| xterm.js FitAddon <-> PTY resize | Resizing xterm.js without notifying the PTY, or vice versa | Always synchronize: xterm.js resize -> notify backend -> PTY resize -> confirm back to frontend. Both sides must agree on dimensions |
| Claude CLI <-> PTY | Piping stdin/stdout directly without a PTY | Use portable-pty to allocate a real PTY for Claude CLI. It needs TERM, COLUMNS, ROWS env vars and actual terminal capabilities |
| React component <-> Tauri events | Registering event listeners without cleanup | Every `listen()` call must have a corresponding `unlisten()` in useEffect cleanup. Every Channel `onmessage` must be deleted on unmount |
| Git operations <-> UI | Running git operations on the main/UI thread | All git operations must be async and run on a background thread/task. Even `git status` can take seconds on large repos |

## Performance Traps

Patterns that work at small scale but fail as usage grows.

| Trap | Symptoms | Prevention | When It Breaks |
|------|----------|------------|----------------|
| Unbatched terminal event emission | Memory growth, UI lag | Batch terminal output chunks at 60fps max; use write callbacks for flow control | >1MB/s of terminal output (e.g., `find /`, build logs, large diffs) |
| WebGL context per terminal tab | GPU memory exhaustion, context loss events | Share a single WebGL context or fall back to canvas renderer for inactive tabs; handle `webglcontextlost` event | >4-6 simultaneous terminal tabs |
| Full terminal buffer in IPC | Serialization freeze, dropped frames | Only send incremental output deltas, not full buffer state | Terminal with >1000 lines of scrollback |
| Synchronous git operations | UI freezes during git status/diff on large repos | Use async git with progress callbacks; show loading state | Repos with >10K files or large binary objects |
| Re-rendering React on every terminal output line | React diffing overhead dominates | xterm.js renders directly to canvas; React should only manage chrome/layout, not terminal content | Any terminal session with continuous output |

## Security Mistakes

Domain-specific security issues beyond general web security.

| Mistake | Risk | Prevention |
|---------|------|------------|
| Unix socket without filesystem permissions | Any local user can connect to the daemon and execute commands as the running user | Set socket permissions to 0600 on creation. Validate connecting UID matches daemon UID |
| Storing API keys (Anthropic) in Tauri's frontend state | Keys visible in webview DevTools, JavaScript memory | Store keys exclusively in the Rust backend or the daemon. Never send API keys to the frontend. Use the daemon as a proxy for all API calls |
| Claude CLI commands executed without sandboxing | Claude could execute arbitrary commands with full user permissions through the PTY | Document the risk clearly to users. Consider a confirmation prompt for destructive operations. Log all commands executed through Claude sessions |
| Tauri ACL permissions too broad | Frontend JavaScript can invoke any Rust command | Define minimal capability sets in `tauri.conf.json`. Only expose the specific IPC commands each window/webview needs. Use Tauri v2's granular permission system |
| Socket path predictability | Symlink attacks where attacker creates a symlink at the socket path before the daemon | Use `$XDG_RUNTIME_DIR` (tmpfs, user-only, cleared on boot) on Linux. Verify socket path is not a symlink before binding. Create parent directory with 0700 permissions |
| Logging terminal output containing secrets | Sensitive data (passwords, tokens) in application logs | Never log raw terminal output. If debugging requires it, implement a redaction filter for common secret patterns |

## UX Pitfalls

Common user experience mistakes in this domain.

| Pitfall | User Impact | Better Approach |
|---------|-------------|-----------------|
| No visual indicator of daemon status | User does not know if the daemon is running, crashed, or starting | Show a persistent status indicator (tray icon or app chrome) with daemon health. Red/yellow/green states |
| Terminal not responding after sleep/wake | User thinks the app is broken | Detect sleep/wake events, reconnect to daemon, replay buffered output, show "reconnecting..." overlay |
| Resize causes visual glitch then settles | Looks janky and unpolished | Debounce resize with a brief overlay or opacity transition to mask the re-layout |
| Claude CLI errors shown as raw terminal output | Error messages are cryptic and unhelpful | Parse known Claude CLI error patterns (auth failures, rate limits, network errors) and show user-friendly UI notifications alongside the raw output |
| No distinction between user terminal and Claude terminal | Confusing which terminal is interactive vs. AI-driven | Use visual differentiation: different background colors, labels, or separate panel areas for human vs. Claude terminals |
| App requires manual daemon start | Extra friction on every launch | Auto-start daemon on app launch if not already running. Auto-detect existing daemon and reattach |

## "Looks Done But Isn't" Checklist

Things that appear complete but are missing critical pieces.

- [ ] **Terminal rendering:** Often missing proper flow control -- test with `yes` or `cat /dev/urandom | base64` to verify the terminal does not freeze or crash the webview
- [ ] **Terminal resize:** Often missing PTY synchronization -- test with `ncurses` apps (htop, vim) to verify they redraw correctly after resize
- [ ] **Daemon lifecycle:** Often missing crash recovery -- kill the daemon with `kill -9` and verify the app can detect this and relaunch
- [ ] **Unix socket:** Often missing stale socket cleanup -- kill the daemon with `kill -9`, verify the next launch cleans up and succeeds
- [ ] **Event listeners:** Often missing cleanup on navigation/reload -- trigger a hot-reload and verify memory does not climb
- [ ] **Cross-platform:** Often missing Linux WebKitGTK testing -- test on actual Linux, not just macOS. WebGL support, font rendering, and background throttling all differ
- [ ] **Claude CLI integration:** Often missing error handling for auth/network failures -- test with expired API key, no network, and rate-limited account
- [ ] **Multiple terminals:** Often missing proper disposal -- open 10 terminals, close them all, verify memory returns to baseline
- [ ] **Background throttling:** Often missing on Linux -- test minimizing the window for 5+ minutes and verify the terminal resumes correctly
- [ ] **Git operations on large repos:** Often missing progress indicators -- test on a repo with 50K+ files to verify the UI does not freeze

## Recovery Strategies

When pitfalls occur despite prevention, how to recover.

| Pitfall | Recovery Cost | Recovery Steps |
|---------|---------------|----------------|
| Daemon orphaning | LOW | Implement a `kobo daemon stop` CLI command that finds and kills orphan daemons by PID file. Add a "Reset Daemon" button in app settings |
| Event memory leak | MEDIUM | Requires architectural change to event streaming. Migrate from Tauri events to custom protocol or binary IPC. Cannot be fixed incrementally |
| FitAddon resize bugs | LOW | Replace FitAddon with manual dimension calculation using `proposeDimensions()` + explicit `resize()`. Can be done without rewrite |
| Background throttling freeze | MEDIUM | Add backend buffering layer and frontend reconnection logic. Requires changes to both sides of the terminal pipeline |
| Stale Unix socket | LOW | Add socket cleanup to daemon startup. Can be patched without architecture change |
| Claude CLI hanging | LOW | Add timeout + kill to process management. Surface "process unresponsive" UI with kill button |
| WebGL context loss | LOW | Handle `webglcontextlost` event, fall back to canvas renderer, re-initialize WebGL when context is restored |
| Cross-platform rendering differences | HIGH | If WebKitGTK cannot render WebGL reliably, must support canvas renderer as primary on Linux. Test early to avoid late discovery |

## Pitfall-to-Phase Mapping

How roadmap phases should address these pitfalls.

| Pitfall | Prevention Phase | Verification |
|---------|------------------|--------------|
| Daemon process orphaning | Phase 1 (Foundation) | `kill -9` the daemon, relaunch app, confirm auto-recovery. Check `ps` for zero orphans after app quit |
| Stale Unix socket | Phase 1 (Foundation) | Kill daemon abnormally, verify next launch succeeds without manual cleanup |
| Background throttling | Phase 1 (Foundation) config + Phase 2 (Terminal) buffering | Minimize app for 10 minutes, restore, verify no lost output |
| Event system memory leaks | Phase 2 (Terminal Integration) | Run terminal session for 30 minutes with continuous output, verify memory stays bounded |
| FitAddon resize instability | Phase 2 (Terminal Integration) | Resize window rapidly for 30 seconds, verify terminal remains readable. Run `htop` and resize |
| Terminal flow control | Phase 2 (Terminal Integration) | Run `yes` for 10 seconds, verify webview stays responsive and no data is silently dropped |
| Claude CLI PTY requirements | Phase 3 (Claude Integration) | Run Claude in both interactive and non-interactive modes, verify output renders correctly |
| Claude CLI sub-process management | Phase 3 (Claude Integration) | Have Claude execute `vim` or `git rebase -i`, verify the PTY handles it or surfaces a clear message |
| Cross-platform WebGL/rendering | Phase 2 (Terminal Integration) | Test on macOS WKWebView AND Linux WebKitGTK. Verify font rendering, WebGL availability, resize behavior |
| Tauri ACL permissions | Phase 1 (Foundation) | Review capabilities file, verify frontend cannot invoke unintended commands |

## Sources

- [Tauri Process Model](https://v2.tauri.app/concept/process-model/) -- Official Tauri v2 documentation on process architecture
- [Kill process on exit - Tauri Discussion #3273](https://github.com/tauri-apps/tauri/discussions/3273) -- Community solutions for process cleanup, `command_group` crate recommendation
- [Sidecar node backend running in background - Issue #8689](https://github.com/tauri-apps/tauri/issues/8689) -- Documented orphan process bug with sidecars
- [Memory leak when emitting events - Issue #12724](https://github.com/tauri-apps/tauri/issues/12724) -- Confirmed memory leak in Tauri event emission (wry layer)
- [Channel events memory leak - Issue #13133](https://github.com/tauri-apps/tauri/issues/13133) -- Channel API closure retention bug with workaround
- [Event subscription documentation gap - Issue #12388](https://github.com/tauri-apps/tauri/issues/12388) -- Hot-reload causing leaked event listeners
- [xterm.js Flow Control Guide](https://xtermjs.org/docs/guides/flowcontrol/) -- Official flow control patterns with watermark system
- [FitAddon resize issues - Issue #3887](https://github.com/xtermjs/xterm.js/issues/3887) -- Resize bugs in Svelte/Tauri context
- [FitAddon resize erratic - Issue #3584](https://github.com/xtermjs/xterm.js/issues/3584) -- Width instability during vertical resize
- [FitAddon resize incorrect - Issue #4841](https://github.com/xtermjs/xterm.js/issues/4841) -- Incorrect dimension calculation
- [xterm.js Terminal.dispose memory leak - Issue #1518](https://github.com/xtermjs/xterm.js/issues/1518) -- Disposal cleanup requirements
- [xterm.js GPU usage - Issue #5447](https://github.com/xtermjs/xterm.js/issues/5447) -- WebGL renderer resource consumption
- [Background throttling feature - Tauri PR #12181](https://github.com/tauri-apps/tauri/pull/12181) -- `backgroundThrottling` config option details and platform support
- [Allow disable background throttling - Issue #5250](https://github.com/tauri-apps/tauri/issues/5250) -- Background throttling impact on long-running tasks
- [Tauri IPC Improvements Discussion #5690](https://github.com/tauri-apps/tauri/discussions/5690) -- JSON serialization bottleneck documentation
- [Claude CLI `-p` flag TTY bug - Issue #9026](https://github.com/anthropics/claude-code/issues/9026) -- Claude CLI hanging without TTY
- [Claude CLI PTY feature request - Issue #9881](https://github.com/anthropics/claude-code/issues/9881) -- Interactive shell support limitations
- [portable-pty crate](https://docs.rs/portable-pty) -- Cross-platform PTY allocation (from wezterm)
- [tauri-plugin-pty](https://github.com/Tnze/tauri-plugin-pty) -- Community PTY plugin for Tauri v2
- [Terminal resize roundtrip - xterm.js Issue #1914](https://github.com/xtermjs/xterm.js/issues/1914) -- SIGWINCH/resize synchronization challenges
- [Unix Domain Socket IPC in Rust](https://medium.com/@alfred.weirich/inter-process-communication-ipc-with-rust-on-unix-linux-and-macos-6253084819b7) -- Stale socket cleanup patterns and RAII

---
*Pitfalls research for: Tauri v2 + Rust daemon + xterm.js terminal emulator (Kobo)*
*Researched: 2026-02-12*
