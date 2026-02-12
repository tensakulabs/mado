# Kobo

## What This Is

Kobo is a chat-friendly tmux for AI conversations — a multi-pane desktop app that wraps Claude CLI with session persistence, detach/reattach semantics, and local git versioning. It's designed for both developers and normal users: powerful enough for power users with tmux-like keyboard shortcuts, approachable enough for non-technical users with mouse support, friendly vocabulary, and contextual onboarding.

## Core Value

Users can run multiple AI conversations simultaneously in a spatial interface, with sessions that persist across app restarts and changes tracked via local git.

## Requirements

### Validated

(None yet — ship to validate)

### Active

- [ ] Multi-pane interface with xterm.js rendering
- [ ] Session persistence via daemon (survives app close)
- [ ] Detach/reattach semantics (close app, reopen, sessions still there)
- [ ] Local git versioning (milestones, restore, diff)
- [ ] Per-pane [+N -M] change indicators with save action
- [ ] Keyboard shortcuts (tmux-like prefix) + full mouse support
- [ ] Command palette (Cmd+K)
- [ ] Status bar + toolbar
- [ ] Claude CLI integration (v1 provider)
- [ ] Model selection (opus/sonnet/haiku)
- [ ] Friendly UX for normal users (conversations/spaces vocabulary)
- [ ] Undo/preview for destructive actions
- [ ] Escape hatch (Home button returns to single view)
- [ ] Contextual hints (not tutorials)
- [ ] Offline resilience

### Out of Scope

- Windows support — deferred to v1.1, macOS + Linux first
- Multi-provider UI — v1 is Claude CLI only (architecture abstracted for future)
- Real-time collaboration — single-user app
- Cloud sync — local-first, no server
- Config file (~/.koborc) — deferred to v1.1
- Themes — deferred to v1.1
- Scripting/CLI automation — deferred to v1.1

## Context

**Origin:** Council debate identified that the previous kobo implementation had wrong mental model (chat bubbles instead of panes) and no tmux integration. Decision: full frontend rewrite, keep Rust process management patterns, build daemon architecture from scratch.

**Architecture (4-layer):**
1. **kobo-daemon** (Rust) — Background service owning all Claude CLI processes, survives app close, Unix socket IPC, session state in ~/.kobo/, local git for versioning per session
2. **kobo-core** (Rust library) — Shared types, trait AIProvider abstraction, git operations, client API for daemon
3. **kobo-tauri** (Rust app) — Desktop shell connecting to daemon, IPC bridge, window management
4. **kobo-ui** (React + TypeScript + Tailwind) — xterm.js panes, layout manager, toolbar, command palette

**UX Principles (from Council):**
- Vocabulary: "Conversations" and "Spaces" (not sessions/panes)
- Single-space default view, multi-pane available immediately (not gated)
- Complexity surfaces via spatial expansion, not unlocking
- Tiers in state machine, invisible in UI
- Ambient visual cues (dormant looks dormant)
- Fast feedback loops (< 200ms acknowledgment)

**Git Features:**
- Per-pane change indicators [+N -M] showing file changes in workspace
- Click indicator to see file breakdown
- Manual save/commit creates milestone
- Timeline view, diff, restore
- Project = git repo awareness (optional)

## Constraints

- **Platform**: macOS + Linux (v1), Windows deferred
- **Provider**: Claude CLI only for v1, but trait AIProvider abstracted for future providers
- **Security**: API keys in Keychain (macOS) / libsecret (Linux), sandboxed processes, Unix socket permissions (0600)
- **Tech Stack**: Rust (daemon, core, Tauri), React + TypeScript + Tailwind (UI), xterm.js (terminal rendering)

## Key Decisions

| Decision | Rationale | Outcome |
|----------|-----------|---------|
| 4-layer architecture with daemon | Session persistence requires processes to survive app close | — Pending |
| xterm.js for pane rendering | Battle-tested, accessibility features, no abstraction tax | — Pending |
| Local git for versioning | Gives users milestones/restore without server, familiar to devs | — Pending |
| Claude CLI only for v1 | Reduce scope, but trait abstraction allows future providers | — Pending |
| "Conversations/Spaces" vocabulary | Approachable for non-devs, avoids tmux jargon | — Pending |
| Multi-pane available immediately | Not gated/tiered, just default to single view | — Pending |

---
*Last updated: 2026-02-12 after initialization*
