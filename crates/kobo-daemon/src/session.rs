use std::sync::Arc;

use chrono::Utc;
use tokio::sync::{broadcast, Mutex};
use tracing;
use uuid::Uuid;

use kobo_core::types::{PtySize, Session, SessionId, SessionStatus};

use crate::process::{ProcessError, SharedProcessManager};
use crate::state::DaemonState;

/// Manages session lifecycle and coordinates with ProcessManager.
pub struct SessionManager {
    state: Arc<Mutex<DaemonState>>,
    process_manager: SharedProcessManager,
}

impl SessionManager {
    pub fn new(state: Arc<Mutex<DaemonState>>, process_manager: SharedProcessManager) -> Self {
        Self {
            state,
            process_manager,
        }
    }

    /// Create a new session with a Claude CLI (or fallback shell) process.
    pub async fn create_session(
        &self,
        name: String,
        model: String,
        pty_size: PtySize,
        cwd: Option<String>,
    ) -> Result<Session, SessionError> {
        let session_id = SessionId::new(Uuid::new_v4().to_string());
        let now = Utc::now();

        // Resolve working directory - default to ~/kobo if not specified.
        let working_dir = match cwd {
            Some(dir) => dir,
            None => {
                let default_dir = dirs::home_dir()
                    .map(|h| h.join("kobo"))
                    .unwrap_or_else(|| std::path::PathBuf::from("/tmp/kobo"));
                // Create the default directory if it doesn't exist.
                if !default_dir.exists() {
                    std::fs::create_dir_all(&default_dir).ok();
                }
                default_dir.to_string_lossy().to_string()
            }
        };

        // Spawn the PTY process with Claude CLI.
        let spawn_result = {
            let mut pm = self.process_manager.lock().await;
            pm.create(
                &session_id,
                &model,
                pty_size.rows,
                pty_size.cols,
                Some(&working_dir),
                None, // api_key - from keystore
            )
            .map_err(SessionError::ProcessError)?
        };

        let session = Session {
            id: session_id.clone(),
            name,
            model,
            status: SessionStatus::Active,
            created_at: now,
            updated_at: now,
            working_dir: Some(working_dir),
            command: Some(spawn_result.command),
            shell_fallback: spawn_result.shell_fallback,
            // Chat mode fields (initialized to defaults).
            conversation_state: kobo_core::types::ConversationState::Empty,
            claude_session_id: None,
            message_count: 0,
            total_usage: None,
            total_cost_usd: None,
        };

        // Persist the session.
        {
            let mut state = self.state.lock().await;
            state.add_session(session.clone());
        }

        tracing::info!(
            "Created session: {} ({}) [fallback={}]",
            session.id,
            session.name,
            session.shell_fallback
        );
        Ok(session)
    }

    /// List all sessions.
    pub async fn list_sessions(&self) -> Vec<Session> {
        let state = self.state.lock().await;
        state.sessions.values().cloned().collect()
    }

    /// Get a specific session.
    pub async fn get_session(&self, id: &SessionId) -> Option<Session> {
        let state = self.state.lock().await;
        state.get_session(id).cloned()
    }

    /// Destroy a session and its process.
    pub async fn destroy_session(&self, id: &SessionId) -> Result<(), SessionError> {
        // Kill the process.
        {
            let mut pm = self.process_manager.lock().await;
            if pm.has_process(id) {
                pm.destroy(id).map_err(SessionError::ProcessError)?;
            }
        }

        // Remove session from state entirely (not just mark terminated).
        {
            let mut state = self.state.lock().await;
            state.remove_session(id);
        }

        tracing::info!("Destroyed session: {}", id);
        Ok(())
    }

    /// Write input to a session's PTY.
    pub async fn write_input(
        &self,
        id: &SessionId,
        data: &[u8],
    ) -> Result<(), SessionError> {
        let mut pm = self.process_manager.lock().await;
        pm.write_input(id, data)
            .map_err(SessionError::ProcessError)
    }

    /// Resize a session's PTY.
    pub async fn resize_session(
        &self,
        id: &SessionId,
        rows: u16,
        cols: u16,
    ) -> Result<(), SessionError> {
        let pm = self.process_manager.lock().await;
        pm.resize(id, rows, cols)
            .map_err(SessionError::ProcessError)
    }

    /// Subscribe to output from a session's PTY.
    pub async fn subscribe_output(
        &self,
        id: &SessionId,
    ) -> Result<broadcast::Receiver<Vec<u8>>, SessionError> {
        let pm = self.process_manager.lock().await;
        pm.subscribe_output(id)
            .map_err(SessionError::ProcessError)
    }
}

/// Thread-safe wrapper for SessionManager.
pub type SharedSessionManager = Arc<SessionManager>;

/// Errors from session management.
#[derive(Debug, thiserror::Error)]
pub enum SessionError {
    #[error("Process error: {0}")]
    ProcessError(#[from] ProcessError),
}
