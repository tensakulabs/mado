# Stack Research

**Domain:** Desktop terminal multiplexer with AI chat (Tauri + xterm.js + Rust daemon)
**Researched:** 2026-02-12
**Confidence:** HIGH

## Recommended Stack

### Core Technologies

| Technology | Version | Purpose | Why Recommended | Confidence |
|------------|---------|---------|-----------------|------------|
| Tauri | 2.10.x | Desktop app framework | Only serious Electron alternative with Rust backend. Native webview = 10-30MB app vs 200MB+ Electron. Stable since Oct 2024, actively maintained (2.10.2 released Feb 4 2026). v2 adds plugin system, capability-based security, and sidecar support needed for daemon architecture. | HIGH |
| Rust | 1.93.x (Edition 2024) | Backend language (daemon, core, Tauri app) | Required by Tauri. Edition 2024 stable since Rust 1.85 (Feb 2025). Async closures, improved safety. All three Rust crates (kobo-daemon, kobo-core, kobo-tauri) use edition 2024. | HIGH |
| React | 19.2.x | UI framework | Tauri's official template supports React. Largest ecosystem for component libraries. 19.2.4 is current stable (Jan 2026). Concurrent rendering improves multi-pane xterm.js performance. | HIGH |
| TypeScript | 5.9.x | Frontend language | 5.9.3 is latest stable. TS 6.0 beta just dropped (Feb 11, 2026) but too new for production. TS 7 (Go-based rewrite) exists in preview but not ready. Stick with 5.9.x. | HIGH |
| Vite | 7.3.x | Build tool / dev server | Vite 7 is current stable (7.3.1). Smooth upgrade from Vite 6 with deprecated features removed. Vite 8 (Rolldown-based) exists in beta but not stable. Tauri's official templates use Vite. | HIGH |
| Tailwind CSS | 4.1.x | Styling | v4.1.18 is current stable. Major rewrite: 5x faster full builds, 100x faster incremental, zero-config CSS-first setup. No tailwind.config.js needed -- configure in CSS with @theme. | HIGH |

### Rust Crates (Backend)

| Crate | Version | Purpose | Why Recommended | Confidence |
|-------|---------|---------|-----------------|------------|
| tokio | 1.43.x+ (LTS) | Async runtime | Tauri v2 uses tokio internally. LTS 1.43.x supported until Mar 2026, LTS 1.47.x until Sep 2026. Use whichever Tauri pins. Do NOT add a second runtime. | HIGH |
| serde + serde_json | latest | Serialization | Standard Rust serialization. Required for Tauri command return types and IPC message format between daemon and Tauri app. | HIGH |
| git2 | 0.20.x | Git operations | libgit2 bindings for Rust. Thread-safe, memory-safe. Source bundled (no system libgit2 needed). Used for kobo-core's local git versioning (init, commit, diff, log, restore). | HIGH |
| portable-pty | 0.9.0 | PTY management | Cross-platform PTY abstraction from wezterm. Spawns shell/CLI processes with proper terminal emulation. This is what the daemon uses to own Claude CLI processes. | HIGH |
| keyring | 3.x | Credential storage | Cross-platform secure credential storage. macOS Keychain, Linux libsecret/Secret Service. Used for API key storage per PROJECT.md security requirements. | MEDIUM |
| nix | latest | Unix system calls | POSIX bindings for daemon lifecycle: fork, setsid, socket permissions (0600), signal handling. Only needed in kobo-daemon. | HIGH |
| tauri-plugin-shell | 2.3.x | Sidecar/process management | Official Tauri plugin for launching and communicating with sidecar binaries. kobo-tauri uses this to launch/connect to kobo-daemon if not already running. | HIGH |

### Frontend Libraries (npm)

| Package | Version | Purpose | Why Recommended | Confidence |
|---------|---------|---------|-----------------|------------|
| @xterm/xterm | 6.0.x | Terminal rendering | The terminal emulator. v6.0.0 (Dec 2024) is current. Migrated to @xterm scope (old `xterm` package deprecated). GPU-accelerated rendering, synchronized output, full cursor/mouse support. | HIGH |
| @xterm/addon-fit | 6.0.x | Terminal resizing | Auto-sizes terminal to container. Essential for responsive pane layouts. | HIGH |
| @xterm/addon-webgl | 6.0.x | GPU rendering | WebGL2-based renderer. Dramatically faster than DOM renderer for multiple concurrent terminals. Critical for multi-pane performance. | HIGH |
| @xterm/addon-web-links | 6.0.x | Clickable URLs | Detects and makes URLs clickable in terminal output. Table-stakes UX feature. | HIGH |
| @xterm/addon-search | 6.0.x | Terminal search | Search within terminal buffer. Expected by power users. | HIGH |
| @xterm/addon-serialize | 6.0.x | Buffer serialization | Export terminal buffer to VT sequences. Needed for session save/restore when reattaching to daemon. | MEDIUM |
| zustand | 5.0.x | State management | Lightweight, minimal boilerplate. 5.0.11 is current. Better than Redux for desktop apps (no actions/reducers ceremony). Supports middleware for persistence. Perfect for pane layout state, session list, UI preferences. | HIGH |
| @tauri-apps/api | 2.x | Tauri frontend API | Official JS bridge to Tauri backend. Invoke commands, listen to events, manage windows. | HIGH |
| @tauri-apps/plugin-shell | 2.x | Shell plugin JS API | Frontend API for tauri-plugin-shell. May be used to start daemon from renderer if needed. | HIGH |

### Development Tools

| Tool | Purpose | Notes | Confidence |
|------|---------|-------|------------|
| Biome | Linting + formatting | Replace ESLint + Prettier with single tool. 10-25x faster. One config file. Biome 2.0 (Jun 2025) added type inference. Covers 80%+ of ESLint rules. Use for all JS/TS/JSX/TSX. | HIGH |
| cargo-tauri (CLI) | Tauri build/dev | `cargo install tauri-cli`. Handles dev server, building, bundling. Works with Cargo workspaces. | HIGH |
| cargo-watch | Rust hot reload | Auto-rebuild Rust code on changes during development. | MEDIUM |
| Rust Analyzer | Rust IDE support | LSP server for Rust. Configure for workspace root. | HIGH |

## Project Structure

```
kobo/
  Cargo.toml              # Workspace root
  package.json            # Frontend deps + scripts
  vite.config.ts          # Vite config (devUrl for Tauri)
  biome.json              # Linter/formatter config
  src/                    # kobo-ui (React + TypeScript)
    main.tsx
    App.tsx
    components/
    stores/               # Zustand stores
    hooks/
    lib/                  # Tauri IPC wrappers
  src-tauri/              # kobo-tauri (Tauri app crate)
    Cargo.toml
    tauri.conf.json
    capabilities/
    src/
      main.rs
      commands/           # Tauri commands
  crates/
    kobo-daemon/          # Background daemon crate
      Cargo.toml
      src/
    kobo-core/            # Shared library crate
      Cargo.toml
      src/
```

**Cargo workspace** (root `Cargo.toml`):
```toml
[workspace]
members = [
  "src-tauri",
  "crates/kobo-daemon",
  "crates/kobo-core",
]
resolver = "2"

[workspace.dependencies]
serde = { version = "1", features = ["derive"] }
serde_json = "1"
tokio = { version = "1", features = ["full"] }
git2 = "0.20"
```

## Installation

```bash
# Prerequisites
rustup update stable          # Rust 1.93+
cargo install tauri-cli        # Tauri CLI

# Frontend dependencies
npm install @xterm/xterm @xterm/addon-fit @xterm/addon-webgl @xterm/addon-web-links @xterm/addon-search @xterm/addon-serialize
npm install zustand
npm install @tauri-apps/api @tauri-apps/plugin-shell

# Dev dependencies
npm install -D typescript @types/react @types/react-dom
npm install -D vite @vitejs/plugin-react
npm install -D tailwindcss @tailwindcss/vite
npm install -D @biomejs/biome

# Initialize
npx @biomejs/biome init
npx tailwindcss init           # Not needed in v4 (CSS-first config)
```

## Alternatives Considered

| Recommended | Alternative | Why Not Alternative |
|-------------|-------------|---------------------|
| Tauri v2 | Electron | 10-30x larger binary, higher RAM usage, no Rust backend. Kobo's architecture demands Rust (daemon, PTY management, git2). Electron would mean Node.js daemon instead. |
| Tauri v2 | Wails (Go) | Smaller ecosystem, no sidecar support, would require Go daemon instead of Rust. Less mature plugin system. |
| xterm.js 6.x | Custom canvas renderer | Massive engineering effort for marginal gain. xterm.js is battle-tested (powers VS Code terminal), handles edge cases (Unicode, mouse, accessibility). |
| xterm.js 6.x | xterm.js 5.x | v5 packages (`xterm`, `xterm-addon-*`) are deprecated. v6 under `@xterm` scope is current. v6 removed canvas renderer (use WebGL or DOM). |
| Direct xterm.js | xterm-for-react wrapper | Wrapper libraries are abandoned/unmaintained (last updates 2022-2023). Write a thin React hook (~50 lines) instead. Gives full control over lifecycle. |
| Zustand | Redux Toolkit | Overkill for desktop app. Actions/reducers/slices add ceremony without benefit. Kobo has maybe 5-6 stores (panes, sessions, preferences, daemon connection, command palette). Zustand handles this in 1/3 the code. |
| Zustand | Jotai | Good for fine-grained atomic state, but Kobo's state is mostly interconnected (pane layout affects multiple components). Zustand's single-store pattern maps better to "session list" and "pane layout" domains. |
| Biome | ESLint + Prettier | Two tools, six packages for React/TS, two config files. Biome does both in one binary, 10-25x faster. Biome 2.0 has type inference. Only skip Biome if you need a specific ESLint plugin (unlikely for Kobo). |
| Vite 7.x | Vite 6.x | Vite 6 still supported with security backports, but v7 is stable and the official recommendation. Smooth migration (just deprecated feature removal). |
| Vite 7.x | Vite 8 (beta) | Rolldown-based, not stable yet. Do not use in production. |
| TypeScript 5.9.x | TypeScript 6.0 (beta) | TS 6.0 beta dropped Feb 11 2026 -- literally yesterday. Use 5.9.x for stability. Upgrade to 6.0 after it ships stable. |
| portable-pty | tauri-plugin-pty | The Tauri PTY plugin is convenient but couples PTY management to the Tauri process. Kobo needs PTY ownership in the daemon (separate process), so portable-pty in kobo-daemon is correct. tauri-plugin-pty would only work if PTYs lived in the Tauri app process. |
| git2 (Rust) | Command-line git via std::process::Command | git2 is faster (no process spawn overhead), safer (typed API), and doesn't require git to be installed. Kobo needs programmatic access to init/commit/diff/log -- git2 is the right tool. |
| Unix domain socket IPC | gRPC / HTTP localhost | Unix sockets are lower latency, no port conflicts, file-permission based security (0600). gRPC adds protobuf complexity. HTTP localhost is slower and port-conflict-prone. Unix socket is the standard for local daemon IPC. |

## What NOT to Use

| Avoid | Why | Use Instead |
|-------|-----|-------------|
| `xterm` npm package (unscoped) | Deprecated since v5.4. Will not receive updates. Security risk from unmaintained deps. | `@xterm/xterm` (scoped package) |
| `xterm-addon-*` packages | Deprecated alongside unscoped `xterm`. | `@xterm/addon-*` packages |
| xterm.js Canvas renderer | Removed in v6.0.0. No longer available. | WebGL addon (`@xterm/addon-webgl`) for GPU rendering, DOM renderer as fallback |
| xterm-for-react / react-xterm | Unmaintained wrappers (last updated 2022-2023). Don't support xterm.js v6. | Write a custom React hook/component (~50 lines). Use useRef + useEffect for lifecycle. |
| Electron | 200MB+ binary, Node.js runtime overhead, no native Rust integration | Tauri v2 |
| tauri-plugin-pty | Ties PTY lifecycle to Tauri app process. When app closes, PTYs die. Breaks the daemon persistence requirement. | `portable-pty` crate in kobo-daemon |
| Redux / MobX | Over-engineered for a desktop app with 5-6 state domains. | Zustand |
| Prettier (standalone) | Redundant if using Biome. Two formatters = conflicts. | Biome (handles both linting and formatting) |
| ESLint (standalone) | Requires 6+ packages for React/TS setup. Slower. | Biome |
| Node.js daemon | Would require separate Node.js runtime bundled with app. Defeats purpose of Rust backend. | Rust binary (kobo-daemon) as Tauri sidecar |
| TypeScript 6.0 beta | Released Feb 11 2026. Too new for production. | TypeScript 5.9.x |

## Stack Patterns by Variant

**If adding WebSocket streaming later (e.g., remote daemon):**
- Use `tokio-tungstenite` in kobo-daemon for WebSocket server
- Use `@xterm/addon-attach` on frontend for WebSocket-based terminal attach
- Because this enables remote daemon connections without changing the xterm.js integration

**If targeting Windows in v1.1:**
- Replace `nix` crate with conditional compilation (`#[cfg(unix)]` / `#[cfg(windows)]`)
- Use named pipes instead of Unix sockets on Windows
- portable-pty already handles Windows PTY (ConPTY)
- Because Windows has no Unix domain sockets (though recent Windows 10+ has limited support)

**If xterm.js WebGL addon causes issues (rare GPU compatibility):**
- Fall back to DOM renderer (built into @xterm/xterm, no addon needed)
- Detect WebGL2 availability at runtime, load addon conditionally
- Because some VMs and old hardware lack WebGL2 support

## Version Compatibility

| Package A | Compatible With | Notes |
|-----------|-----------------|-------|
| tauri@2.10.x (Rust) | @tauri-apps/api@2.x (npm) | Major versions must match. Tauri CLI handles version alignment. |
| tauri@2.10.x | tokio@1.x | Tauri v2 uses tokio 1.x internally. Do NOT add tokio 2.x (does not exist yet, but do not use a different runtime). |
| @xterm/xterm@6.0.x | @xterm/addon-*@6.0.x | All @xterm packages version together. Do not mix v5 addons with v6 core. |
| React@19.2.x | TypeScript@5.9.x | Fully supported. React 19 types ship with @types/react@19. |
| Vite@7.3.x | @vitejs/plugin-react@latest | Use latest plugin-react. Vite 7 has no breaking changes for React plugin. |
| Tailwind@4.1.x | Vite@7.x | Use `@tailwindcss/vite` plugin. No PostCSS config needed in v4. |
| git2@0.20.x | Rust 1.93.x | Fully compatible. git2 supports recent stable Rust. |
| portable-pty@0.9.0 | Rust 1.93.x | Compatible. From wezterm ecosystem, actively maintained. |

## Key Architecture Decisions Driven by Stack

1. **Daemon as Tauri sidecar**: kobo-daemon is compiled as a separate binary, bundled via Tauri's `externalBin` config. Tauri app launches it if not already running. Communication over Unix domain socket at `~/.kobo/kobo.sock`.

2. **PTY ownership in daemon, not Tauri app**: portable-pty runs in kobo-daemon. This is what makes sessions persist across app restarts. The Tauri app is just a viewer/controller.

3. **xterm.js receives data via Tauri IPC, not WebSocket**: Data flow is `daemon -> Unix socket -> kobo-tauri (Rust) -> Tauri event -> kobo-ui (React) -> xterm.js.write()`. No WebSocket server needed for v1.

4. **git2 in kobo-core (shared crate)**: Both daemon (for auto-versioning) and Tauri app (for UI operations like diff/log) may need git operations. Placing git2 wrappers in kobo-core avoids duplication.

5. **Zustand stores mirror daemon state**: Frontend stores are projections of daemon state, synced via Tauri events. Daemon is source of truth. UI never directly modifies session state without daemon round-trip.

## Sources

- Tauri v2 releases: https://github.com/tauri-apps/tauri/releases -- verified v2.10.2 (Feb 4, 2026) [HIGH]
- Tauri v2 sidecar docs: https://v2.tauri.app/develop/sidecar/ -- sidecar pattern, externalBin config [HIGH]
- Tauri v2 IPC docs: https://v2.tauri.app/concept/inter-process-communication/ -- commands + events patterns [HIGH]
- Tauri v2 async runtime: https://docs.rs/tauri/latest/tauri/async_runtime/ -- tokio integration [HIGH]
- xterm.js GitHub: https://github.com/xtermjs/xterm.js -- verified v6.0.0 (Dec 22, 2024), addon list [HIGH]
- xterm.js releases: https://github.com/xtermjs/xterm.js/releases -- @xterm scope migration confirmed [HIGH]
- portable-pty: https://crates.io/crates/portable-pty -- v0.9.0 (Feb 2025) [HIGH]
- git2-rs: https://github.com/rust-lang/git2-rs -- v0.20.3, libgit2 1.9.x [HIGH]
- tokio: https://github.com/tokio-rs/tokio -- LTS 1.43.x (until Mar 2026), 1.47.x (until Sep 2026) [HIGH]
- keyring-rs: https://github.com/hwchen/keyring-rs -- cross-platform credential storage [MEDIUM]
- Zustand: https://github.com/pmndrs/zustand -- v5.0.11, npm ecosystem leader for lightweight state [HIGH]
- Tailwind CSS v4: https://tailwindcss.com/blog/tailwindcss-v4 -- v4.1.18 current [HIGH]
- Vite 7: https://vite.dev/blog/announcing-vite7 -- v7.3.1 stable [HIGH]
- React 19: https://react.dev/blog/2024/12/05/react-19 -- v19.2.4 current (Jan 2026) [HIGH]
- TypeScript: https://github.com/microsoft/typescript/releases -- v5.9.3 stable, 6.0 beta [HIGH]
- Rust 2024 Edition: https://blog.rust-lang.org/2025/02/20/Rust-1.85.0/ -- Edition 2024 stable [HIGH]
- Biome: https://biomejs.dev/ -- linter+formatter, Biome 2.0 with type inference [MEDIUM]
- tauri-plugin-shell: https://crates.io/crates/tauri-plugin-shell -- v2.3.4 (Jan 2026) [HIGH]
- Rust IPC patterns: https://medium.com/@alfred.weirich/inter-process-communication-ipc-with-rust-on-unix-linux-and-macos-6253084819b7 -- Unix socket best practices (Jan 2026) [MEDIUM]
- tauri-plugin-pty: https://crates.io/crates/tauri-plugin-pty -- exists but wrong pattern for daemon architecture [MEDIUM]
- Tauri terminal examples: https://github.com/marc2332/tauri-terminal, https://github.com/Shabari-K-S/terminon -- real-world Tauri+xterm.js projects [MEDIUM]

---
*Stack research for: Kobo -- chat-friendly tmux for AI conversations*
*Researched: 2026-02-12*
