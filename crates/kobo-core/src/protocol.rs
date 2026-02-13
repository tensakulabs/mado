use serde::{Deserialize, Serialize};

use crate::types::{DaemonStatus, DiffSummary, Milestone, Session, SessionId};

/// Requests that can be sent to the daemon.
#[derive(Debug, Serialize, Deserialize)]
#[serde(tag = "type", rename_all = "snake_case")]
pub enum DaemonRequest {
    /// Check daemon health.
    Health,
    /// List all sessions.
    ListSessions,
    /// Create a new session.
    CreateSession { name: String, model: String },
    /// Destroy an existing session.
    DestroySession { id: SessionId },
    /// Simple liveness ping.
    Ping,
}

/// Responses from the daemon.
#[derive(Debug, Serialize, Deserialize)]
#[serde(tag = "type", rename_all = "snake_case")]
pub enum DaemonResponse {
    /// Health check response with daemon status.
    Health { status: DaemonStatus },
    /// List of sessions.
    Sessions { sessions: Vec<Session> },
    /// A session was created.
    SessionCreated { session: Session },
    /// An error occurred.
    Error { message: String },
    /// Pong response to a ping.
    Pong,
    /// A milestone was saved.
    MilestoneSaved { milestone: Milestone },
    /// List of milestones.
    Milestones { milestones: Vec<Milestone> },
    /// Diff result between two commits.
    DiffResult { diff: DiffSummary },
}
