use std::os::unix::fs::PermissionsExt;
use std::path::{Path, PathBuf};

use tokio::signal;
use tracing;

use crate::pid::{PidFile, PidError};
use crate::server;

/// Configuration for starting the daemon.
#[derive(Debug, Clone)]
pub struct DaemonConfig {
    /// Path to the Unix domain socket.
    pub socket_path: PathBuf,
    /// Path to the PID file.
    pub pid_path: PathBuf,
    /// Path to the state file.
    pub state_path: PathBuf,
    /// Whether to daemonize (double-fork into background).
    pub daemonize: bool,
}

impl DaemonConfig {
    /// Derive the base directory from the socket path.
    pub fn base_dir(&self) -> &Path {
        self.socket_path
            .parent()
            .expect("Socket path should have a parent directory")
    }
}

/// Errors that can occur during daemon lifecycle management.
#[derive(Debug, thiserror::Error)]
pub enum LifecycleError {
    #[error("PID file error: {0}")]
    PidError(#[from] PidError),

    #[error("Server error: {0}")]
    ServerError(#[from] server::ServerError),

    #[error("Failed to create directory {path}: {source}")]
    DirCreateFailed {
        path: PathBuf,
        source: std::io::Error,
    },

    #[error("Daemonization failed: {0}")]
    DaemonizeFailed(String),
}

/// Guard that removes the socket file when dropped.
/// This ensures cleanup even on panic.
pub struct SocketGuard {
    path: PathBuf,
}

impl SocketGuard {
    pub fn new(path: impl Into<PathBuf>) -> Self {
        Self { path: path.into() }
    }
}

impl Drop for SocketGuard {
    fn drop(&mut self) {
        if self.path.exists() {
            match std::fs::remove_file(&self.path) {
                Ok(()) => {
                    tracing::info!("Socket file cleaned up: {}", self.path.display());
                }
                Err(e) => {
                    tracing::error!(
                        "Failed to remove socket file {}: {}",
                        self.path.display(),
                        e
                    );
                }
            }
        }
    }
}

/// Start the daemon with the given configuration.
/// Uses Unix signal handlers (SIGTERM/SIGINT) for shutdown.
pub async fn start(config: DaemonConfig) -> Result<(), LifecycleError> {
    start_with_shutdown(config, create_shutdown_signal()).await
}

/// Start the daemon with a custom shutdown signal.
/// This is useful for testing where we cannot send Unix signals easily.
pub async fn start_with_shutdown(
    config: DaemonConfig,
    shutdown_signal: impl std::future::Future<Output = ()> + Send + 'static,
) -> Result<(), LifecycleError> {
    // Step 1: Ensure the base directory exists with 0700 permissions.
    ensure_base_dir(config.base_dir())?;

    // Step 2: Daemonize if requested.
    if config.daemonize {
        daemonize()?;
    }

    // Step 3: Acquire PID file (prevents duplicates, cleans stale).
    let _pid_file = PidFile::acquire(&config.pid_path, Some(&config.socket_path))?;

    // Step 4: Create a socket guard for cleanup on panic.
    let _socket_guard = SocketGuard::new(&config.socket_path);

    // Step 5: Load existing state (best-effort -- if missing, start fresh).
    let state_path = config.state_path.clone();
    let state = crate::state::DaemonState::load(&state_path).unwrap_or_else(|e| {
        tracing::warn!("Failed to load state from {}: {}, starting fresh", state_path.display(), e);
        crate::state::DaemonState::default()
    });
    tracing::info!("Loaded state with {} sessions", state.sessions.len());

    // Step 6: Start the server.
    tracing::info!("Starting server on {}", config.socket_path.display());

    // Create a oneshot channel to signal when shutdown is requested.
    let (shutdown_tx, shutdown_rx) = tokio::sync::oneshot::channel::<()>();

    // Spawn a task to wait for the shutdown signal and then save state.
    let save_state_path = config.state_path.clone();
    let save_state = state.clone();
    tokio::spawn(async move {
        shutdown_signal.await;
        // Save state before shutting down.
        if let Err(e) = save_state.save(&save_state_path) {
            tracing::error!("Failed to save state on shutdown: {}", e);
        } else {
            tracing::info!("State saved on shutdown");
        }
        let _ = shutdown_tx.send(());
    });

    server::start_server(config.socket_path, async {
        shutdown_rx.await.ok();
    })
    .await?;

    tracing::info!("Daemon shut down cleanly");
    // _pid_file and _socket_guard are dropped here, cleaning up files.

    Ok(())
}

/// Create an async signal that resolves when SIGTERM or SIGINT is received.
async fn create_shutdown_signal() {
    let mut sigterm =
        signal::unix::signal(signal::unix::SignalKind::terminate())
            .expect("Failed to install SIGTERM handler");
    let mut sigint =
        signal::unix::signal(signal::unix::SignalKind::interrupt())
            .expect("Failed to install SIGINT handler");
    let mut sighup =
        signal::unix::signal(signal::unix::SignalKind::hangup())
            .expect("Failed to install SIGHUP handler");

    tokio::select! {
        _ = sigterm.recv() => {
            tracing::info!("Received SIGTERM, initiating graceful shutdown");
        }
        _ = sigint.recv() => {
            tracing::info!("Received SIGINT, initiating graceful shutdown");
        }
        _ = sighup.recv() => {
            tracing::info!("Received SIGHUP (config reload not yet implemented), ignoring");
            // For now, SIGHUP does nothing. In the future it could reload config.
            // We need to wait for another signal.
            tokio::select! {
                _ = sigterm.recv() => {
                    tracing::info!("Received SIGTERM, initiating graceful shutdown");
                }
                _ = sigint.recv() => {
                    tracing::info!("Received SIGINT, initiating graceful shutdown");
                }
            }
        }
    }
}

/// Ensure the base directory exists with 0700 permissions.
fn ensure_base_dir(dir: &Path) -> Result<(), LifecycleError> {
    if !dir.exists() {
        std::fs::create_dir_all(dir).map_err(|e| LifecycleError::DirCreateFailed {
            path: dir.to_path_buf(),
            source: e,
        })?;
        std::fs::set_permissions(dir, std::fs::Permissions::from_mode(0o700))
            .map_err(|e| LifecycleError::DirCreateFailed {
                path: dir.to_path_buf(),
                source: e,
            })?;
        tracing::info!("Created directory: {}", dir.display());
    }
    Ok(())
}

/// Perform double-fork daemonization.
///
/// This detaches the process from the controlling terminal:
/// 1. First fork: parent exits, child continues.
/// 2. setsid(): create new session (no controlling terminal).
/// 3. Second fork: first child exits, grandchild continues (can never acquire terminal).
/// 4. Redirect stdin/stdout/stderr to /dev/null.
fn daemonize() -> Result<(), LifecycleError> {
    use std::fs::File;

    // First fork
    match unsafe { libc::fork() } {
        -1 => {
            return Err(LifecycleError::DaemonizeFailed(
                "First fork failed".to_string(),
            ));
        }
        0 => {
            // Child continues
        }
        _ => {
            // Parent exits
            std::process::exit(0);
        }
    }

    // Create new session
    if unsafe { libc::setsid() } == -1 {
        return Err(LifecycleError::DaemonizeFailed(
            "setsid() failed".to_string(),
        ));
    }

    // Second fork
    match unsafe { libc::fork() } {
        -1 => {
            return Err(LifecycleError::DaemonizeFailed(
                "Second fork failed".to_string(),
            ));
        }
        0 => {
            // Grandchild continues
        }
        _ => {
            // First child exits
            std::process::exit(0);
        }
    }

    // Redirect stdin/stdout/stderr to /dev/null
    let dev_null = File::open("/dev/null")
        .map_err(|e| LifecycleError::DaemonizeFailed(format!("Failed to open /dev/null: {}", e)))?;
    let fd = std::os::unix::io::AsRawFd::as_raw_fd(&dev_null);

    unsafe {
        libc::dup2(fd, libc::STDIN_FILENO);
        libc::dup2(fd, libc::STDOUT_FILENO);
        libc::dup2(fd, libc::STDERR_FILENO);
    }

    tracing::info!("Daemonized successfully (pid: {})", std::process::id());

    Ok(())
}
