use std::path::{Path, PathBuf};

use http_body_util::{BodyExt, Full};
use hyper::body::Bytes;
use hyper::Request;
use hyper_util::rt::TokioIo;
use tokio::net::UnixStream;
use tracing;

use crate::protocol::DaemonResponse;
use crate::types::DaemonStatus;

/// Errors that can occur when communicating with the daemon.
#[derive(Debug, thiserror::Error)]
pub enum ClientError {
    #[error("Failed to connect to daemon socket at {path}: {source}")]
    ConnectionFailed {
        path: PathBuf,
        source: std::io::Error,
    },

    #[error("HTTP request failed: {0}")]
    HttpError(#[from] hyper::Error),

    #[error("HTTP client error: {0}")]
    HttpClientError(#[from] hyper_util::client::legacy::Error),

    #[error("Failed to deserialize response: {0}")]
    DeserializeError(#[from] serde_json::Error),

    #[error("Daemon returned error: {0}")]
    DaemonError(String),

    #[error("Unexpected response from daemon")]
    UnexpectedResponse,

    #[error("Socket not found at {0}")]
    SocketNotFound(PathBuf),

    #[error("Failed to start daemon: {0}")]
    StartFailed(String),

    #[error("Daemon did not start in time (socket not found after timeout)")]
    StartTimeout,
}

/// Client for communicating with the mado daemon over a Unix domain socket.
#[derive(Debug, Clone)]
pub struct DaemonClient {
    socket_path: PathBuf,
}

impl DaemonClient {
    /// Create a new client targeting the given socket path.
    pub fn new(socket_path: impl Into<PathBuf>) -> Self {
        Self {
            socket_path: socket_path.into(),
        }
    }

    /// Get the socket path this client connects to.
    pub fn socket_path(&self) -> &Path {
        &self.socket_path
    }

    /// Check if the daemon socket file exists.
    pub fn socket_exists(&self) -> bool {
        self.socket_path.exists()
    }

    /// Attempt to connect and verify the daemon is alive.
    pub async fn connect(&self) -> Result<(), ClientError> {
        if !self.socket_exists() {
            return Err(ClientError::SocketNotFound(self.socket_path.clone()));
        }

        // Try a quick ping to verify the daemon is responsive.
        self.ping().await?;
        Ok(())
    }

    /// Send a health check request and return the daemon status.
    pub async fn health(&self) -> Result<DaemonStatus, ClientError> {
        let body = self.get("/health").await?;
        let response: DaemonResponse = serde_json::from_slice(&body)?;

        match response {
            DaemonResponse::Health { status } => Ok(status),
            DaemonResponse::Error { message } => Err(ClientError::DaemonError(message)),
            _ => Err(ClientError::UnexpectedResponse),
        }
    }

    /// Send a ping request to verify liveness.
    pub async fn ping(&self) -> Result<(), ClientError> {
        let body = self.get("/ping").await?;
        let response: DaemonResponse = serde_json::from_slice(&body)?;

        match response {
            DaemonResponse::Pong => Ok(()),
            DaemonResponse::Error { message } => Err(ClientError::DaemonError(message)),
            _ => Err(ClientError::UnexpectedResponse),
        }
    }

    /// Check if the daemon is alive by attempting a quick ping.
    pub async fn is_alive(&self) -> bool {
        self.ping().await.is_ok()
    }

    /// Ensure the daemon is running, starting it if necessary.
    ///
    /// 1. Try to connect to existing daemon.
    /// 2. If connection fails, check PID file.
    /// 3. If PID is dead or missing, spawn the daemon binary.
    /// 4. Wait for socket to appear and connect.
    pub async fn ensure_daemon_running(
        socket_path: &Path,
        daemon_binary: &Path,
    ) -> Result<Self, ClientError> {
        let client = Self::new(socket_path);

        // Try to connect to existing daemon.
        if client.is_alive().await {
            tracing::info!("Connected to existing daemon");
            return Ok(client);
        }

        tracing::info!("No running daemon found, starting one...");

        // Clean up stale PID file if the process is dead.
        let pid_path = socket_path.with_file_name("mado.pid");
        if pid_path.exists() {
            if let Ok(contents) = std::fs::read_to_string(&pid_path) {
                if let Ok(pid) = contents.trim().parse::<u32>() {
                    let alive = unsafe { libc::kill(pid as i32, 0) == 0 };
                    if !alive {
                        tracing::warn!("Cleaning up stale PID file for dead process {}", pid);
                        let _ = std::fs::remove_file(&pid_path);
                        let _ = std::fs::remove_file(socket_path);
                    } else {
                        // Process is alive but socket is unresponsive -- something is wrong.
                        return Err(ClientError::StartFailed(format!(
                            "Daemon process {} is alive but socket is unresponsive",
                            pid
                        )));
                    }
                }
            }
        }

        // Start the daemon.
        let result = std::process::Command::new(daemon_binary)
            .arg("--daemonize")
            .arg("--socket-path")
            .arg(socket_path)
            .spawn();

        match result {
            Ok(_child) => {
                tracing::info!("Daemon process spawned");
            }
            Err(e) => {
                return Err(ClientError::StartFailed(format!(
                    "Failed to spawn daemon binary at {}: {}",
                    daemon_binary.display(),
                    e
                )));
            }
        }

        // Wait for the socket to appear and become responsive.
        let timeout = std::time::Duration::from_secs(5);
        let poll_interval = std::time::Duration::from_millis(100);
        let start = std::time::Instant::now();

        while start.elapsed() < timeout {
            if client.is_alive().await {
                tracing::info!("Connected to newly started daemon");
                return Ok(client);
            }
            tokio::time::sleep(poll_interval).await;
        }

        Err(ClientError::StartTimeout)
    }

    /// List all sessions.
    pub async fn list_sessions(&self) -> Result<Vec<crate::types::Session>, ClientError> {
        let body = self.get("/sessions").await?;
        let response: DaemonResponse = serde_json::from_slice(&body)?;
        match response {
            DaemonResponse::Sessions { sessions } => Ok(sessions),
            DaemonResponse::Error { message } => Err(ClientError::DaemonError(message)),
            _ => Err(ClientError::UnexpectedResponse),
        }
    }

    /// Create a new session.
    pub async fn create_session(
        &self,
        name: &str,
        model: &str,
        rows: u16,
        cols: u16,
        cwd: Option<&str>,
    ) -> Result<crate::types::Session, ClientError> {
        let mut body_json = serde_json::json!({
            "name": name,
            "model": model,
            "rows": rows,
            "cols": cols,
        });
        if let Some(dir) = cwd {
            body_json["cwd"] = serde_json::json!(dir);
        }
        let body = self.post("/sessions", &body_json).await?;
        let response: DaemonResponse = serde_json::from_slice(&body)?;
        match response {
            DaemonResponse::SessionCreated { session } => Ok(session),
            DaemonResponse::Error { message } => Err(ClientError::DaemonError(message)),
            _ => Err(ClientError::UnexpectedResponse),
        }
    }

    /// Destroy a session.
    pub async fn destroy_session(&self, id: &str) -> Result<(), ClientError> {
        let body = self.delete(&format!("/sessions/{}", id)).await?;
        let response: DaemonResponse = serde_json::from_slice(&body)?;
        match response {
            DaemonResponse::Pong => Ok(()),
            DaemonResponse::Error { message } => Err(ClientError::DaemonError(message)),
            _ => Err(ClientError::UnexpectedResponse),
        }
    }

    /// Write input to a session's PTY.
    pub async fn write_input(&self, session_id: &str, data: &[u8]) -> Result<(), ClientError> {
        use base64::Engine;
        let encoded = base64::engine::general_purpose::STANDARD.encode(data);
        let body_json = serde_json::json!({ "data": encoded });
        let body = self
            .post(&format!("/sessions/{}/input", session_id), &body_json)
            .await?;
        let response: DaemonResponse = serde_json::from_slice(&body)?;
        match response {
            DaemonResponse::Pong => Ok(()),
            DaemonResponse::Error { message } => Err(ClientError::DaemonError(message)),
            _ => Err(ClientError::UnexpectedResponse),
        }
    }

    /// Resize a session's PTY.
    pub async fn resize_session(
        &self,
        session_id: &str,
        rows: u16,
        cols: u16,
    ) -> Result<(), ClientError> {
        let body_json = serde_json::json!({ "rows": rows, "cols": cols });
        let body = self
            .post(&format!("/sessions/{}/resize", session_id), &body_json)
            .await?;
        let response: DaemonResponse = serde_json::from_slice(&body)?;
        match response {
            DaemonResponse::Pong => Ok(()),
            DaemonResponse::Error { message } => Err(ClientError::DaemonError(message)),
            _ => Err(ClientError::UnexpectedResponse),
        }
    }

    /// Save a milestone for a session.
    pub async fn save_milestone(
        &self,
        session_id: &str,
        message: &str,
    ) -> Result<crate::types::Milestone, ClientError> {
        let body_json = serde_json::json!({ "message": message });
        let body = self
            .post(&format!("/sessions/{}/save", session_id), &body_json)
            .await?;
        let response: DaemonResponse = serde_json::from_slice(&body)?;
        match response {
            DaemonResponse::MilestoneSaved { milestone } => Ok(milestone),
            DaemonResponse::Error { message } => Err(ClientError::DaemonError(message)),
            _ => Err(ClientError::UnexpectedResponse),
        }
    }

    /// List milestones for a session.
    pub async fn list_milestones(
        &self,
        session_id: &str,
        limit: usize,
    ) -> Result<Vec<crate::types::Milestone>, ClientError> {
        let body = self
            .get(&format!("/sessions/{}/milestones?limit={}", session_id, limit))
            .await?;
        let response: DaemonResponse = serde_json::from_slice(&body)?;
        match response {
            DaemonResponse::Milestones { milestones } => Ok(milestones),
            DaemonResponse::Error { message } => Err(ClientError::DaemonError(message)),
            _ => Err(ClientError::UnexpectedResponse),
        }
    }

    /// Get diff between two milestones.
    pub async fn diff_milestones(
        &self,
        session_id: &str,
        from_oid: &str,
        to_oid: &str,
    ) -> Result<crate::types::DiffSummary, ClientError> {
        let body = self
            .get(&format!(
                "/sessions/{}/diff?from={}&to={}",
                session_id, from_oid, to_oid
            ))
            .await?;
        let response: DaemonResponse = serde_json::from_slice(&body)?;
        match response {
            DaemonResponse::DiffResult { diff } => Ok(diff),
            DaemonResponse::Error { message } => Err(ClientError::DaemonError(message)),
            _ => Err(ClientError::UnexpectedResponse),
        }
    }

    /// Get current workspace changes (uncommitted modifications).
    pub async fn workspace_changes(
        &self,
        session_id: &str,
    ) -> Result<crate::types::DiffSummary, ClientError> {
        let body = self
            .get(&format!("/sessions/{}/changes", session_id))
            .await?;
        let response: DaemonResponse = serde_json::from_slice(&body)?;
        match response {
            DaemonResponse::WorkspaceChanges { changes } => Ok(changes),
            DaemonResponse::Error { message } => Err(ClientError::DaemonError(message)),
            _ => Err(ClientError::UnexpectedResponse),
        }
    }

    /// Restore to a milestone.
    pub async fn restore_milestone(
        &self,
        session_id: &str,
        oid: &str,
    ) -> Result<(), ClientError> {
        let body_json = serde_json::json!({ "oid": oid });
        let body = self
            .post(&format!("/sessions/{}/restore", session_id), &body_json)
            .await?;
        let response: DaemonResponse = serde_json::from_slice(&body)?;
        match response {
            DaemonResponse::Pong => Ok(()),
            DaemonResponse::Error { message } => Err(ClientError::DaemonError(message)),
            _ => Err(ClientError::UnexpectedResponse),
        }
    }

    // ── Git staging methods ──

    /// Get git staging status (staged + unstaged files).
    pub async fn git_status(
        &self,
        session_id: &str,
    ) -> Result<crate::types::GitStatus, ClientError> {
        let body = self
            .get(&format!("/sessions/{}/git/status", session_id))
            .await?;
        let response: DaemonResponse = serde_json::from_slice(&body)?;
        match response {
            DaemonResponse::GitStatusResult { status } => Ok(status),
            DaemonResponse::Error { message } => Err(ClientError::DaemonError(message)),
            _ => Err(ClientError::UnexpectedResponse),
        }
    }

    /// Get unified diff content for a single file.
    pub async fn git_file_diff(
        &self,
        session_id: &str,
        file_path: &str,
        staged: bool,
    ) -> Result<String, ClientError> {
        let body = self
            .get(&format!(
                "/sessions/{}/git/diff?file_path={}&staged={}",
                session_id, file_path, staged
            ))
            .await?;
        let response: DaemonResponse = serde_json::from_slice(&body)?;
        match response {
            DaemonResponse::FileDiffContent { diff } => Ok(diff),
            DaemonResponse::Error { message } => Err(ClientError::DaemonError(message)),
            _ => Err(ClientError::UnexpectedResponse),
        }
    }

    /// Stage a single file.
    pub async fn git_stage_file(
        &self,
        session_id: &str,
        file_path: &str,
    ) -> Result<(), ClientError> {
        let body_json = serde_json::json!({ "file_path": file_path });
        let body = self
            .post(&format!("/sessions/{}/git/stage", session_id), &body_json)
            .await?;
        let response: DaemonResponse = serde_json::from_slice(&body)?;
        match response {
            DaemonResponse::Pong => Ok(()),
            DaemonResponse::Error { message } => Err(ClientError::DaemonError(message)),
            _ => Err(ClientError::UnexpectedResponse),
        }
    }

    /// Unstage a single file.
    pub async fn git_unstage_file(
        &self,
        session_id: &str,
        file_path: &str,
    ) -> Result<(), ClientError> {
        let body_json = serde_json::json!({ "file_path": file_path });
        let body = self
            .post(
                &format!("/sessions/{}/git/unstage", session_id),
                &body_json,
            )
            .await?;
        let response: DaemonResponse = serde_json::from_slice(&body)?;
        match response {
            DaemonResponse::Pong => Ok(()),
            DaemonResponse::Error { message } => Err(ClientError::DaemonError(message)),
            _ => Err(ClientError::UnexpectedResponse),
        }
    }

    /// Stage multiple files in a single batch operation.
    pub async fn git_stage_files(
        &self,
        session_id: &str,
        file_paths: &[String],
    ) -> Result<(), ClientError> {
        let body_json = serde_json::json!({ "file_paths": file_paths });
        let body = self
            .post(
                &format!("/sessions/{}/git/stage-files", session_id),
                &body_json,
            )
            .await?;
        let response: DaemonResponse = serde_json::from_slice(&body)?;
        match response {
            DaemonResponse::Pong => Ok(()),
            DaemonResponse::Error { message } => Err(ClientError::DaemonError(message)),
            _ => Err(ClientError::UnexpectedResponse),
        }
    }

    /// Unstage multiple files in a single batch operation.
    pub async fn git_unstage_files(
        &self,
        session_id: &str,
        file_paths: &[String],
    ) -> Result<(), ClientError> {
        let body_json = serde_json::json!({ "file_paths": file_paths });
        let body = self
            .post(
                &format!("/sessions/{}/git/unstage-files", session_id),
                &body_json,
            )
            .await?;
        let response: DaemonResponse = serde_json::from_slice(&body)?;
        match response {
            DaemonResponse::Pong => Ok(()),
            DaemonResponse::Error { message } => Err(ClientError::DaemonError(message)),
            _ => Err(ClientError::UnexpectedResponse),
        }
    }

    /// Stage a single hunk from a file.
    pub async fn git_stage_hunk(
        &self,
        session_id: &str,
        file_path: &str,
        hunk_index: usize,
    ) -> Result<(), ClientError> {
        let body_json = serde_json::json!({
            "file_path": file_path,
            "hunk_index": hunk_index
        });
        let body = self
            .post(
                &format!("/sessions/{}/git/stage-hunk", session_id),
                &body_json,
            )
            .await?;
        let response: DaemonResponse = serde_json::from_slice(&body)?;
        match response {
            DaemonResponse::Pong => Ok(()),
            DaemonResponse::Error { message } => Err(ClientError::DaemonError(message)),
            _ => Err(ClientError::UnexpectedResponse),
        }
    }

    /// Commit staged files with a message.
    pub async fn git_commit(
        &self,
        session_id: &str,
        message: &str,
    ) -> Result<String, ClientError> {
        let body_json = serde_json::json!({ "message": message });
        let body = self
            .post(
                &format!("/sessions/{}/git/commit", session_id),
                &body_json,
            )
            .await?;
        let response: DaemonResponse = serde_json::from_slice(&body)?;
        match response {
            DaemonResponse::GitCommitResult { oid } => Ok(oid),
            DaemonResponse::Pong => Ok(String::new()),
            DaemonResponse::Error { message } => Err(ClientError::DaemonError(message)),
            _ => Err(ClientError::UnexpectedResponse),
        }
    }

    /// Get git commit log.
    pub async fn git_log(
        &self,
        session_id: &str,
        limit: Option<usize>,
    ) -> Result<Vec<crate::types::GitLogEntry>, ClientError> {
        let url = match limit {
            Some(n) => format!("/sessions/{}/git/log?limit={}", session_id, n),
            None => format!("/sessions/{}/git/log", session_id),
        };
        let body = self.get(&url).await?;
        let response: DaemonResponse = serde_json::from_slice(&body)?;
        match response {
            DaemonResponse::GitLogResult { entries } => Ok(entries),
            DaemonResponse::Error { message } => Err(ClientError::DaemonError(message)),
            _ => Err(ClientError::UnexpectedResponse),
        }
    }

    /// Get branch info (name + remote existence).
    pub async fn git_branch_info(
        &self,
        session_id: &str,
    ) -> Result<crate::types::BranchInfo, ClientError> {
        let body = self
            .get(&format!("/sessions/{}/git/branch-info", session_id))
            .await?;
        let response: DaemonResponse = serde_json::from_slice(&body)?;
        match response {
            DaemonResponse::GitBranchInfo { info } => Ok(info),
            DaemonResponse::Error { message } => Err(ClientError::DaemonError(message)),
            _ => Err(ClientError::UnexpectedResponse),
        }
    }

    /// Push current branch to origin.
    pub async fn git_push(
        &self,
        session_id: &str,
    ) -> Result<(), ClientError> {
        let body = self
            .post(
                &format!("/sessions/{}/git/push", session_id),
                &serde_json::json!({}),
            )
            .await?;
        let response: DaemonResponse = serde_json::from_slice(&body)?;
        match response {
            DaemonResponse::GitPushResult => Ok(()),
            DaemonResponse::Error { message } => Err(ClientError::DaemonError(message)),
            _ => Err(ClientError::UnexpectedResponse),
        }
    }

    // ── Chat mode methods ──

    /// Send a message to a session (chat mode).
    pub async fn send_message(
        &self,
        session_id: &str,
        content: &str,
        model: Option<&str>,
    ) -> Result<String, ClientError> {
        let mut body_json = serde_json::json!({ "content": content });
        if let Some(m) = model {
            body_json["model"] = serde_json::json!(m);
        }
        let body = self
            .post(&format!("/sessions/{}/messages", session_id), &body_json)
            .await?;
        let response: DaemonResponse = serde_json::from_slice(&body)?;
        match response {
            DaemonResponse::MessageAccepted { message_id } => Ok(message_id),
            DaemonResponse::Error { message } => Err(ClientError::DaemonError(message)),
            _ => Err(ClientError::UnexpectedResponse),
        }
    }

    /// Get messages from a session (chat mode).
    pub async fn get_messages(
        &self,
        session_id: &str,
        limit: Option<usize>,
        before_id: Option<&str>,
    ) -> Result<Vec<crate::types::Message>, ClientError> {
        let mut path = format!("/sessions/{}/messages", session_id);
        let mut params = Vec::new();
        if let Some(l) = limit {
            params.push(format!("limit={}", l));
        }
        if let Some(bid) = before_id {
            params.push(format!("before_id={}", bid));
        }
        if !params.is_empty() {
            path.push('?');
            path.push_str(&params.join("&"));
        }
        let body = self.get(&path).await?;
        let response: DaemonResponse = serde_json::from_slice(&body)?;
        match response {
            DaemonResponse::Messages { messages } => Ok(messages),
            DaemonResponse::Error { message } => Err(ClientError::DaemonError(message)),
            _ => Err(ClientError::UnexpectedResponse),
        }
    }

    /// Cancel an in-progress response (chat mode).
    pub async fn cancel_response(&self, session_id: &str) -> Result<(), ClientError> {
        let body = self
            .delete(&format!("/sessions/{}/messages/current", session_id))
            .await?;
        let response: DaemonResponse = serde_json::from_slice(&body)?;
        match response {
            DaemonResponse::CancelAccepted => Ok(()),
            DaemonResponse::Error { message } => Err(ClientError::DaemonError(message)),
            _ => Err(ClientError::UnexpectedResponse),
        }
    }

    /// Import Claude CLI history for a session's working directory.
    /// If `target_cli_session_id` is provided, imports that specific CLI session.
    pub async fn import_history(
        &self,
        session_id: &str,
        limit: Option<usize>,
        all_sessions: Option<bool>,
        target_cli_session_id: Option<&str>,
    ) -> Result<Vec<crate::types::Message>, ClientError> {
        let mut path = format!("/sessions/{}/history", session_id);
        let mut params = Vec::new();
        if let Some(l) = limit {
            params.push(format!("limit={}", l));
        }
        if let Some(all) = all_sessions {
            params.push(format!("all_sessions={}", all));
        }
        if let Some(target_id) = target_cli_session_id {
            params.push(format!("target_session_id={}", target_id));
        }
        if !params.is_empty() {
            path.push('?');
            path.push_str(&params.join("&"));
        }
        let body = self.get(&path).await?;
        let response: DaemonResponse = serde_json::from_slice(&body)?;
        match response {
            DaemonResponse::Messages { messages } => Ok(messages),
            DaemonResponse::Error { message } => Err(ClientError::DaemonError(message)),
            _ => Err(ClientError::UnexpectedResponse),
        }
    }

    /// Send an HTTP GET request to the daemon over the Unix socket.
    async fn get(&self, path: &str) -> Result<Bytes, ClientError> {
        let stream = UnixStream::connect(&self.socket_path)
            .await
            .map_err(|e| ClientError::ConnectionFailed {
                path: self.socket_path.clone(),
                source: e,
            })?;

        let io = TokioIo::new(stream);

        let (mut sender, conn) = hyper::client::conn::http1::handshake(io)
            .await
            .map_err(ClientError::HttpError)?;

        // Spawn connection driver.
        tokio::spawn(async move {
            if let Err(e) = conn.await {
                tracing::error!("Connection error: {}", e);
            }
        });

        let req = Request::builder()
            .uri(path)
            .header("Host", "localhost")
            .body(Full::new(Bytes::new()))
            .expect("Failed to build request");

        let resp = sender.send_request(req).await.map_err(ClientError::HttpError)?;

        let body = resp.into_body().collect().await.map_err(ClientError::HttpError)?;
        Ok(body.to_bytes())
    }

    /// Send an HTTP POST request with JSON body to the daemon over the Unix socket.
    async fn post(&self, path: &str, json_body: &serde_json::Value) -> Result<Bytes, ClientError> {
        let body_bytes = serde_json::to_vec(json_body)?;

        let stream = UnixStream::connect(&self.socket_path)
            .await
            .map_err(|e| ClientError::ConnectionFailed {
                path: self.socket_path.clone(),
                source: e,
            })?;

        let io = TokioIo::new(stream);

        let (mut sender, conn) = hyper::client::conn::http1::handshake(io)
            .await
            .map_err(ClientError::HttpError)?;

        tokio::spawn(async move {
            if let Err(e) = conn.await {
                tracing::error!("Connection error: {}", e);
            }
        });

        let req = Request::builder()
            .method("POST")
            .uri(path)
            .header("Host", "localhost")
            .header("Content-Type", "application/json")
            .body(Full::new(Bytes::from(body_bytes)))
            .expect("Failed to build request");

        let resp = sender.send_request(req).await.map_err(ClientError::HttpError)?;
        let body = resp.into_body().collect().await.map_err(ClientError::HttpError)?;
        Ok(body.to_bytes())
    }

    /// Send an HTTP DELETE request to the daemon over the Unix socket.
    async fn delete(&self, path: &str) -> Result<Bytes, ClientError> {
        let stream = UnixStream::connect(&self.socket_path)
            .await
            .map_err(|e| ClientError::ConnectionFailed {
                path: self.socket_path.clone(),
                source: e,
            })?;

        let io = TokioIo::new(stream);

        let (mut sender, conn) = hyper::client::conn::http1::handshake(io)
            .await
            .map_err(ClientError::HttpError)?;

        tokio::spawn(async move {
            if let Err(e) = conn.await {
                tracing::error!("Connection error: {}", e);
            }
        });

        let req = Request::builder()
            .method("DELETE")
            .uri(path)
            .header("Host", "localhost")
            .body(Full::new(Bytes::new()))
            .expect("Failed to build request");

        let resp = sender.send_request(req).await.map_err(ClientError::HttpError)?;
        let body = resp.into_body().collect().await.map_err(ClientError::HttpError)?;
        Ok(body.to_bytes())
    }
}

/// Default socket path: ~/.mado/mado.sock
pub fn default_socket_path() -> PathBuf {
    dirs_path().join("mado.sock")
}

/// Default PID file path: ~/.mado/mado.pid
pub fn default_pid_path() -> PathBuf {
    dirs_path().join("mado.pid")
}

/// Default state file path: ~/.mado/state.json
pub fn default_state_path() -> PathBuf {
    dirs_path().join("state.json")
}

/// The ~/.mado/ directory path.
pub fn dirs_path() -> PathBuf {
    dirs::home_dir()
        .expect("Failed to determine home directory")
        .join(".mado")
}
