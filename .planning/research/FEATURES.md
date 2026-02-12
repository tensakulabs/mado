# Feature Research

**Domain:** Multi-pane AI chat desktop app (terminal multiplexer UX meets AI conversation management)
**Researched:** 2026-02-12
**Confidence:** MEDIUM-HIGH (feature landscape is well-established across terminal multiplexers, AI chat apps, and IDE panels; Kobo's unique intersection is novel but draws from proven patterns)

## Feature Landscape

### Table Stakes (Users Expect These)

Features users assume exist. Missing these = product feels incomplete.

| Feature | Why Expected | Complexity | Notes |
|---------|--------------|------------|-------|
| **Multi-pane split view** | Core promise of the product. iTerm2, tmux, Zellij, Windows Terminal, Warp all support horizontal/vertical splits. Users expect to see multiple conversations simultaneously. | MEDIUM | xterm.js supports multiple instances but performance degrades with count (2 panes ~30fps, 4 ~15fps per GitHub #3368). Must budget for this. |
| **Pane resize (drag + keyboard)** | Every terminal multiplexer supports this. Windows Terminal, Warp, Zellij all allow both mouse drag and keyboard-driven resize. Missing it = broken feel. | LOW | Standard drag handle between panes + keyboard shortcut (e.g., prefix + arrow). |
| **Session persistence across app restarts** | tmux's defining feature. Zellij preserves running processes, logs, pane positions, scroll history. Users of any multiplexer-like tool expect "close app, reopen, everything is still there." | HIGH | Requires daemon architecture (already planned). tmux-resurrect/tmux-continuum patterns. This is the hardest table stake. |
| **Keyboard shortcuts** | Every terminal app from tmux to Kitty to Ghostty is keyboard-driven. Professional users expect keyboard-first interaction. Warp, iTerm2, Zellij all have extensive keybinding systems. | MEDIUM | tmux-like prefix key system already planned. Must not conflict with OS shortcuts or accessibility keys (per W3C keyboard interface guidelines). |
| **Mouse support (click, select, drag)** | iTerm2, Warp, Windows Terminal, Zellij all support mouse interaction. Kobo targets "normal users" -- mouse is essential, not optional. | MEDIUM | Click to focus pane, drag to resize, scroll within pane. Must coexist cleanly with keyboard shortcuts. |
| **Copy/paste** | Universal expectation. iTerm2 has advanced paste (edit before pasting, base64, transform). Minimum: Cmd+C/Cmd+V that works reliably across panes. | LOW | Platform clipboard integration via Tauri. Consider copy-on-select as option (iTerm2 "Unixyness"). |
| **Scrollback / history** | Every terminal emulator provides scrollback. iTerm2 has "Instant Replay" (time-travel through terminal output). Users expect to scroll up through conversation history. | LOW-MEDIUM | xterm.js scrollback buffer. Memory consideration: ~34MB per 160x24 terminal with 5000 lines scrollback. |
| **New conversation creation** | Equivalent of "new tab" in every terminal app. Must be instant and obvious. | LOW | Button + keyboard shortcut. Consider Cmd+T (standard new tab) and Cmd+N (new window). |
| **Close/kill conversation** | Every tab/pane system supports closing individual items. Must have confirmation for active conversations (undo/preview pattern from PROJECT.md). | LOW | Destructive action -- needs undo/preview per project requirements. |
| **Status bar** | Zellij has persistent status bar showing keybindings and mode. tmux has status line. Warp has rich UI chrome. Users expect ambient information about state. | LOW | Show: active conversations count, current model, connection status, keyboard mode indicator. |
| **Search within conversation** | iTerm2 has robust find-on-page with regex. Cursor has Ctrl+F within chat. ChatGPT/Claude web have search. Users expect to find things in long conversations. | MEDIUM | Cmd+F within active pane. Highlight all matches (iTerm2 pattern). |
| **Model selection** | Every multi-model AI interface (TypingMind, Poe, Cursor) has model switching. Kobo plans opus/sonnet/haiku selection. Standard dropdown or selector pattern. | LOW | Position at top of conversation or in command palette. Allow per-conversation model selection. Don't allow mid-conversation model switching without clear indication. |
| **Visual focus indicator** | iTerm2 dims inactive panes. tmux highlights active pane border. Zellij uses color-coded borders. Users must instantly know which pane is active. | LOW | Active pane border highlight + dimming inactive panes. Critical for spatial orientation. |
| **Window management (maximize/restore pane)** | tmux prefix+z zooms a pane to full screen. Zellij supports floating panes. Users expect to temporarily maximize one conversation for focus, then return to multi-pane. | LOW-MEDIUM | Essential "escape hatch" -- already planned as Home button. This is the same concept: zoom a pane, then unzoom. |
| **Responsive/adaptive layout** | Window resize should reflow panes intelligently, not clip or break them. | MEDIUM | Layout engine must handle window resize events. Consider minimum pane size constraints. |

### Differentiators (Competitive Advantage)

Features that set the product apart. Not required, but valuable. Organized by alignment with Kobo's "chat-friendly tmux for AI" vision.

| Feature | Value Proposition | Complexity | Notes |
|---------|-------------------|------------|-------|
| **Per-pane [+N -M] change indicators** | Unique to Kobo. No AI chat app or terminal multiplexer tracks workspace file changes per conversation. This bridges "AI is doing work" with "what actually changed." Makes AI conversations actionable, not just readable. | HIGH | Already planned. Requires local git integration, file system watching, and per-pane diffing. Click to expand file breakdown is the key UX. Inspired by VS Code gutter indicators and GitKraken diff patterns. |
| **Local git versioning (milestones/restore/diff)** | No AI chat app has built-in version control. ChatGPT/Claude have conversation history but no snapshots or restore. GitButler's "snapshot" concept applied to AI conversations. Users can save state, compare states, restore. | HIGH | Already planned. GitButler's UX of "glanceable, visually clear" change history is the target. Timeline view must be simple enough for non-devs ("Save point" not "commit"). |
| **Daemon persistence (conversations survive everything)** | Goes beyond typical "session persistence." tmux-resurrect requires manual save. Zellij auto-persists but only within its own sessions. Kobo's daemon means conversations persist even if the app crashes, is force-quit, or macOS kills it. This is "tmux reliability for everyone." | HIGH | Already planned. Daemon owns all processes. The differentiator vs. competitors isn't the feature itself but the reliability guarantee and the approachable UX around it. |
| **Command palette (Cmd+K)** | Emerging standard in professional tools (VS Code, Linear, GitHub, Warp). Not yet common in AI chat apps. Provides keyboard-first power without memorizing shortcuts. Fuzzy search across: conversations, actions, settings, model switching. | MEDIUM | Already planned. Follow established patterns: hotkey to open, fuzzy search, recent items, categorized results. Make it the "I don't know where X is" answer. |
| **Conversation branching / forking** | LibreChat implements this. ChatGPT supports message editing with branching. Fork a conversation at any point to explore different directions. "Version control for AI conversations." Aligns with git versioning. | HIGH | NOT yet planned but strongly recommended. Combines naturally with git versioning (branch = git branch). LibreChat and ChatGPT's "edit and regenerate" show user demand. |
| **Friendly vocabulary ("Conversations" / "Spaces")** | Most AI tools use developer jargon. Kobo's "Conversations and Spaces" vocabulary makes multi-pane interaction accessible to non-developers. Zellij tries this (status bar shows keybindings) but still targets developers only. | LOW | Already planned. Apply consistently: never "session," never "pane" in UI. Use "Conversation" and "Space." The vocabulary IS the differentiator for non-dev users. |
| **Contextual hints (not tutorials)** | Zellij shows keybindings in status bar. Most apps either have no onboarding or force full tutorials. Kobo's approach: surface hints when relevant, dismiss easily, recall later. Nielsen Norman Group calls this "pull revelations." | MEDIUM | Already planned. Best practice: 3-5 tooltips max for onboarding. Hotspots for feature discovery. Must be dismissible and recallable. |
| **Drag-and-drop pane rearrangement** | Warp supports drag-and-drop panes. Windows Terminal has it for tabs. Most terminal multiplexers are keyboard-only for layout changes. Mouse-driven rearrangement is essential for "normal users." | MEDIUM | NOT yet explicitly planned. Strongly recommended for v1. Non-dev users will try to drag panes. If it doesn't work, the "chat friend" promise breaks. |
| **Layout presets / templates** | Zellij's layout system is its killer feature: define layout once, restore everything. Kobo could offer "Focus" (1 pane), "Side-by-side" (2 panes), "Quad" (4 panes), custom saved layouts. One-click workspace setup. | MEDIUM | NOT yet planned. Recommend for v1.1. Reduces friction for repeated workflows. Zellij proves users love this. |
| **Ambient state indicators (dormant looks dormant)** | Already in UX principles. Visually distinguish: active conversation (AI responding), idle conversation (waiting for input), dormant/detached conversation. Unique to Kobo. No chat app makes conversation state spatially visible. | LOW-MEDIUM | Already planned as UX principle. Implementation: subtle animation for active, full brightness for idle, dimmed/muted for dormant. < 200ms feedback loops. |
| **Offline resilience** | Most AI chat apps fail completely offline. Kobo can show conversation history (from git), allow composing messages (queue for send), show clear offline state. Graceful degradation, not error screens. | MEDIUM | Already planned. Local-first architecture makes this achievable. Queue unsent messages, show clear connectivity state, allow browsing history offline. |
| **Undo/preview for destructive actions** | No terminal multiplexer has this. ChatGPT's "are you sure?" dialogs are modal and annoying. Kobo's approach: preview what will happen, undo within time window. Gmail's "undo send" pattern applied to conversation management. | MEDIUM | Already planned. Apply to: close conversation, delete conversation, clear history, layout changes. Toast with "Undo" button (8-second window per UX research). |

### Anti-Features (Commonly Requested, Often Problematic)

Features that seem good but create problems. Explicitly NOT building these.

| Feature | Why Requested | Why Problematic | Alternative |
|---------|---------------|-----------------|-------------|
| **Real-time collaboration / multiplayer** | "Google Docs for AI conversations." Sounds cool, demos well. | Enormous complexity (CRDT/OT for sync, conflict resolution, permissions, networking). Kobo is a personal tool. Zellij has multiplayer but it's a major complexity source. Single-user simplicity is a feature. | Export/share conversation snapshots. Share via git (push to remote). Keep architecture single-user. |
| **Cloud sync** | "Access conversations from any device." Standard expectation from web apps. | Requires server infrastructure, accounts, authentication, sync conflict resolution, ongoing hosting costs. Betrays local-first principle. Adds latency. Privacy concerns. | Local git repos can be pushed to private GitHub/remote. Users own their data. v2+ consideration if demand proven. |
| **Built-in AI model API management** | "Let me paste my API key and talk directly to Claude API." Bypasses CLI. | Kobo is a CLI wrapper, not an API client. Managing API keys, token counting, rate limiting, billing is a different product. TypingMind already does this well. | Wrap Claude CLI (v1 plan). Trait abstraction for future providers. Let the CLI handle auth/billing. |
| **Plugin/extension system** | "Let me extend Kobo with custom functionality." Zellij has WASM plugins. | Premature for v1. Plugin APIs create stability contracts. WASM plugins are complex. Extension ecosystems need critical mass to be valuable. Zellij invested years in this. | Ship solid core. Evaluate plugin demand post-v1. If needed, start with simple hook points, not full plugin API. |
| **Themes / visual customization** | "I want dark mode / light mode / custom colors." Warp has theme builder. Kitty/Ghostty have extensive theming. | Scope creep. Theming touches every component. Testing multiplies. Preferences UI is deceptively complex. | Ship one well-designed dark theme. Add light mode in v1.1. Defer full theming to v1.1+ (per PROJECT.md). |
| **Scripting / CLI automation** | "Let me script Kobo from the command line." tmux is fully scriptable. | Requires stable CLI API, documentation, testing of script interactions. Changes development velocity. | Defer to v1.1 (per PROJECT.md). Daemon's Unix socket is the foundation; scripting layer can be added later without architecture changes. |
| **Windows support for v1** | "I'm on Windows." Large potential user base. | Daemon architecture uses Unix sockets (0600 permissions). Windows has named pipes. Different process management. Different keychain (Credential Manager). Testing matrix doubles. | macOS + Linux first (per PROJECT.md). Windows deferred to v1.1. Tauri supports Windows; the daemon layer is the blocker. |
| **Multi-provider UI in v1** | "Let me also use GPT, Gemini, local models." | Each provider has different capabilities, token limits, streaming behavior, error patterns. UI must handle all variations. Testing multiplies per provider. | Claude CLI only for v1 (per PROJECT.md). Trait AIProvider abstraction already planned. Architecture supports it; UI doesn't need to yet. |
| **Chat bubble UI** | "Make it look like iMessage/WhatsApp." Familiar to users. | PROJECT.md explicitly calls this out as the wrong mental model. Kobo is panes/terminal, not chat bubbles. Chat bubbles waste horizontal space, don't support multi-pane well, and create wrong expectations about the product's nature. | xterm.js terminal rendering. Conversation is a terminal session, not a chat thread. The terminal IS the interface. |
| **"AI agent" autonomous mode** | "Let the AI run commands without my approval." Warp has agent mode. Cursor has agent mode. | Dangerous for non-technical users. Kobo targets "both developers AND normal users." Autonomous execution without understanding is a liability. | Explicit approval for all actions. Show what will happen (preview). Let the underlying CLI (Claude Code) handle agentic behavior with its own safety rails. |

## Feature Dependencies

```
[Multi-pane split view]
    |-- requires --> [Visual focus indicator] (must know which pane is active)
    |-- requires --> [Pane resize]
    |-- requires --> [Responsive/adaptive layout]
    |-- enhances with --> [Drag-and-drop rearrangement]
    |-- enhances with --> [Layout presets]

[Session persistence]
    |-- requires --> [Daemon architecture] (processes must survive app close)
    |-- requires --> [Detach/reattach protocol] (IPC reconnection)
    |-- enhances with --> [Ambient state indicators] (show dormant vs active)

[Local git versioning]
    |-- requires --> [Per-pane change indicators] (git diff per workspace)
    |-- requires --> [Daemon file watching] (detect changes to track)
    |-- enhances with --> [Conversation branching] (branch = git branch)
    |-- enhances with --> [Timeline view / diff / restore]

[Command palette]
    |-- requires --> [Action registry] (catalog of all available actions)
    |-- enhances with --> [Fuzzy search]
    |-- enhances with --> [Model selection] (can switch model from palette)

[Keyboard shortcuts]
    |-- conflicts with --> [OS accessibility shortcuts] (must not override)
    |-- enhances with --> [Command palette] (discoverability for shortcuts)
    |-- enhances with --> [Contextual hints] (teach shortcuts in context)

[Undo/preview for destructive actions]
    |-- requires --> [Toast notification system] (show undo option)
    |-- requires --> [Action queue/delay] (buffer before executing)

[Conversation branching]
    |-- requires --> [Local git versioning] (branching needs version control)
    |-- requires --> [UI for branch navigation] (switch between branches)
    |-- conflicts with --> [Simple conversation list] (branches add complexity)

[Contextual hints]
    |-- requires --> [User state tracking] (know what user has seen/done)
    |-- conflicts with --> [Tutorial/wizard onboarding] (choose one approach)
```

### Dependency Notes

- **Multi-pane requires focus indicator:** Without knowing which pane is active, multi-pane is unusable. Focus indicator is a prerequisite, not an enhancement.
- **Git versioning enables branching:** Conversation branching is a natural extension of git versioning. If git is in place, branching becomes a feature of the version control layer, not a separate system.
- **Command palette requires action registry:** The palette searches across all available actions. This means every feature must register itself with the palette system. Build the registry pattern early.
- **Keyboard shortcuts must not conflict with OS accessibility:** Per W3C guidance, avoid single-letter shortcuts and common screen reader shortcuts. Use prefix key (tmux-style Ctrl+B) to namespace Kobo shortcuts.
- **Conversation branching conflicts with simple conversation list:** Branching adds tree navigation complexity. If implemented, the conversation sidebar must handle branches, not just a flat list. Consider deferring to v1.1 if the sidebar UX isn't solved.

## MVP Definition

### Launch With (v1)

Minimum viable product -- what's needed to validate the concept of "chat-friendly tmux for AI."

- [ ] **Multi-pane split view** -- Core promise. Without this, there's no product. Horizontal and vertical splits, 2-4 panes.
- [ ] **Session persistence via daemon** -- Without persistence, it's just another chat wrapper. Daemon must survive app close, crash, macOS force-quit.
- [ ] **Keyboard shortcuts (tmux-like prefix)** -- Power users won't adopt without keyboard-first interaction. Prefix + key pattern.
- [ ] **Mouse support (click, drag, resize)** -- Normal users won't adopt without mouse. Click to focus, drag to resize, scroll.
- [ ] **Command palette (Cmd+K)** -- Bridge between keyboard-first and mouse-first users. "I don't know how to do X" always has an answer.
- [ ] **Per-pane change indicators [+N -M]** -- Key differentiator. Without this, Kobo is just tmux with a GUI. This makes AI conversations actionable.
- [ ] **Local git versioning (save/restore)** -- Second key differentiator. "Save milestone" + "restore to previous state" at minimum.
- [ ] **Status bar** -- Ambient information: model, connection, mode. Cheap to build, high information density.
- [ ] **Visual focus indicator** -- Required by multi-pane. Active pane highlight + inactive dimming.
- [ ] **Copy/paste** -- Table stakes. Cmd+C/Cmd+V must work.
- [ ] **Search within conversation** -- Table stakes. Cmd+F within active pane.
- [ ] **Model selection (opus/sonnet/haiku)** -- Planned requirement. Dropdown or palette-integrated selection.
- [ ] **Undo/preview for destructive actions** -- Planned requirement. Toast with undo for close/delete.
- [ ] **Friendly vocabulary throughout UI** -- "Conversations" and "Spaces" everywhere. No jargon.
- [ ] **Contextual hints** -- First-run experience. Hotspots for key features. Dismissible and recallable.
- [ ] **Scrollback / history** -- Table stakes. Scroll up through conversation output.

### Add After Validation (v1.x)

Features to add once core is working and initial users provide feedback.

- [ ] **Conversation branching / forking** -- Add when git versioning is solid and users request it
- [ ] **Drag-and-drop pane rearrangement** -- Add when multi-pane layout is stable
- [ ] **Layout presets / templates** -- Add when users demonstrate repeated layout patterns
- [ ] **Timeline view with visual diff** -- Add when basic save/restore is validated
- [ ] **Offline message queuing** -- Add when online flow is solid
- [ ] **Light mode** -- Add when dark mode is polished
- [ ] **Config file (~/.koborc)** -- Add when users need persistent preferences beyond defaults

### Future Consideration (v2+)

Features to defer until product-market fit is established.

- [ ] **Plugin system** -- Defer until core is stable and user demand is clear
- [ ] **Full theming** -- Defer until design system is mature
- [ ] **Scripting/CLI automation** -- Defer until daemon API is stable
- [ ] **Windows support** -- Defer until daemon architecture is proven on macOS/Linux
- [ ] **Multi-provider UI** -- Defer until trait abstraction is proven with one provider
- [ ] **Cloud sync** -- Defer indefinitely unless local-first proves insufficient
- [ ] **Multiplayer/collaboration** -- Defer indefinitely; contradicts single-user simplicity

## Feature Prioritization Matrix

| Feature | User Value | Implementation Cost | Priority |
|---------|------------|---------------------|----------|
| Multi-pane split view | HIGH | MEDIUM | P1 |
| Session persistence (daemon) | HIGH | HIGH | P1 |
| Keyboard shortcuts | HIGH | MEDIUM | P1 |
| Mouse support | HIGH | MEDIUM | P1 |
| Visual focus indicator | HIGH | LOW | P1 |
| Copy/paste | HIGH | LOW | P1 |
| Scrollback/history | HIGH | LOW | P1 |
| Status bar | MEDIUM | LOW | P1 |
| New/close conversation | HIGH | LOW | P1 |
| Per-pane change indicators | HIGH | HIGH | P1 |
| Local git versioning | HIGH | HIGH | P1 |
| Command palette | HIGH | MEDIUM | P1 |
| Model selection | MEDIUM | LOW | P1 |
| Search within conversation | MEDIUM | MEDIUM | P1 |
| Undo/preview destructive actions | MEDIUM | MEDIUM | P1 |
| Friendly vocabulary | HIGH | LOW | P1 |
| Contextual hints | MEDIUM | MEDIUM | P1 |
| Pane resize (drag + keyboard) | HIGH | LOW | P1 |
| Responsive layout | MEDIUM | MEDIUM | P1 |
| Ambient state indicators | MEDIUM | LOW | P1 |
| Conversation branching | HIGH | HIGH | P2 |
| Drag-and-drop rearrangement | MEDIUM | MEDIUM | P2 |
| Layout presets | MEDIUM | MEDIUM | P2 |
| Timeline view with diff | MEDIUM | HIGH | P2 |
| Offline message queuing | LOW | MEDIUM | P2 |
| Light mode | LOW | MEDIUM | P2 |
| Config file | LOW | MEDIUM | P2 |
| Plugin system | LOW | HIGH | P3 |
| Full theming | LOW | HIGH | P3 |
| Scripting/CLI automation | LOW | HIGH | P3 |
| Windows support | MEDIUM | HIGH | P3 |
| Multi-provider UI | MEDIUM | HIGH | P3 |

**Priority key:**
- P1: Must have for launch
- P2: Should have, add when possible (v1.x)
- P3: Nice to have, future consideration (v2+)

## Competitor Feature Analysis

| Feature | tmux | Zellij | Warp | iTerm2 | ChatGPT/Claude Web | Kobo (Planned) |
|---------|------|--------|------|--------|---------------------|----------------|
| Multi-pane | Yes (keyboard) | Yes (keyboard + floating) | Yes (drag + keyboard) | Yes (mouse + keyboard) | No | Yes (keyboard + mouse + drag) |
| Session persistence | Yes (server) | Yes (background server) | No (terminal only) | Via tmux integration | No (cloud-based) | Yes (daemon) |
| Version control | No | No | No | No | No (edit creates branch) | Yes (local git) |
| Change indicators | No | No | No | No | No | Yes ([+N -M]) |
| Command palette | No | No | Yes | No | No | Yes (Cmd+K) |
| Mouse-first UX | No | Partial | Yes | Yes | Yes | Yes |
| Non-dev friendly | No | Partial (status bar helps) | Partial (AI helps) | No | Yes | Yes (vocabulary, hints) |
| Conversation branching | N/A | N/A | N/A | N/A | Yes (edit message) | Planned (v1.x) |
| AI integration | No | No | Yes (Warp AI) | No | Core product | Core product |
| Model selection | N/A | N/A | Limited | N/A | Yes | Yes |
| Offline capability | Full (local) | Full (local) | Full (local) | Full (local) | No | Partial (history + queue) |
| Plugin system | Yes (via scripts) | Yes (WASM) | Limited | Python API | No | No (v2+) |

### Key Competitive Insight

No existing product combines:
1. Terminal multiplexer spatial layout (tmux/Zellij)
2. AI conversation management (ChatGPT/Claude)
3. Local version control for conversations (novel)
4. Non-developer accessibility (partially Warp)

Kobo's unique position is at this intersection. The closest competitors are:
- **Warp** -- Has multi-pane + AI, but is a terminal emulator for developers, not a chat interface for everyone
- **Poe/TypingMind** -- Has multi-model AI chat, but no spatial layout or version control
- **tmux** -- Has the multiplexer UX, but zero accessibility for non-developers

## Sources

- [Warp All Features](https://www.warp.dev/all-features) -- Feature inventory for modern terminal with AI (MEDIUM confidence)
- [iTerm2 Features](https://iterm2.com/features.html) -- Comprehensive terminal multiplexer feature list (HIGH confidence)
- [Zellij About](https://zellij.dev/about/) -- Terminal multiplexer with emphasis on approachability (MEDIUM confidence)
- [Zellij GitHub](https://github.com/zellij-org/zellij) -- Session persistence, layout system, WASM plugins (MEDIUM confidence)
- [Ghostty Features](https://ghostty.org/docs/features) -- GPU-accelerated terminal with platform-native UI (MEDIUM confidence)
- [Kitty terminal](https://sw.kovidgoyal.net/kitty/) -- GPU-accelerated terminal with tiling and plugins (MEDIUM confidence)
- [xterm.js Performance Issues #3368](https://github.com/xtermjs/xterm.js/issues/3368) -- Multi-instance performance degradation documented (HIGH confidence)
- [xterm.js Performance #4175](https://github.com/xtermjs/xterm.js/issues/4175) -- Wide container rendering performance (HIGH confidence)
- [LibreChat Forking](https://www.librechat.ai/docs/features/fork) -- Conversation branching/forking implementation (MEDIUM confidence)
- [GitButler Undo UX #3726](https://github.com/gitbutlerapp/gitbutler/issues/3726) -- Snapshot-based undo for version control (MEDIUM confidence)
- [Poe Multi-bot Chat](https://poe.com/blog/multi-bot-chat-on-poe) -- Side-by-side AI model comparison (MEDIUM confidence)
- [TypingMind](https://www.typingmind.com/) -- Multi-model AI chat frontend (MEDIUM confidence)
- [NNGroup Onboarding vs Contextual Help](https://www.nngroup.com/articles/onboarding-tutorials/) -- Pull revelations pattern (HIGH confidence)
- [W3C Keyboard Interface](https://www.w3.org/WAI/ARIA/apg/practices/keyboard-interface/) -- Accessibility keyboard patterns (HIGH confidence)
- [Mobbin Command Palette](https://mobbin.com/glossary/command-palette) -- Command palette UX patterns (MEDIUM confidence)
- [UX of Notification Toasts](https://benrajalu.net/articles/ux-of-notification-toasts) -- Toast notification best practices (MEDIUM confidence)
- [Windows Terminal Panes](https://learn.microsoft.com/en-us/windows/terminal/panes) -- Microsoft's pane management documentation (HIGH confidence)
- [Warp Split Panes](https://docs.warp.dev/terminal/windows/split-panes) -- Drag-and-drop pane rearrangement (MEDIUM confidence)

---
*Feature research for: Kobo -- chat-friendly tmux for AI conversations*
*Researched: 2026-02-12*
