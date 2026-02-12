use std::os::unix::fs::PermissionsExt;
use std::path::{Path, PathBuf};
use std::sync::Arc;
use std::time::Instant;

use axum::extract::State;
use axum::response::Json;
use axum::routing::get;
use axum::Router;
use tokio::net::UnixListener;
use tracing;

use kobo_core::protocol::DaemonResponse;
use kobo_core::types::DaemonStatus;

/// Shared state for the axum server.
#[derive(Clone)]
pub struct AppState {
    pub start_time: Instant,
    pub pid: u32,
}

/// Start the daemon's HTTP server on a Unix domain socket.
///
/// This function will:
/// 1. Ensure the parent directory exists with proper permissions.
/// 2. Clean up any stale socket file.
/// 3. Bind the Unix listener and set socket permissions to 0600.
/// 4. Serve the axum router until a shutdown signal is received.
pub async fn start_server(
    socket_path: PathBuf,
    shutdown_signal: impl std::future::Future<Output = ()> + Send + 'static,
) -> Result<(), ServerError> {
    // Ensure parent directory exists with 0700 permissions.
    ensure_dir(socket_path.parent().unwrap()).await?;

    // Clean up stale socket file.
    cleanup_stale_socket(&socket_path).await?;

    // Bind the Unix listener.
    let listener =
        UnixListener::bind(&socket_path).map_err(|e| ServerError::BindFailed {
            path: socket_path.clone(),
            source: e,
        })?;

    // Set socket permissions to 0600 (owner only).
    std::fs::set_permissions(&socket_path, std::fs::Permissions::from_mode(0o600))
        .map_err(|e| ServerError::PermissionsFailed {
            path: socket_path.clone(),
            source: e,
        })?;

    tracing::info!(
        "Daemon listening on {}",
        socket_path.display()
    );

    let state = AppState {
        start_time: Instant::now(),
        pid: std::process::id(),
    };

    let app = create_router(state);

    // Serve with graceful shutdown.
    axum::serve(listener, app)
        .with_graceful_shutdown(shutdown_signal)
        .await
        .map_err(ServerError::ServeFailed)?;

    // Clean up socket file after shutdown.
    if socket_path.exists() {
        let _ = std::fs::remove_file(&socket_path);
        tracing::info!("Socket file removed: {}", socket_path.display());
    }

    Ok(())
}

/// Create the axum router with all routes.
fn create_router(state: AppState) -> Router {
    Router::new()
        .route("/health", get(health_handler))
        .route("/ping", get(ping_handler))
        .with_state(Arc::new(state))
}

/// Handler for GET /health
async fn health_handler(State(state): State<Arc<AppState>>) -> Json<DaemonResponse> {
    let uptime = state.start_time.elapsed().as_secs();
    let status = DaemonStatus {
        pid: state.pid,
        uptime,
        session_count: 0,
        version: env!("CARGO_PKG_VERSION").to_string(),
    };
    Json(DaemonResponse::Health { status })
}

/// Handler for GET /ping
async fn ping_handler() -> Json<DaemonResponse> {
    Json(DaemonResponse::Pong)
}

/// Ensure a directory exists with 0700 permissions.
async fn ensure_dir(dir: &Path) -> Result<(), ServerError> {
    if !dir.exists() {
        std::fs::create_dir_all(dir).map_err(|e| ServerError::DirCreateFailed {
            path: dir.to_path_buf(),
            source: e,
        })?;
        std::fs::set_permissions(dir, std::fs::Permissions::from_mode(0o700))
            .map_err(|e| ServerError::PermissionsFailed {
                path: dir.to_path_buf(),
                source: e,
            })?;
        tracing::info!("Created directory: {}", dir.display());
    }
    Ok(())
}

/// Clean up a stale socket file if it exists and is not connectable.
async fn cleanup_stale_socket(socket_path: &Path) -> Result<(), ServerError> {
    if !socket_path.exists() {
        return Ok(());
    }

    // Try to connect to the socket. If it succeeds, another daemon is running.
    match tokio::net::UnixStream::connect(socket_path).await {
        Ok(_) => {
            return Err(ServerError::AlreadyRunning(socket_path.to_path_buf()));
        }
        Err(_) => {
            // Socket exists but is not connectable -- it's stale.
            tracing::warn!(
                "Removing stale socket file: {}",
                socket_path.display()
            );
            std::fs::remove_file(socket_path).map_err(|e| ServerError::CleanupFailed {
                path: socket_path.to_path_buf(),
                source: e,
            })?;
        }
    }

    Ok(())
}

/// Errors that can occur in the server.
#[derive(Debug, thiserror::Error)]
pub enum ServerError {
    #[error("Failed to bind Unix socket at {path}: {source}")]
    BindFailed {
        path: PathBuf,
        source: std::io::Error,
    },

    #[error("Failed to set permissions on {path}: {source}")]
    PermissionsFailed {
        path: PathBuf,
        source: std::io::Error,
    },

    #[error("Failed to create directory {path}: {source}")]
    DirCreateFailed {
        path: PathBuf,
        source: std::io::Error,
    },

    #[error("Another daemon is already running on {0}")]
    AlreadyRunning(PathBuf),

    #[error("Failed to clean up stale file {path}: {source}")]
    CleanupFailed {
        path: PathBuf,
        source: std::io::Error,
    },

    #[error("Server error: {0}")]
    ServeFailed(std::io::Error),
}
