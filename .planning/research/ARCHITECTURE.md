# Architecture Research

**Domain:** Tauri v2 desktop app with background daemon (AI conversation manager)
**Researched:** 2026-02-12
**Confidence:** HIGH (core patterns verified with official Tauri v2 docs, GitButler reference architecture, and Rust ecosystem crates)

## System Overview

```
┌─────────────────────────────────────────────────────────────────────┐
│                        kobo-ui (React + TS)                        │
│  ┌──────────┐  ┌──────────┐  ┌──────────┐  ┌─────────────────┐    │
│  │ xterm.js │  │ xterm.js │  │ Command  │  │ Layout Manager  │    │
│  │  Pane 1  │  │  Pane N  │  │ Palette  │  │ + Toolbar       │    │
│  └────┬─────┘  └────┬─────┘  └────┬─────┘  └────────┬────────┘    │
│       │              │             │                  │            │
├───────┴──────────────┴─────────────┴──────────────────┴────────────┤
│                   Tauri IPC (invoke + events + channels)           │
├────────────────────────────────────────────────────────────────────┤
│                        kobo-tauri (Rust)                           │
│  ┌───────────────┐  ┌───────────────┐  ┌──────────────────────┐   │
│  │ Tauri Commands│  │ Event Bridge  │  │ Daemon Client        │   │
│  │ (thin proxy)  │  │ (daemon→UI)   │  │ (Unix socket client) │   │
│  └───────┬───────┘  └───────┬───────┘  └──────────┬───────────┘   │
│          │                  │                      │              │
├──────────┴──────────────────┴──────────────────────┴──────────────┤
│                   Unix Domain Socket (IPC)                         │
│                   ~/.kobo/kobo.sock (0600)                         │
├────────────────────────────────────────────────────────────────────┤
│                        kobo-daemon (Rust)                          │
│  ┌───────────┐  ┌───────────┐  ┌──────────┐  ┌───────────────┐   │
│  │ Session   │  │ Process   │  │ Git      │  │ Socket Server │   │
│  │ Manager   │  │ Manager   │  │ Ops      │  │ (axum/UDS)    │   │
│  └─────┬─────┘  └─────┬─────┘  └────┬─────┘  └───────────────┘   │
│        │              │              │                            │
│  ┌─────┴──────────────┴──────────────┴────────────────────────┐   │
│  │               Claude CLI Processes (PTY)                    │   │
│  │  ┌─────────┐  ┌─────────┐  ┌─────────┐                     │   │
│  │  │ claude  │  │ claude  │  │ claude  │                     │   │
│  │  │ (pty 1) │  │ (pty 2) │  │ (pty N) │                     │   │
│  │  └─────────┘  └─────────┘  └─────────┘                     │   │
│  └─────────────────────────────────────────────────────────────┘   │
├────────────────────────────────────────────────────────────────────┤
│                        kobo-core (Rust lib)                        │
│  ┌──────────┐  ┌──────────┐  ┌──────────┐  ┌──────────────────┐  │
│  │ Types    │  │ trait    │  │ Git API  │  │ IPC Protocol     │  │
│  │ (shared) │  │ AIProvider│  │          │  │ (message types)  │  │
│  └──────────┘  └──────────┘  └──────────┘  └──────────────────┘  │
└────────────────────────────────────────────────────────────────────┘
                               │
                    ┌──────────┴──────────┐
                    │   ~/.kobo/ (disk)    │
                    │  sessions/           │
                    │  config.toml         │
                    │  kobo.sock           │
                    │  kobo.pid            │
                    │  repos/ (git)        │
                    └─────────────────────┘
```

### Component Responsibilities

| Component | Responsibility | Typical Implementation |
|-----------|----------------|------------------------|
| **kobo-ui** | Render terminal panes, layout management, keyboard shortcuts, command palette, toolbar | React + TypeScript + Tailwind, xterm.js for terminal rendering |
| **kobo-tauri** | Desktop window shell, Tauri IPC bridge between UI and daemon, daemon lifecycle (start/connect/reconnect) | Tauri v2 app with `#[tauri::command]` handlers that proxy to daemon client |
| **kobo-daemon** | Own all Claude CLI processes, manage sessions, persist state, serve IPC, survive app close | Standalone Rust binary, tokio async runtime, Unix socket server, PTY management |
| **kobo-core** | Shared types, IPC protocol definitions, trait abstractions, git operations, client library for daemon | Rust library crate, no runtime dependencies, serde serialization |

## Recommended Project Structure

```
kobo/
├── Cargo.toml                 # Workspace root
├── crates/
│   ├── kobo-core/             # Shared library (types, protocol, traits)
│   │   ├── Cargo.toml
│   │   └── src/
│   │       ├── lib.rs
│   │       ├── types.rs       # Session, Pane, ConversationState
│   │       ├── protocol.rs    # IPC request/response enums
│   │       ├── provider.rs    # trait AIProvider
│   │       ├── git.rs         # Git operations (git2/gix)
│   │       └── client.rs      # DaemonClient (Unix socket client)
│   │
│   ├── kobo-daemon/           # Background daemon binary
│   │   ├── Cargo.toml
│   │   └── src/
│   │       ├── main.rs        # Entry point, daemonization, signal handling
│   │       ├── server.rs      # Unix socket server (axum over UDS)
│   │       ├── session.rs     # Session manager (create, attach, detach, destroy)
│   │       ├── process.rs     # PTY/process manager for Claude CLI
│   │       ├── state.rs       # Persistent state (sessions.json / SQLite)
│   │       └── handlers.rs    # Request handlers (route → business logic)
│   │
│   └── kobo-tauri/            # Tauri desktop app
│       ├── Cargo.toml
│       ├── tauri.conf.json
│       ├── capabilities/
│       │   └── default.json   # Permissions for shell, fs, etc.
│       └── src/
│           ├── lib.rs         # Tauri app builder, plugin registration
│           ├── commands.rs    # #[tauri::command] handlers (thin proxies)
│           ├── bridge.rs      # Daemon event → Tauri event forwarding
│           └── lifecycle.rs   # Daemon start/stop/connect/reconnect
│
├── ui/                        # Frontend (React + TypeScript)
│   ├── package.json
│   ├── tsconfig.json
│   ├── vite.config.ts
│   └── src/
│       ├── App.tsx
│       ├── components/
│       │   ├── Pane.tsx       # xterm.js terminal pane
│       │   ├── Layout.tsx     # Multi-pane layout manager
│       │   ├── Toolbar.tsx    # Status bar + actions
│       │   ├── CommandPalette.tsx
│       │   └── ChangeIndicator.tsx  # [+N -M] git indicators
│       ├── hooks/
│       │   ├── useDaemon.ts   # Tauri invoke wrappers
│       │   ├── useSession.ts  # Session state management
│       │   └── useKeyboard.ts # Keyboard shortcut handling
│       ├── lib/
│       │   ├── ipc.ts         # Typed invoke/listen wrappers
│       │   └── terminal.ts    # xterm.js setup + addon management
│       └── stores/            # Zustand or similar client state
│
├── .planning/                 # Project planning artifacts
└── .kobo/                     # Runtime data (created at runtime)
```

### Structure Rationale

- **crates/ directory:** Follows the Rust workspace convention used by GitButler, Tauri itself, and most multi-crate Rust projects. Each crate has a single responsibility.
- **kobo-core as a library:** Both kobo-daemon and kobo-tauri depend on it. Contains zero runtime logic -- only types, traits, and pure functions. This prevents circular dependencies and ensures the daemon and app always agree on protocol types.
- **kobo-daemon as a separate binary:** Not a Tauri sidecar. It is an independent daemon that can be started by the Tauri app OR manually from the command line. This is critical for the "survives app close" requirement.
- **ui/ at the root:** Keeps the frontend cleanly separated. Tauri's `tauri.conf.json` points to the UI build output. Standard React/Vite project.
- **~/.kobo/ for runtime data:** User-space directory for socket, PID file, session state, and git repos. Follows Unix conventions (like ~/.docker/, ~/.config/).

## Architectural Patterns

### Pattern 1: Daemon-First Architecture (NOT Sidecar)

**What:** The daemon is a standalone binary that runs independently of the Tauri app. The Tauri app is a client that connects to the daemon. If no daemon is running, the Tauri app starts one. If the app closes, the daemon keeps running.

**When to use:** Whenever processes must survive the UI closing -- exactly the Kobo requirement for persistent AI sessions.

**Trade-offs:**
- PRO: True session persistence across app restarts
- PRO: Can be managed by launchd (macOS) / systemd (Linux) for auto-start
- PRO: Can be used without the GUI (future CLI client)
- CON: More complex lifecycle management (start, connect, reconnect, health check)
- CON: Two binaries to build and distribute

**Why NOT a Tauri sidecar:** Tauri's sidecar mechanism (via `tauri-plugin-shell`) ties the child process lifecycle to the app. When the Tauri app exits, you must explicitly manage sidecar cleanup. A sidecar is designed to be "bundled with the app" -- it is not designed to be an independent daemon. For Kobo, the daemon MUST outlive the app. A separate daemon binary with PID-file-based lifecycle is the correct pattern.

**Example (daemon startup from Tauri):**
```rust
// kobo-tauri/src/lifecycle.rs
use kobo_core::client::DaemonClient;
use std::process::Command;

pub async fn ensure_daemon_running() -> Result<DaemonClient, Error> {
    let socket_path = dirs::home_dir().unwrap().join(".kobo/kobo.sock");

    // Try to connect to existing daemon
    if let Ok(client) = DaemonClient::connect(&socket_path).await {
        return Ok(client);
    }

    // No daemon running -- start one
    let daemon_bin = find_daemon_binary()?;
    Command::new(daemon_bin)
        .arg("--daemonize")
        .spawn()?;

    // Wait for socket to appear (with timeout)
    wait_for_socket(&socket_path, Duration::from_secs(5)).await?;

    DaemonClient::connect(&socket_path).await
}
```

**Confidence:** HIGH -- This pattern is well-established (Docker, VS Code Remote, tmux). GitButler uses a similar pattern with its `but-server` crate serving HTTP/WebSocket.

### Pattern 2: Axum over Unix Domain Sockets for Daemon IPC

**What:** Use the axum web framework listening on a Unix domain socket instead of TCP. This gives you HTTP-like request/response semantics, routing, middleware, and error handling -- but over a local socket with no network exposure.

**When to use:** When the daemon needs structured request/response IPC with multiple endpoints. Axum-over-UDS is well-proven and avoids reinventing a wire protocol.

**Trade-offs:**
- PRO: Battle-tested HTTP semantics (status codes, content types, streaming)
- PRO: Familiar to any web developer -- routes, handlers, extractors
- PRO: Built-in JSON serialization via serde
- PRO: Streaming support via SSE or chunked responses (for terminal output)
- PRO: Middleware for logging, auth, error handling
- CON: HTTP overhead is minimal but nonzero vs raw socket bytes
- CON: Requires tokio runtime in the daemon

**Alternative considered: JSON-RPC over raw Unix sockets.** This is simpler but requires implementing your own framing, routing, and error handling. The `jsonrpc-ipc-server` crate from Parity exists but is less actively maintained than axum. For Kobo's complexity (multiple session types, streaming terminal output, git operations), axum's routing and middleware justify the small overhead.

**Example:**
```rust
// kobo-daemon/src/server.rs
use axum::{Router, routing::{get, post}};
use tokio::net::UnixListener;
use std::path::PathBuf;

pub async fn start_server(socket_path: PathBuf) -> Result<(), Error> {
    let _ = tokio::fs::remove_file(&socket_path).await;
    let listener = UnixListener::bind(&socket_path)?;

    // Set socket permissions to 0600 (owner only)
    #[cfg(unix)]
    {
        use std::os::unix::fs::PermissionsExt;
        std::fs::set_permissions(&socket_path,
            std::fs::Permissions::from_mode(0o600))?;
    }

    let app = Router::new()
        .route("/sessions", get(list_sessions).post(create_session))
        .route("/sessions/:id", get(get_session).delete(destroy_session))
        .route("/sessions/:id/attach", post(attach_session))
        .route("/sessions/:id/detach", post(detach_session))
        .route("/sessions/:id/input", post(send_input))
        .route("/sessions/:id/output", get(stream_output))  // SSE
        .route("/sessions/:id/resize", post(resize_pty))
        .route("/git/:session_id/status", get(git_status))
        .route("/git/:session_id/commit", post(git_commit))
        .route("/health", get(health_check))
        .with_state(app_state);

    axum::serve(listener, app).await?;
    Ok(())
}
```

**Confidence:** HIGH -- The axum UDS example exists in the official axum repository. Tokio has first-class `UnixListener` support.

### Pattern 3: Tauri Commands as Thin Proxies

**What:** Tauri `#[tauri::command]` handlers should contain zero business logic. They exist only to bridge the Tauri IPC layer to the daemon client. All real work happens in the daemon.

**When to use:** Always, in Kobo's architecture. The Tauri app is a display client, not a business logic host.

**Trade-offs:**
- PRO: Single source of truth (daemon) for all state
- PRO: Tauri app can be restarted without losing anything
- PRO: Future CLI client uses the same daemon API
- PRO: Testing is simpler -- test the daemon directly
- CON: Every UI action requires a round-trip to the daemon (but Unix sockets are sub-millisecond)

**Example:**
```rust
// kobo-tauri/src/commands.rs
use kobo_core::client::DaemonClient;
use kobo_core::types::{Session, SessionId};
use tauri::State;
use std::sync::Mutex;

#[tauri::command]
async fn list_sessions(
    client: State<'_, Mutex<DaemonClient>>
) -> Result<Vec<Session>, String> {
    let client = client.lock().unwrap();
    client.list_sessions().await.map_err(|e| e.to_string())
}

#[tauri::command]
async fn create_session(
    client: State<'_, Mutex<DaemonClient>>,
    name: String,
    model: String,
) -> Result<Session, String> {
    let client = client.lock().unwrap();
    client.create_session(name, model).await.map_err(|e| e.to_string())
}
```

**Confidence:** HIGH -- This is the standard proxy pattern for Tauri apps with external backends. GitButler's `but-api` crate serves a similar role.

### Pattern 4: SSE or Channels for Terminal Output Streaming

**What:** Terminal output from Claude CLI processes must stream in real-time to the UI. Use Server-Sent Events (SSE) from the daemon to the Tauri app, then Tauri Channels to forward to the React frontend.

**When to use:** For any streaming data flow: terminal output, progress indicators, status updates.

**Trade-offs:**
- PRO: Ordered delivery (SSE guarantees order)
- PRO: Backpressure via tokio channels
- PRO: Tauri Channels are explicitly designed for streaming (used internally for child process output and download progress)
- CON: Two translation layers (daemon SSE -> Tauri -> React)
- CON: Need to handle reconnection if daemon connection drops

**Data flow for terminal output:**
```
Claude CLI (PTY) → daemon Process Manager → tokio broadcast channel
    → SSE endpoint (/sessions/:id/output) → Tauri event bridge
    → Tauri Channel → React onmessage → xterm.js terminal.write()
```

**Alternative considered: WebSocket.** WebSocket would work but adds complexity (upgrade handshake, ping/pong). SSE is simpler for the unidirectional stream of terminal output. Input goes via regular POST requests to `/sessions/:id/input`.

**Example (daemon side):**
```rust
// kobo-daemon/src/handlers.rs
use axum::response::sse::{Event, Sse};
use futures::stream::Stream;

async fn stream_output(
    Path(session_id): Path<SessionId>,
    State(state): State<AppState>,
) -> Sse<impl Stream<Item = Result<Event, Infallible>>> {
    let rx = state.session_manager.subscribe_output(session_id).await;

    let stream = tokio_stream::wrappers::BroadcastStream::new(rx)
        .filter_map(|result| {
            result.ok().map(|bytes| {
                Ok(Event::default()
                    .data(base64::encode(&bytes))
                    .event("output"))
            })
        });

    Sse::new(stream)
}
```

**Example (Tauri bridge):**
```rust
// kobo-tauri/src/bridge.rs
use tauri::ipc::Channel;

#[tauri::command]
async fn attach_session(
    client: State<'_, Mutex<DaemonClient>>,
    session_id: String,
    on_output: Channel<Vec<u8>>,
) -> Result<(), String> {
    let client = client.lock().unwrap();
    let mut stream = client.stream_output(&session_id).await
        .map_err(|e| e.to_string())?;

    tokio::spawn(async move {
        while let Some(chunk) = stream.next().await {
            let _ = on_output.send(chunk);
        }
    });

    Ok(())
}
```

**Confidence:** HIGH -- Tauri Channels are documented for exactly this use case (child process output streaming). SSE over Unix sockets is standard axum.

### Pattern 5: PTY-Based Process Management in Daemon

**What:** The daemon spawns Claude CLI processes inside pseudo-terminals (PTYs) using the `portable-pty` crate, not raw `Command::new()`. This preserves terminal escape sequences, colors, interactive features, and proper signal handling.

**When to use:** Always, when wrapping a CLI tool that expects a terminal environment (which Claude CLI does).

**Trade-offs:**
- PRO: Claude CLI behaves exactly as it would in a real terminal
- PRO: Proper signal forwarding (Ctrl+C, window resize via SIGWINCH)
- PRO: ANSI escape sequences preserved for xterm.js rendering
- PRO: Cross-platform (portable-pty supports macOS and Linux)
- CON: More complex than raw stdin/stdout pipes
- CON: PTY management requires careful cleanup on process exit

**Example:**
```rust
// kobo-daemon/src/process.rs
use portable_pty::{CommandBuilder, PtySize, native_pty_system};

pub struct ManagedProcess {
    child: Box<dyn portable_pty::Child + Send>,
    reader: Box<dyn std::io::Read + Send>,
    writer: Box<dyn std::io::Write + Send>,
    master_pty: Box<dyn portable_pty::MasterPty + Send>,
}

pub fn spawn_claude(model: &str, pty_size: PtySize) -> Result<ManagedProcess> {
    let pty_system = native_pty_system();
    let pair = pty_system.openpty(pty_size)?;

    let mut cmd = CommandBuilder::new("claude");
    cmd.arg("--model").arg(model);
    // Set environment for non-interactive detection
    cmd.env("TERM", "xterm-256color");

    let child = pair.slave.spawn_command(cmd)?;
    let reader = pair.master.try_clone_reader()?;
    let writer = pair.master.take_writer()?;

    Ok(ManagedProcess {
        child,
        reader,
        writer,
        master_pty: pair.master,
    })
}
```

**Confidence:** HIGH -- `portable-pty` is mature (used by Wezterm terminal emulator). `tauri-plugin-pty` also exists but ties to Tauri lifecycle, which we explicitly avoid.

## Data Flow

### Session Lifecycle Flow

```
User clicks "New Conversation"
    ↓
React → invoke('create_session', { name, model })
    ↓
kobo-tauri command → DaemonClient.create_session()
    ↓
Unix socket POST /sessions { name, model }
    ↓
kobo-daemon SessionManager:
    1. Create session record (ID, name, model, created_at)
    2. Spawn Claude CLI via PTY (process.rs)
    3. Start output reader task (broadcast channel)
    4. Persist session metadata to ~/.kobo/sessions/<id>/session.json
    5. Init git repo in ~/.kobo/repos/<id>/
    6. Return Session { id, name, status: "active" }
    ↓
Response flows back through all layers
    ↓
React creates xterm.js Terminal, calls invoke('attach_session', { id, onOutput })
    ↓
Tauri Channel receives output stream, writes to xterm.js
```

### Terminal I/O Flow

```
User types in xterm.js
    ↓
xterm.onData(data) → invoke('send_input', { sessionId, data })
    ↓
kobo-tauri → DaemonClient.send_input(id, bytes)
    ↓
POST /sessions/:id/input { data: base64 }
    ↓
kobo-daemon → PTY writer.write(bytes) → Claude CLI stdin
    ↓
Claude CLI processes input, produces output to PTY stdout
    ↓
PTY reader task → broadcast channel → SSE stream
    ↓
kobo-tauri bridge → Tauri Channel → React → xterm.js terminal.write()
```

### Detach/Reattach Flow

```
User closes Tauri app
    ↓
kobo-tauri on_close:
    - Unsubscribe from all SSE streams
    - Close Unix socket connection
    - Does NOT send "kill" to daemon
    ↓
kobo-daemon continues running:
    - All PTYs alive, Claude CLI processes running
    - Output buffered in ring buffer (last N bytes per session)
    - Session metadata persisted

User reopens Tauri app
    ↓
kobo-tauri on_start:
    1. Connect to daemon (ensure_daemon_running)
    2. list_sessions() → display existing sessions
    3. User clicks session → attach_session(id)
    4. Daemon replays buffered output (catch-up)
    5. Live stream resumes
```

### Git Operations Flow

```
User clicks save/commit on a session
    ↓
invoke('git_commit', { sessionId, message })
    ↓
kobo-daemon:
    1. Read session workspace files
    2. Stage changes in ~/.kobo/repos/<id>/
    3. Create git commit with message
    4. Return commit info (hash, stats)
    ↓
UI updates [+N -M] indicators → [0 0]
```

### Key Data Flows Summary

1. **Terminal I/O:** Bidirectional. Input via POST, output via SSE/Channel streaming. Sub-millisecond latency over Unix socket.
2. **Session management:** Request/response. CRUD operations on sessions.
3. **State sync:** On attach, daemon sends current session state + buffered output. Ongoing via event stream.
4. **Git operations:** Request/response. Triggered by user action, not automatic.

## Scaling Considerations

| Scale | Architecture Adjustments |
|-------|--------------------------|
| 1-5 sessions | Single daemon process, single tokio runtime. No optimization needed. |
| 5-20 sessions | PTY read tasks should use tokio::spawn (already async). Monitor memory for output buffers. Cap ring buffer size (e.g., 1MB per session). |
| 20-50 sessions | Consider PTY process pooling. Watch file descriptor limits (ulimit). Each PTY consumes 2 FDs. |
| 50+ sessions | Unlikely for a desktop app. If needed: separate daemon worker processes, session migration between workers. |

### Scaling Priorities

1. **First bottleneck:** Output buffer memory. Each active Claude session can produce significant output. Solution: Ring buffer with configurable max size (default 1MB), oldest data evicted.
2. **Second bottleneck:** File descriptors. Each PTY pair uses 2 FDs, each Unix socket connection uses 1 FD. macOS default soft limit is 256. Solution: Raise ulimit in daemon startup, or use `launchctl limit maxfiles`.

## Anti-Patterns

### Anti-Pattern 1: Business Logic in Tauri Commands

**What people do:** Put session management, process spawning, or git operations directly in `#[tauri::command]` handlers.
**Why it's wrong:** State is lost when the Tauri app closes. No way to reuse logic from a CLI client. Testing requires spinning up a full Tauri app. Violates the daemon-first architecture.
**Do this instead:** Tauri commands are thin proxies that call `DaemonClient` methods. Zero business logic in kobo-tauri.

### Anti-Pattern 2: Using Tauri Sidecar for the Daemon

**What people do:** Configure the daemon as a Tauri `externalBin` sidecar and launch it via `app.shell().sidecar()`.
**Why it's wrong:** Sidecar lifecycle is tied to the Tauri app. When the app exits, you must explicitly handle keeping the sidecar alive -- but the sidecar mechanism is designed for the opposite (cleanup on exit). The daemon must be independently managed.
**Do this instead:** Launch the daemon via `std::process::Command` with daemonization flags (`--daemonize`), or have the user install it as a launchd/systemd user service.

### Anti-Pattern 3: Shared Mutable State via Files Without Locking

**What people do:** Read/write session state files (JSON) from both daemon and app processes without file locking.
**Why it's wrong:** Race conditions corrupt state. Two processes writing the same file = data loss.
**Do this instead:** All state mutations go through the daemon. The daemon is the single writer. The Tauri app reads state only via daemon API, never directly from disk.

### Anti-Pattern 4: Polling for Terminal Output

**What people do:** Timer-based polling (`setInterval` + fetch) to check for new terminal output.
**Why it's wrong:** Wastes CPU, introduces latency (up to poll interval), and scales poorly with session count.
**Do this instead:** Push-based streaming via SSE (daemon) and Tauri Channels (app-to-frontend). Output arrives as soon as the PTY produces it.

### Anti-Pattern 5: Embedding PTY Management in Tauri Process

**What people do:** Use `tauri-plugin-pty` to manage PTYs directly in the Tauri core process.
**Why it's wrong:** PTYs die when the Tauri app closes. Defeats the entire persistence model.
**Do this instead:** PTY management belongs exclusively in the daemon. The daemon owns process lifecycles.

## Integration Points

### External Services

| Service | Integration Pattern | Notes |
|---------|---------------------|-------|
| Claude CLI | PTY spawn via `portable-pty` | Daemon owns the process. Must handle Claude CLI updates/version changes. |
| macOS Keychain | `security` CLI or `keyring` crate | For storing API keys. Called from daemon, not Tauri app. |
| Linux libsecret | `keyring` crate (cross-platform) | Same API as macOS, different backend. |
| git (local) | `git2` crate (libgit2 bindings) or `gix` (pure Rust) | For session versioning. Daemon performs all git ops. |
| launchd (macOS) | .plist in ~/Library/LaunchAgents/ | Optional auto-start. Generated by installer or first-run setup. |
| systemd (Linux) | .service in ~/.config/systemd/user/ | Optional auto-start. Same as launchd equivalent. |

### Internal Boundaries

| Boundary | Communication | Notes |
|----------|---------------|-------|
| kobo-ui <-> kobo-tauri | Tauri IPC (invoke + events + channels) | Type-safe via generated TS types. JSON serialization. |
| kobo-tauri <-> kobo-daemon | Unix domain socket (HTTP over UDS) | axum router. JSON request/response + SSE for streaming. |
| kobo-daemon <-> Claude CLI | PTY (stdin/stdout/stderr as byte streams) | Raw bytes, ANSI escape sequences preserved. |
| kobo-daemon <-> filesystem | Direct file I/O + git2/gix | Session state, git repos, PID file, config. |
| kobo-core (shared) | Compile-time dependency | Types and traits shared by daemon + tauri + future CLI. |

## Build Order (Dependency Graph)

The crate dependency graph dictates the build order and, more importantly, the recommended **implementation order** for the roadmap:

```
kobo-core (no deps on other kobo crates)
    ↑                    ↑
    │                    │
kobo-daemon          kobo-tauri
(depends on core)    (depends on core)
                         ↑
                         │
                     kobo-ui
                 (depends on tauri
                  via Tauri IPC)
```

### Recommended Build Order

1. **kobo-core first** -- Define types (`Session`, `SessionId`, `PaneLayout`), the IPC protocol (request/response enums), and the `AIProvider` trait. This is the contract between all components.

2. **kobo-daemon second** -- Implement the socket server, session manager, and PTY process management. This can be tested standalone with `curl --unix-socket` or a simple Rust client, no UI needed.

3. **kobo-tauri third** -- Implement the daemon client (in kobo-core) and the thin Tauri command proxies. Wire up daemon lifecycle management (start, connect, reconnect).

4. **kobo-ui last** -- Build the React frontend with xterm.js. Connect to Tauri IPC. This is the most iterative layer -- easier to build once the daemon API is stable.

**Rationale:** Building bottom-up (core -> daemon -> tauri -> ui) means each layer can be tested independently before integrating with the next. The daemon is the most complex component and benefits from being built and stabilized early. The UI is the most likely to change and should be built against a stable API.

## Daemon Lifecycle Management

### Startup Sequence (daemon)

```
1. Parse CLI args (--daemonize, --socket-path, --log-file)
2. If --daemonize: double-fork (via `fork` or `daemonize` crate)
3. Write PID to ~/.kobo/kobo.pid
4. Set up signal handlers (SIGTERM, SIGINT → graceful shutdown)
5. Load persisted sessions from ~/.kobo/sessions/
6. Restore PTY processes for sessions marked "active"
7. Bind Unix socket at ~/.kobo/kobo.sock (remove stale socket first)
8. Set socket permissions to 0600
9. Start axum server on the socket
10. Log "daemon ready" to ~/.kobo/logs/daemon.log
```

### Shutdown Sequence (daemon)

```
1. Receive SIGTERM or explicit shutdown command
2. Stop accepting new connections
3. Send SIGTERM to all Claude CLI processes
4. Wait up to 5s for graceful exit, then SIGKILL
5. Persist all session state (mark as "suspended")
6. Remove Unix socket file
7. Remove PID file
8. Exit
```

### App-to-Daemon Connection

```
1. Tauri app starts
2. Check if ~/.kobo/kobo.pid exists and process is alive
3. If alive: connect to ~/.kobo/kobo.sock
4. If not alive: spawn daemon binary with --daemonize, wait for socket
5. On connection established: fetch session list, restore UI state
6. On connection lost (daemon crash): show reconnection UI, retry with backoff
```

## Sources

- [Tauri v2 Process Model](https://v2.tauri.app/concept/process-model/) -- HIGH confidence
- [Tauri v2 IPC Concepts](https://v2.tauri.app/concept/inter-process-communication/) -- HIGH confidence
- [Tauri v2 Sidecar / External Binaries](https://v2.tauri.app/develop/sidecar/) -- HIGH confidence
- [Tauri v2 Calling Rust from Frontend](https://v2.tauri.app/develop/calling-rust/) -- HIGH confidence
- [Tauri v2 Calling Frontend from Rust](https://v2.tauri.app/develop/calling-frontend/) -- HIGH confidence
- [Tauri v2 State Management](https://v2.tauri.app/develop/state-management/) -- HIGH confidence
- [Tauri v2 Shell Plugin](https://v2.tauri.app/plugin/shell/) -- HIGH confidence
- [Tauri v2 Architecture](https://v2.tauri.app/concept/architecture/) -- HIGH confidence
- [Axum Unix Domain Socket Example](https://github.com/tokio-rs/axum/blob/main/examples/unix-domain-socket/src/main.rs) -- HIGH confidence
- [GitButler Monorepo Structure (DeepWiki)](https://deepwiki.com/gitbutlerapp/gitbutler/3.1-but-cli-and-mcp-servers) -- MEDIUM confidence (third-party analysis of open source project)
- [Persistent State in Tauri Apps (Aptabase)](https://aptabase.com/blog/persistent-state-tauri-apps) -- MEDIUM confidence
- [portable-pty Documentation](https://docs.rs/portable-pty) -- HIGH confidence
- [tauri-plugin-pty](https://lib.rs/crates/tauri-plugin-pty) -- MEDIUM confidence
- [Rust `daemonize` crate](https://docs.rs/daemonize) -- HIGH confidence
- [Rust `fork` crate](https://lib.rs/crates/fork) -- HIGH confidence
- [tokio-unix-ipc crate](https://github.com/mitsuhiko/tokio-unix-ipc) -- MEDIUM confidence
- [Apple launchd Documentation](https://developer.apple.com/library/archive/documentation/MacOSX/Conceptual/BPSystemStartup/Chapters/CreatingLaunchdJobs.html) -- HIGH confidence

---
*Architecture research for: Kobo -- Tauri v2 desktop app with background daemon*
*Researched: 2026-02-12*
