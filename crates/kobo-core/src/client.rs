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

/// Client for communicating with the kobo daemon over a Unix domain socket.
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
        let pid_path = socket_path.with_file_name("kobo.pid");
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
}

/// Default socket path: ~/.kobo/kobo.sock
pub fn default_socket_path() -> PathBuf {
    dirs_path().join("kobo.sock")
}

/// Default PID file path: ~/.kobo/kobo.pid
pub fn default_pid_path() -> PathBuf {
    dirs_path().join("kobo.pid")
}

/// Default state file path: ~/.kobo/state.json
pub fn default_state_path() -> PathBuf {
    dirs_path().join("state.json")
}

/// The ~/.kobo/ directory path.
pub fn dirs_path() -> PathBuf {
    dirs::home_dir()
        .expect("Failed to determine home directory")
        .join(".kobo")
}
