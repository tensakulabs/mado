use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};
use std::fmt;

/// Unique identifier for a session.
#[derive(Debug, Clone, Hash, Eq, PartialEq, Serialize, Deserialize)]
pub struct SessionId(pub String);

impl SessionId {
    pub fn new(id: impl Into<String>) -> Self {
        Self(id.into())
    }

    pub fn as_str(&self) -> &str {
        &self.0
    }
}

impl fmt::Display for SessionId {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        write!(f, "{}", self.0)
    }
}

/// Status of a conversation session.
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "snake_case")]
pub enum SessionStatus {
    /// Actively running with a live PTY process.
    Active,
    /// Running but no recent activity.
    Idle,
    /// Paused -- PTY process suspended.
    Suspended,
    /// Process exited or was killed.
    Terminated,
}

/// A conversation session managed by the daemon.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Session {
    pub id: SessionId,
    pub name: String,
    pub model: String,
    pub status: SessionStatus,
    pub created_at: DateTime<Utc>,
    pub updated_at: DateTime<Utc>,
    #[serde(default)]
    pub working_dir: Option<String>,
    /// The actual command that was spawned (e.g., "claude --model sonnet" or "/bin/zsh").
    #[serde(default)]
    pub command: Option<String>,
    /// Whether the session is running in shell fallback mode (claude not found).
    #[serde(default)]
    pub shell_fallback: bool,
    /// Current conversation state (chat mode).
    #[serde(default)]
    pub conversation_state: ConversationState,
    /// Claude CLI session ID for --resume (not Mado's session ID).
    #[serde(default)]
    pub claude_session_id: Option<String>,
    /// Number of messages in the conversation.
    #[serde(default)]
    pub message_count: usize,
    /// Cumulative token usage.
    #[serde(default)]
    pub total_usage: Option<TokenUsage>,
    /// Cumulative cost in USD.
    #[serde(default)]
    pub total_cost_usd: Option<f64>,
}

/// Status information about the running daemon.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct DaemonStatus {
    pub pid: u32,
    pub uptime: u64,
    pub session_count: usize,
    pub version: String,
}

/// A saved milestone (git commit) in a session's workspace.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Milestone {
    pub oid: String,
    pub message: String,
    pub timestamp: DateTime<Utc>,
    pub files_changed: usize,
    pub insertions: usize,
    pub deletions: usize,
}

/// Summary of a diff between two commits.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct DiffSummary {
    pub files: Vec<FileDiff>,
    pub total_insertions: usize,
    pub total_deletions: usize,
}

/// Diff information for a single file.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct FileDiff {
    pub path: String,
    pub insertions: usize,
    pub deletions: usize,
    pub status: String,
}

/// Git staging status: staged and unstaged files separately.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct GitStatus {
    pub staged: Vec<FileDiff>,
    pub unstaged: Vec<FileDiff>,
}

/// Current branch and remote information.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct BranchInfo {
    /// Current branch name (e.g. "main").
    pub branch: String,
    /// Whether an "origin" remote is configured.
    pub has_remote: bool,
}

/// A single entry in the git commit log.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct GitLogEntry {
    pub oid: String,
    pub message: String,
    pub author: String,
    pub timestamp: String,
}

/// Terminal/PTY size in rows and columns.
#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq, Eq)]
pub struct PtySize {
    pub rows: u16,
    pub cols: u16,
}

impl Default for PtySize {
    fn default() -> Self {
        Self {
            rows: 24,
            cols: 80,
        }
    }
}

// ============================================================================
// Chat UI Types (v2 architecture)
// ============================================================================

/// Role of a message in a conversation.
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "snake_case")]
pub enum MessageRole {
    User,
    Assistant,
    System,
}

/// Status of a tool invocation.
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "snake_case")]
pub enum ToolCallStatus {
    Running,
    Completed,
    Failed,
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

/// Token usage statistics.
#[derive(Debug, Clone, Default, Serialize, Deserialize)]
pub struct TokenUsage {
    pub input_tokens: u64,
    pub output_tokens: u64,
    #[serde(default)]
    pub cache_read_tokens: Option<u64>,
    #[serde(default)]
    pub cache_write_tokens: Option<u64>,
}

/// A single message in a conversation.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Message {
    pub id: String,
    pub role: MessageRole,
    pub content: String,
    #[serde(default)]
    pub tool_calls: Vec<ToolCall>,
    pub timestamp: DateTime<Utc>,
    /// Token usage for this message (assistant messages only).
    #[serde(default)]
    pub usage: Option<TokenUsage>,
    /// Cost in USD for this message (assistant messages only).
    #[serde(default)]
    pub cost_usd: Option<f64>,
}

/// Current state of a conversation.
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq, Default)]
#[serde(rename_all = "snake_case")]
pub enum ConversationState {
    /// No messages yet.
    #[default]
    Empty,
    /// Waiting for user input.
    Idle,
    /// Claude is generating a response.
    Streaming,
    /// An error occurred in the last interaction.
    Error,
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
    MessageComplete { message: Box<Message> },
    /// An error occurred during processing.
    Error { message: String },
    /// The conversation is idle (process exited cleanly).
    Idle,
}
