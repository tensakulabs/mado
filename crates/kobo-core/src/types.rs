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
