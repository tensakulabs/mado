# Chat UI Architecture Design

**Status:** Draft
**Author:** Architect Agent
**Date:** 2026-02-13
**Scope:** Rebuild Kobo from terminal-wrapper to chat UI

---

## Problem Statement

Kobo currently wraps Claude CLI in xterm.js terminals -- users see raw terminal output (ANSI escape sequences, cursor movements, control characters). This is the wrong abstraction. Users want a **chat interface** with formatted messages, a text input box, and clear visual separation between their prompts and Claude's responses. The terminal is an implementation detail that should be invisible.

The fundamental constraint is: **Claude CLI is still the engine**. We are not calling the Anthropic API directly. We are wrapping `claude -p` in a structured, programmatic way. The daemon owns the Claude process; the UI renders structured messages.

---

## Architecture Overview

### What Changes

```
CURRENT (Terminal Wrapper)                    NEW (Chat UI)
================================              ================================
User types into xterm.js                      User types into <textarea>
  |                                             |
  v                                             v
Raw bytes sent to PTY stdin                   Structured message sent to daemon
  |                                             |
  v                                             v
Claude CLI in interactive mode                claude -p --output-format stream-json
  |                                             |
  v                                             v
Raw bytes from PTY stdout                     Parsed JSON events from stdout
  |                                             |
  v                                             v
xterm.js renders ANSI                         React renders markdown bubbles
```

### What Stays the Same

- **Daemon architecture** -- separate binary, Unix socket, survives app close
- **Multi-pane layout** -- tree-based split panes with drag handles
- **Session persistence** -- sessions survive app restarts
- **Git versioning** -- milestones, diff, restore per session
- **Tauri shell** -- desktop app with IPC bridge
- **kobo-core** -- shared types, client library
- **Pane store** -- tree structure, focus management, split/close/undo

---

## Data Flow: New Architecture

### Send a Message

```
User types message in ChatInput, presses Enter
    |
    v
React dispatches to conversation store
    |
    v
invoke('send_message', { sessionId, content, model })
    |
    v
kobo-tauri command -> DaemonClient.send_message()
    |
    v
POST /sessions/:id/messages { content, model }
    |
    v
kobo-daemon ConversationManager:
    1. Append user message to conversation history
    2. Spawn: claude -p "<content>"
           --output-format stream-json
           --verbose
           --include-partial-messages
           --model <model>
           --resume <claude_session_id>     (if continuing)
           --allowedTools "Bash,Read,Edit,Glob,Grep"
           --dangerously-skip-permissions   (user configurable)
    3. Read stdout line-by-line (each line = JSON event)
    4. Parse events, broadcast structured deltas via SSE
    5. On completion: store final message, extract metadata
    |
    v
SSE events flow back through Tauri Channel to React
    |
    v
Conversation store updates, React re-renders message bubbles
```

### Stream Event Processing (Daemon Side)

```
claude -p stdout (line-delimited JSON)
    |
    v
EventParser in daemon:
    |
    +-- type: "stream_event" + delta.type: "text_delta"
    |       -> Accumulate text, broadcast TextDelta { text } via SSE
    |
    +-- type: "stream_event" + tool_use
    |       -> Broadcast ToolUse { name, input } via SSE
    |
    +-- type: "stream_event" + tool_result
    |       -> Broadcast ToolResult { output } via SSE
    |
    +-- type: "result" (final)
    |       -> Extract: session_id, usage, cost_usd
    |       -> Store complete AssistantMessage
    |       -> Broadcast MessageComplete via SSE
    |
    +-- process exit
            -> Mark conversation as idle
            -> Broadcast ConversationIdle via SSE
```

### Reattach After App Restart

```
User reopens Kobo
    |
    v
Tauri connects to daemon, fetches session list
    |
    v
For each session: GET /sessions/:id/messages
    |
    v
Daemon returns full conversation history (stored on disk)
    |
    v
React renders all messages immediately (no replay needed)
    |
    v
If conversation was mid-stream: daemon resumes SSE for active stream
```

---

## Key Design Decisions

### Decision 1: `claude -p` per message, not interactive mode

**Choice:** Spawn a new `claude -p` invocation for each user message, using `--resume` to maintain conversation context.

**Why not keep interactive PTY mode:**
- Interactive mode produces raw terminal output (ANSI, cursor control, line wrapping) that is nearly impossible to parse reliably into structured messages
- No clean separation between "this is the assistant's text" and "this is a tool call" and "this is a status indicator"
- The `-p` flag with `--output-format stream-json` gives us machine-readable, typed events
- `--resume <session_id>` maintains full conversation history across invocations -- no context loss

**Trade-off:** Each message is a separate process spawn. This adds ~200-500ms startup latency per message. Acceptable because:
1. Claude's response time dominates (seconds to minutes)
2. Users do not expect sub-100ms turnaround from an AI
3. Process isolation means a crash in one message does not kill the session

**Implementation:** The daemon stores the Claude session ID (from the JSON result's `session_id` field) and passes it via `--resume` on subsequent messages. First message in a conversation omits `--resume`.

### Decision 2: No PTY, plain process stdout

**Choice:** Use `std::process::Command` with piped stdout/stderr instead of `portable-pty`.

**Why:** We no longer need terminal emulation. `claude -p` does not render to a terminal -- it outputs JSON to stdout. PTY adds complexity (SIGWINCH handling, escape sequences, reader threads) that is entirely unnecessary when reading structured JSON lines.

**What this removes:** The entire `portable-pty` dependency, `PtySize`, resize handling, and the PTY reader thread. Replaced by a simpler `BufReader::read_line()` loop on piped stdout.

### Decision 3: Markdown rendering in the frontend

**Choice:** Render Claude's text responses as markdown in React, not as raw text.

**Implementation:** Use a markdown renderer (react-markdown or similar) with syntax highlighting for code blocks. Claude's responses are naturally markdown-formatted -- headers, lists, code fences, bold/italic. The current xterm.js approach loses all of this formatting.

### Decision 4: Conversation history stored on disk by daemon

**Choice:** The daemon persists the full conversation history (all messages, tool calls, results) to `~/.kobo/sessions/<id>/conversation.json`. This replaces the ring buffer approach.

**Why:** When the UI reconnects after restart, it needs the full conversation to render -- not just "the last N bytes of terminal output." Structured messages are compact and serialize cleanly. A typical hour-long conversation is <1MB of JSON.

### Decision 5: Remove xterm.js entirely

**Choice:** Remove xterm.js and all terminal rendering from the UI. Replace with a React-native chat component tree.

**What goes away:**
- `@xterm/xterm`, `@xterm/addon-fit`, `@xterm/addon-webgl`, `@xterm/addon-web-links`, `@xterm/addon-search`
- `src/lib/terminal.ts` (createTerminal, THEME, WebGL setup)
- `src/hooks/useTerminal.ts` (PTY attachment, base64 decoding)
- `src/components/Terminal.tsx`

**What replaces it:**
- `src/components/ChatView.tsx` -- message list with auto-scroll
- `src/components/ChatInput.tsx` -- multiline textarea with submit
- `src/components/MessageBubble.tsx` -- renders a single message (user or assistant)
- `src/components/ToolCallBlock.tsx` -- renders tool use/result pairs
- `src/components/StreamingIndicator.tsx` -- typing indicator during streaming

---

## Data Structures

### Core Message Types (kobo-core/src/types.rs additions)

```rust
/// Role of a message in a conversation.
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "snake_case")]
pub enum MessageRole {
    User,
    Assistant,
    System,
}

/// A tool invocation within an assistant message.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ToolCall {
    pub id: String,
    pub name: String,
    pub input: serde_json::Value,
    pub output: Option<String>,
    pub status: ToolCallStatus,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "snake_case")]
pub enum ToolCallStatus {
    Running,
    Completed,
    Failed,
}

/// A single message in a conversation.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Message {
    pub id: String,
    pub role: MessageRole,
    pub content: String,
    pub tool_calls: Vec<ToolCall>,
    pub timestamp: DateTime<Utc>,
    /// Token usage for this message (assistant messages only).
    pub usage: Option<TokenUsage>,
    /// Cost in USD for this message (assistant messages only).
    pub cost_usd: Option<f64>,
}

/// Token usage statistics.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TokenUsage {
    pub input_tokens: u64,
    pub output_tokens: u64,
    pub cache_read_tokens: Option<u64>,
    pub cache_write_tokens: Option<u64>,
}

/// Streaming events sent from daemon to UI during a response.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(tag = "type", rename_all = "snake_case")]
pub enum StreamEvent {
    /// Incremental text from the assistant.
    TextDelta { text: String },
    /// A tool is being invoked.
    ToolUseStart {
        tool_call_id: String,
        name: String,
        input: serde_json::Value,
    },
    /// A tool has completed.
    ToolResult {
        tool_call_id: String,
        output: String,
        is_error: bool,
    },
    /// The assistant message is complete.
    MessageComplete {
        message: Message,
    },
    /// An error occurred during processing.
    Error { message: String },
    /// The conversation is idle (process exited cleanly).
    Idle,
}

/// Current state of a conversation (replaces SessionStatus for chat mode).
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "snake_case")]
pub enum ConversationState {
    /// No messages yet.
    Empty,
    /// Waiting for user input.
    Idle,
    /// Claude is generating a response.
    Streaming,
    /// An error occurred in the last interaction.
    Error,
}
```

### Updated Session Type

```rust
/// A conversation session managed by the daemon (v2 -- chat mode).
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Session {
    pub id: SessionId,
    pub name: String,
    pub model: String,
    pub status: SessionStatus,
    pub conversation_state: ConversationState,
    pub created_at: DateTime<Utc>,
    pub updated_at: DateTime<Utc>,
    #[serde(default)]
    pub working_dir: Option<String>,
    /// Claude CLI session ID for --resume (not Kobo's session ID).
    #[serde(default)]
    pub claude_session_id: Option<String>,
    /// Number of messages in the conversation.
    pub message_count: usize,
    /// Cumulative token usage.
    pub total_usage: Option<TokenUsage>,
    /// Cumulative cost in USD.
    pub total_cost_usd: Option<f64>,
}
```

### Updated IPC Protocol (kobo-core/src/protocol.rs)

```rust
// New requests:
pub enum DaemonRequest {
    // ... existing ...

    /// Send a user message and start streaming the response.
    SendMessage {
        id: SessionId,
        content: String,
        model: Option<String>,  // Override model for this message.
    },

    /// Cancel an in-progress response.
    CancelResponse { id: SessionId },

    /// Get full conversation history for a session.
    GetMessages {
        id: SessionId,
        limit: Option<usize>,
        before_id: Option<String>,  // Pagination cursor.
    },
}

// New responses:
pub enum DaemonResponse {
    // ... existing ...

    /// Full conversation history.
    Messages { messages: Vec<Message> },

    /// Acknowledgment that a message was received and streaming started.
    MessageAccepted { message_id: String },

    /// Acknowledgment that cancellation was requested.
    CancelAccepted,
}
```

### New Daemon Routes

```
POST   /sessions/:id/messages          Send a message, returns MessageAccepted
GET    /sessions/:id/messages          Get conversation history
DELETE /sessions/:id/messages/current  Cancel in-progress response
GET    /sessions/:id/stream            SSE stream of StreamEvents
```

---

## Daemon Changes: ConversationManager

The daemon's `ProcessManager` is replaced (or supplemented) by a `ConversationManager` that handles the `claude -p` lifecycle.

### ConversationManager Responsibilities

1. **Spawn `claude -p` per message** with correct flags
2. **Parse stream-json output** line by line
3. **Broadcast `StreamEvent`s** via tokio broadcast channel
4. **Store conversation history** to disk
5. **Manage Claude session IDs** for `--resume`
6. **Handle cancellation** (kill the `claude -p` process)

### Process Lifecycle Per Message

```rust
// Pseudocode for ConversationManager.send_message()

async fn send_message(&self, session_id: &SessionId, content: String) -> Result<String> {
    let session = self.get_session(session_id)?;

    // 1. Store user message.
    let user_msg = Message {
        id: uuid(),
        role: MessageRole::User,
        content: content.clone(),
        tool_calls: vec![],
        timestamp: Utc::now(),
        usage: None,
        cost_usd: None,
    };
    self.store_message(session_id, &user_msg).await?;

    // 2. Build claude command.
    let mut cmd = Command::new("claude");
    cmd.arg("-p").arg(&content);
    cmd.arg("--output-format").arg("stream-json");
    cmd.arg("--verbose");
    cmd.arg("--include-partial-messages");
    cmd.arg("--model").arg(&session.model);
    cmd.arg("--allowedTools").arg("Bash,Read,Edit,Glob,Grep,Write");

    if let Some(ref claude_sid) = session.claude_session_id {
        cmd.arg("--resume").arg(claude_sid);
    }

    // Set working directory.
    if let Some(ref dir) = session.working_dir {
        cmd.current_dir(dir);
    }

    cmd.stdout(Stdio::piped());
    cmd.stderr(Stdio::piped());

    // 3. Spawn process.
    let mut child = cmd.spawn()?;
    let stdout = child.stdout.take().unwrap();

    // 4. Store child handle for cancellation.
    self.active_processes.insert(session_id.clone(), child);

    // 5. Spawn reader task.
    let tx = self.get_broadcast_tx(session_id);
    tokio::spawn(async move {
        let reader = BufReader::new(stdout);
        let mut accumulated_text = String::new();

        for line in reader.lines() {
            let line = match line {
                Ok(l) => l,
                Err(_) => break,
            };

            if line.is_empty() { continue; }

            // Parse stream-json event.
            let event: serde_json::Value = match serde_json::from_str(&line) {
                Ok(v) => v,
                Err(_) => continue,
            };

            match event["type"].as_str() {
                Some("stream_event") => {
                    // Extract text_delta, tool_use, tool_result, etc.
                    if let Some(text) = extract_text_delta(&event) {
                        accumulated_text.push_str(&text);
                        let _ = tx.send(StreamEvent::TextDelta { text });
                    }
                    // ... handle tool events ...
                }
                Some("result") => {
                    // Final result -- extract session_id, usage, cost.
                    let claude_session_id = event["session_id"].as_str().map(String::from);
                    let usage = extract_usage(&event);
                    let cost = event["cost_usd"].as_f64();

                    let assistant_msg = Message {
                        id: uuid(),
                        role: MessageRole::Assistant,
                        content: accumulated_text.clone(),
                        // ... tool_calls, usage, cost ...
                    };

                    // Store and broadcast completion.
                    let _ = tx.send(StreamEvent::MessageComplete { message: assistant_msg });
                }
                _ => {}
            }
        }

        let _ = tx.send(StreamEvent::Idle);
    });

    Ok(user_msg.id)
}
```

### Cancellation

```rust
async fn cancel_response(&self, session_id: &SessionId) -> Result<()> {
    if let Some(mut child) = self.active_processes.remove(session_id) {
        child.kill()?;
        let _ = self.get_broadcast_tx(session_id).send(StreamEvent::Idle);
    }
    Ok(())
}
```

---

## Frontend Component Structure

### New Components

```
src/
  components/
    ChatView.tsx          # Main chat container: message list + input
    ChatInput.tsx         # Multiline textarea with send button, model selector
    MessageBubble.tsx     # Renders a single message (user or assistant)
    ToolCallBlock.tsx     # Collapsible tool use/result display
    StreamingText.tsx     # Renders in-progress assistant text with cursor
    CostIndicator.tsx     # Shows token usage and cost per message
    ModelSelector.tsx     # Dropdown for model selection (extracted from ModelPicker)
    ConversationList.tsx  # Sidebar listing all conversations (for future)
```

### Updated Components (Keep, Modify)

```
    Pane.tsx              # MODIFY: Replace TerminalPane with ChatView
    Layout.tsx            # KEEP: No changes, tree-based split rendering
    Toolbar.tsx           # MODIFY: Minor updates, remove terminal-specific items
    StatusBar.tsx         # MODIFY: Show conversation state instead of terminal state
    CommandPalette.tsx    # KEEP: Add chat-specific commands
    ChangeDetails.tsx     # KEEP: No changes
    Timeline.tsx          # KEEP: No changes
```

### Removed Components

```
    Terminal.tsx           # REMOVE: Replaced by ChatView
    src/lib/terminal.ts   # REMOVE: xterm.js setup no longer needed
    src/hooks/useTerminal.ts  # REMOVE: PTY attachment no longer needed
```

### New Hooks

```
src/
  hooks/
    useConversation.ts    # Subscribe to conversation stream, manage messages
    useStreamEvents.ts    # SSE event handling and accumulation
```

### Updated Stores

```
src/
  stores/
    sessions.ts           # UPDATE: Add message-related state and actions
    conversations.ts      # NEW: Per-session message history and streaming state
    panes.ts              # KEEP: No changes needed
```

### ChatView Component (Key Design)

```tsx
// Simplified structure of ChatView.tsx

function ChatView({ sessionId }: { sessionId: string }) {
  const messages = useConversationStore(s => s.getMessages(sessionId));
  const streamingText = useConversationStore(s => s.getStreamingText(sessionId));
  const conversationState = useConversationStore(s => s.getState(sessionId));
  const sendMessage = useConversationStore(s => s.sendMessage);

  return (
    <div className="flex h-full flex-col">
      {/* Message list with auto-scroll */}
      <div className="flex-1 overflow-y-auto">
        {messages.map(msg => (
          <MessageBubble key={msg.id} message={msg} />
        ))}

        {/* Streaming indicator */}
        {conversationState === 'streaming' && streamingText && (
          <StreamingText text={streamingText} />
        )}
      </div>

      {/* Input area */}
      <ChatInput
        sessionId={sessionId}
        onSend={(content) => sendMessage(sessionId, content)}
        disabled={conversationState === 'streaming'}
      />
    </div>
  );
}
```

### MessageBubble Component (Key Design)

```tsx
function MessageBubble({ message }: { message: Message }) {
  const isUser = message.role === 'user';

  return (
    <div className={`px-4 py-3 ${isUser ? 'bg-blue-900/20' : ''}`}>
      {/* Role indicator */}
      <div className="text-xs text-gray-500 mb-1">
        {isUser ? 'You' : 'Claude'}
        {message.cost_usd && (
          <CostIndicator usage={message.usage} cost={message.cost_usd} />
        )}
      </div>

      {/* Message content -- markdown rendered */}
      <div className="prose prose-invert max-w-none">
        <Markdown>{message.content}</Markdown>
      </div>

      {/* Tool calls -- collapsible */}
      {message.tool_calls.map(tc => (
        <ToolCallBlock key={tc.id} toolCall={tc} />
      ))}
    </div>
  );
}
```

---

## IPC Changes Summary

### Removed Endpoints

| Endpoint | Reason |
|----------|--------|
| `POST /sessions/:id/input` | Raw byte input to PTY -- replaced by structured messages |
| `POST /sessions/:id/resize` | PTY resize -- no terminal to resize |
| `GET /sessions/:id/output` | Raw byte stream -- replaced by structured StreamEvent SSE |

### New Endpoints

| Endpoint | Method | Purpose |
|----------|--------|---------|
| `/sessions/:id/messages` | POST | Send a user message, start streaming response |
| `/sessions/:id/messages` | GET | Retrieve conversation history |
| `/sessions/:id/messages/current` | DELETE | Cancel in-progress response |
| `/sessions/:id/stream` | GET (SSE) | Subscribe to StreamEvent stream |

### Kept Endpoints

| Endpoint | Notes |
|----------|-------|
| `/health` | No change |
| `/ping` | No change |
| `/sessions` | GET/POST -- creation needs model and working_dir, removes rows/cols |
| `/sessions/:id` | GET/DELETE -- no change |
| `/sessions/:id/save` | No change (git milestone) |
| `/sessions/:id/milestones` | No change |
| `/sessions/:id/diff` | No change |
| `/sessions/:id/restore` | No change |
| `/sessions/:id/changes` | No change |

---

## Migration Plan

### Phase 1: Daemon Message Layer (backend only, no UI changes)

**Goal:** Daemon can receive a message, spawn `claude -p`, parse stream-json, and broadcast structured events.

**Tasks:**
1. [P] Add `Message`, `StreamEvent`, `ConversationState`, `TokenUsage` types to kobo-core/src/types.rs
2. [P] Add new request/response variants to kobo-core/src/protocol.rs
3. Create `conversation.rs` in kobo-daemon -- ConversationManager struct
4. Implement `send_message()` -- spawn `claude -p`, parse stdout, broadcast events
5. Implement `cancel_response()` -- kill child process
6. Implement conversation persistence -- read/write `~/.kobo/sessions/<id>/conversation.json`
7. Add new routes to kobo-daemon/src/server.rs (POST/GET /messages, DELETE /messages/current, GET /stream)
8. Add new client methods to kobo-core/src/client.rs
9. Test: send a message via curl, verify stream-json events flow correctly

**Validation:** `curl --unix-socket ~/.kobo/kobo.sock -X POST /sessions/<id>/messages -d '{"content":"Hello"}'` returns MessageAccepted, and `curl --unix-socket ~/.kobo/kobo.sock /sessions/<id>/stream` produces StreamEvent SSE.

### Phase 2: Tauri Bridge Updates

**Goal:** Tauri commands expose message-based API to frontend.

**Tasks:**
1. Add `send_message` Tauri command (thin proxy)
2. Add `get_messages` Tauri command
3. Add `cancel_response` Tauri command
4. Update `attach_session` to use new `/stream` endpoint (StreamEvent SSE instead of raw bytes)
5. Remove: `write_input`, `resize_session` commands (no longer needed)
6. Update `create_session` to remove rows/cols parameters

**Validation:** Frontend can invoke send_message and receive StreamEvents via Tauri Channel.

### Phase 3: Frontend Chat UI

**Goal:** Replace terminal rendering with chat components.

**Tasks:**
1. [P] Create `conversations.ts` store (message state, streaming state per session)
2. [P] Create `ChatInput.tsx` component
3. [P] Create `MessageBubble.tsx` component
4. [P] Create `StreamingText.tsx` component
5. [P] Create `ToolCallBlock.tsx` component
6. Create `ChatView.tsx` (compose message list + input)
7. Create `useConversation.ts` hook (SSE subscription, message accumulation)
8. Update `Pane.tsx` -- replace `<TerminalPane>` with `<ChatView>`
9. Update `src/lib/ipc.ts` -- add sendMessage, getMessages, cancelResponse; remove writeInput, resizeSession
10. Install markdown rendering dependency (react-markdown + rehype-highlight or similar)
11. Remove xterm.js dependencies from package.json

**Validation:** Send a message, see streaming response render as formatted markdown in chat bubbles.

### Phase 4: Polish and Feature Parity

**Goal:** Match or exceed the UX of the terminal version.

**Tasks:**
1. Auto-scroll behavior (scroll to bottom on new content, stop when user scrolls up)
2. Code block rendering with syntax highlighting and copy button
3. Cost tracking display per message and per session
4. Model selector inline in ChatInput (per-message model override)
5. Keyboard shortcuts -- Enter to send, Shift+Enter for newline, Escape to cancel
6. Message search (Cmd+F within a conversation)
7. Copy message content button
8. Retry failed messages
9. Loading states and error handling
10. Update StatusBar to show conversation state
11. Update CommandPalette with chat-specific commands

### What Gets Removed

| Item | Location | Reason |
|------|----------|--------|
| `portable-pty` dependency | Cargo.toml (kobo-daemon) | No PTY needed for `claude -p` |
| `PtySize` type | kobo-core/src/types.rs | No terminal dimensions |
| `process.rs` (PTY spawn) | kobo-daemon/src/process.rs | Replaced by ConversationManager |
| `write_input` client method | kobo-core/src/client.rs | Replaced by send_message |
| `resize_session` client method | kobo-core/src/client.rs | No terminal to resize |
| xterm.js packages (5 packages) | package.json | No terminal rendering |
| `Terminal.tsx` | src/components/ | Replaced by ChatView |
| `terminal.ts` | src/lib/ | xterm.js setup code |
| `useTerminal.ts` | src/hooks/ | PTY attachment hook |
| base64 encode/decode for I/O | bridge.rs, ipc.ts | Structured JSON, not raw bytes |

### What Gets Kept (Unchanged)

| Item | Location | Reason |
|------|----------|--------|
| `Layout.tsx` | src/components/ | Tree-based split panes work for chat too |
| `panes.ts` store | src/stores/ | Pane tree structure unchanged |
| `useKeyboard.ts` | src/hooks/ | Shortcut system still works |
| `CommandPalette.tsx` | src/components/ | Add new commands, structure unchanged |
| `Timeline.tsx` | src/components/ | Git timeline unchanged |
| `ChangeDetails.tsx` | src/components/ | Git change details unchanged |
| `git_ops.rs` | kobo-daemon/ | Git operations unchanged |
| `keystore.rs` | kobo-daemon/ | API key management unchanged |
| `lifecycle.rs` | kobo-daemon/ | Daemon lifecycle unchanged |
| `state.rs` | kobo-daemon/ | Session state persistence unchanged |
| Server infrastructure | kobo-daemon/src/server.rs | Axum, UDS, all the plumbing stays |

---

## Risk Assessment

### Risk 1: `claude -p --resume` Reliability

**Risk:** The `--resume` flag may have edge cases (session expiry, corrupted state, version upgrades) that cause conversation continuation to fail.

**Mitigation:** If `--resume` fails, fall back to starting a fresh Claude session. The conversation history is still displayed in Kobo (from our stored messages), but Claude loses prior context. Show a notice to the user: "Conversation context was reset." Optionally, re-inject a summary of prior messages via `--append-system-prompt`.

### Risk 2: stream-json Format Changes

**Risk:** Claude CLI updates could change the stream-json event format.

**Mitigation:** Parse events defensively (ignore unknown fields, skip unparseable lines). Pin to a known Claude CLI version initially. Add a compatibility layer that normalizes event formats.

### Risk 3: Process Spawn Latency

**Risk:** Spawning a new `claude -p` process per message adds startup overhead.

**Mitigation:** Measured at ~200-500ms on modern hardware. This is negligible compared to Claude's response latency (2-30+ seconds). If it becomes an issue, investigate a long-running `claude` process with `--input-format stream-json` for bidirectional streaming (future optimization, not v1).

### Risk 4: Permission Prompts in Non-Interactive Mode

**Risk:** Claude CLI may prompt for tool permissions during `claude -p`, causing the process to hang.

**Mitigation:** Use `--dangerously-skip-permissions` for v1 (user acknowledges risk). Future: implement `--permission-prompt-tool` with an MCP server that routes permission requests to the Kobo UI for user approval. This is the proper long-term solution.

### Risk 5: Large Conversation History

**Risk:** Conversations with many messages and large tool outputs could produce very large conversation.json files.

**Mitigation:** Paginate message retrieval (the `before_id` cursor in GetMessages). Truncate tool output storage (keep first/last 1000 chars of very large outputs). Set a conversation message limit warning at ~200 messages.

---

## New Dependencies

### Rust (Cargo.toml)

None new. We actually **remove** `portable-pty`. `std::process::Command` with piped I/O is in the standard library.

### Frontend (package.json)

| Package | Purpose | Size |
|---------|---------|------|
| `react-markdown` | Render markdown in messages | ~30KB |
| `remark-gfm` | GitHub Flavored Markdown (tables, task lists) | ~10KB |
| `rehype-highlight` | Syntax highlighting in code blocks | ~15KB + language grammars |

**Removed packages:**

| Package | Savings |
|---------|---------|
| `@xterm/xterm` | ~400KB |
| `@xterm/addon-fit` | ~10KB |
| `@xterm/addon-webgl` | ~80KB |
| `@xterm/addon-web-links` | ~5KB |
| `@xterm/addon-search` | ~10KB |

Net change: approximately -450KB of frontend dependencies.

---

## Open Questions

1. **Tool permission UX:** How should the UI present tool permission requests? Options: (a) auto-approve everything, (b) toast notification with approve/deny, (c) inline in chat flow. Recommendation: start with (a), implement (c) in Phase 4.

2. **Image/file rendering:** Claude can produce code that generates images, or reference files. Should MessageBubble render images inline? Recommendation: defer to Phase 4, text-only for v1.

3. **System prompt customization:** Should users be able to set a per-session system prompt? Recommendation: yes, add to session creation, pass via `--append-system-prompt`.

4. **Multi-turn context window:** Claude CLI manages its own context window. Should Kobo show a "context fullness" indicator? Recommendation: yes, derive from token usage in the result events.

---

## Summary of Architectural Changes

| Layer | Current | New |
|-------|---------|-----|
| **AI Interaction** | Interactive PTY (`claude` in terminal mode) | Per-message process (`claude -p --output-format stream-json`) |
| **Data Format** | Raw bytes + ANSI escape sequences | Structured JSON events |
| **IPC Streaming** | base64-encoded byte chunks via SSE | Typed StreamEvent JSON via SSE |
| **Frontend Rendering** | xterm.js terminal emulator | React components with markdown |
| **User Input** | Terminal keystroke capture | HTML textarea with submit |
| **Session Continuity** | PTY process stays alive between messages | `--resume <session_id>` across process spawns |
| **History** | Ring buffer of raw bytes | Full message history on disk |
| **Process Management** | PTY via portable-pty | std::process::Command with piped I/O |

The daemon architecture, multi-pane layout, git versioning, Tauri shell, and session persistence model all remain unchanged. We are swapping the interaction paradigm from "terminal wrapper" to "chat client" while keeping the infrastructure that makes Kobo unique.
