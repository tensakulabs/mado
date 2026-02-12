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
