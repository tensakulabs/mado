use std::convert::Infallible;
use std::os::unix::fs::PermissionsExt;
use std::path::{Path, PathBuf};
use std::sync::Arc;
use std::time::Instant;

use axum::extract::{Path as AxumPath, State};
use axum::response::sse::{Event, Sse};
use axum::response::Json;
use axum::routing::{get, post};
use axum::Router;
use base64::Engine;
use futures::stream::Stream;
use serde::Deserialize;
use tokio::net::UnixListener;
use tokio::sync::Mutex;
use tokio_stream::wrappers::BroadcastStream;
use tokio_stream::StreamExt;
use tracing;

use kobo_core::protocol::DaemonResponse;
use kobo_core::types::{DaemonStatus, PtySize, SessionId};

use crate::process::new_shared_process_manager;
use crate::session::{SessionManager, SharedSessionManager};
use crate::state::DaemonState;

/// Shared state for the axum server.
#[derive(Clone)]
pub struct AppState {
    pub start_time: Instant,
    pub pid: u32,
    pub session_manager: SharedSessionManager,
}

/// Request body for creating a session.
#[derive(Debug, Deserialize)]
pub struct CreateSessionBody {
    pub name: String,
    #[serde(default = "default_model")]
    pub model: String,
    #[serde(default)]
    pub rows: Option<u16>,
    #[serde(default)]
    pub cols: Option<u16>,
}

fn default_model() -> String {
    "sonnet".to_string()
}

/// Request body for writing input.
#[derive(Debug, Deserialize)]
pub struct InputBody {
    /// Base64-encoded input data.
    pub data: String,
}

/// Request body for resizing.
#[derive(Debug, Deserialize)]
pub struct ResizeBody {
    pub rows: u16,
    pub cols: u16,
}

/// Request body for saving a milestone.
#[derive(Debug, Deserialize)]
pub struct SaveMilestoneBody {
    pub message: String,
}

/// Request body for restoring a milestone.
#[derive(Debug, Deserialize)]
pub struct RestoreMilestoneBody {
    pub oid: String,
}

/// Start the daemon's HTTP server on a Unix domain socket.
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

    tracing::info!("Daemon listening on {}", socket_path.display());

    let state = create_app_state();
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

/// Create the shared app state with session and process managers.
fn create_app_state() -> AppState {
    let daemon_state = Arc::new(Mutex::new(DaemonState::default()));
    let process_manager = new_shared_process_manager();
    let session_manager = Arc::new(SessionManager::new(daemon_state, process_manager));

    AppState {
        start_time: Instant::now(),
        pid: std::process::id(),
        session_manager,
    }
}

/// Create the axum router with all routes.
fn create_router(state: AppState) -> Router {
    Router::new()
        // Health & liveness.
        .route("/health", get(health_handler))
        .route("/ping", get(ping_handler))
        // Session CRUD.
        .route("/sessions", get(list_sessions_handler).post(create_session_handler))
        .route("/sessions/{id}", get(get_session_handler).delete(destroy_session_handler))
        // Session I/O.
        .route("/sessions/{id}/input", post(input_handler))
        .route("/sessions/{id}/resize", post(resize_handler))
        .route("/sessions/{id}/output", get(output_handler))
        // Versioning.
        .route("/sessions/{id}/save", post(save_milestone_handler))
        .route("/sessions/{id}/milestones", get(list_milestones_handler))
        .route("/sessions/{id}/diff", get(diff_milestones_handler))
        .route("/sessions/{id}/restore", post(restore_milestone_handler))
        .with_state(state)
}

// ── Health endpoints ──

async fn health_handler(State(state): State<AppState>) -> Json<DaemonResponse> {
    let uptime = state.start_time.elapsed().as_secs();
    let sessions = state.session_manager.list_sessions().await;
    let status = DaemonStatus {
        pid: state.pid,
        uptime,
        session_count: sessions.len(),
        version: env!("CARGO_PKG_VERSION").to_string(),
    };
    Json(DaemonResponse::Health { status })
}

async fn ping_handler() -> Json<DaemonResponse> {
    Json(DaemonResponse::Pong)
}

// ── Session CRUD endpoints ──

async fn list_sessions_handler(
    State(state): State<AppState>,
) -> Json<DaemonResponse> {
    let sessions = state.session_manager.list_sessions().await;
    Json(DaemonResponse::Sessions { sessions })
}

async fn create_session_handler(
    State(state): State<AppState>,
    Json(body): Json<CreateSessionBody>,
) -> Json<DaemonResponse> {
    let pty_size = PtySize {
        rows: body.rows.unwrap_or(24),
        cols: body.cols.unwrap_or(80),
    };

    match state
        .session_manager
        .create_session(body.name, body.model, pty_size, None)
        .await
    {
        Ok(session) => Json(DaemonResponse::SessionCreated { session }),
        Err(e) => Json(DaemonResponse::Error {
            message: e.to_string(),
        }),
    }
}

async fn get_session_handler(
    State(state): State<AppState>,
    AxumPath(id): AxumPath<String>,
) -> Json<DaemonResponse> {
    let session_id = SessionId::new(id);
    match state.session_manager.get_session(&session_id).await {
        Some(session) => Json(DaemonResponse::Sessions {
            sessions: vec![session],
        }),
        None => Json(DaemonResponse::Error {
            message: format!("Session not found: {}", session_id),
        }),
    }
}

async fn destroy_session_handler(
    State(state): State<AppState>,
    AxumPath(id): AxumPath<String>,
) -> Json<DaemonResponse> {
    let session_id = SessionId::new(id);
    match state.session_manager.destroy_session(&session_id).await {
        Ok(()) => Json(DaemonResponse::Pong), // Simple ACK
        Err(e) => Json(DaemonResponse::Error {
            message: e.to_string(),
        }),
    }
}

// ── Session I/O endpoints ──

async fn input_handler(
    State(state): State<AppState>,
    AxumPath(id): AxumPath<String>,
    Json(body): Json<InputBody>,
) -> Json<DaemonResponse> {
    let session_id = SessionId::new(id);

    let data = match base64::engine::general_purpose::STANDARD.decode(&body.data) {
        Ok(d) => d,
        Err(e) => {
            return Json(DaemonResponse::Error {
                message: format!("Invalid base64 input: {}", e),
            });
        }
    };

    match state.session_manager.write_input(&session_id, &data).await {
        Ok(()) => Json(DaemonResponse::Pong),
        Err(e) => Json(DaemonResponse::Error {
            message: e.to_string(),
        }),
    }
}

async fn resize_handler(
    State(state): State<AppState>,
    AxumPath(id): AxumPath<String>,
    Json(body): Json<ResizeBody>,
) -> Json<DaemonResponse> {
    let session_id = SessionId::new(id);

    match state
        .session_manager
        .resize_session(&session_id, body.rows, body.cols)
        .await
    {
        Ok(()) => Json(DaemonResponse::Pong),
        Err(e) => Json(DaemonResponse::Error {
            message: e.to_string(),
        }),
    }
}

async fn output_handler(
    State(state): State<AppState>,
    AxumPath(id): AxumPath<String>,
) -> Sse<std::pin::Pin<Box<dyn Stream<Item = Result<Event, Infallible>> + Send>>> {
    let session_id = SessionId::new(id);

    // Try to subscribe to the session's output.
    let rx = state
        .session_manager
        .subscribe_output(&session_id)
        .await;

    match rx {
        Ok(rx) => {
            let stream = BroadcastStream::new(rx).filter_map(|result| match result {
                Ok(bytes) => {
                    let encoded = base64::engine::general_purpose::STANDARD.encode(&bytes);
                    Some(Ok(Event::default().data(encoded).event("output")))
                }
                Err(_) => None, // Lagged receiver, skip
            });

            // Prepend a "started" event.
            let started = futures::stream::once(async {
                Ok(Event::default().data("connected").event("started"))
            });

            Sse::new(Box::pin(started.chain(stream)))
        }
        Err(_e) => {
            // Session not found -- return a stream with just an error event.
            let error_stream = futures::stream::once(async {
                Ok(Event::default().data("session_not_found").event("error"))
            });
            Sse::new(Box::pin(error_stream))
        }
    }
}

// ── Versioning endpoints ──

async fn save_milestone_handler(
    State(state): State<AppState>,
    AxumPath(id): AxumPath<String>,
    Json(body): Json<SaveMilestoneBody>,
) -> Json<DaemonResponse> {
    let session_id = kobo_core::types::SessionId::new(id);

    // Get session's working directory.
    let session = state.session_manager.get_session(&session_id).await;
    let working_dir = match session {
        Some(s) => s
            .working_dir
            .unwrap_or_else(|| {
                dirs::home_dir()
                    .map(|h| h.to_string_lossy().to_string())
                    .unwrap_or_else(|| "/tmp".to_string())
            }),
        None => {
            return Json(DaemonResponse::Error {
                message: format!("Session not found: {}", session_id),
            });
        }
    };

    let path = std::path::Path::new(&working_dir);

    // Ensure git repo exists.
    if let Err(e) = crate::git_ops::init_repo(path) {
        return Json(DaemonResponse::Error {
            message: format!("Failed to init git repo: {}", e),
        });
    }

    match crate::git_ops::save_milestone(path, &body.message) {
        Ok(milestone) => {
            let core_milestone = kobo_core::types::Milestone {
                oid: milestone.oid,
                message: milestone.message,
                timestamp: milestone.timestamp,
                files_changed: milestone.files_changed,
                insertions: milestone.insertions,
                deletions: milestone.deletions,
            };
            Json(DaemonResponse::MilestoneSaved {
                milestone: core_milestone,
            })
        }
        Err(e) => Json(DaemonResponse::Error {
            message: e.to_string(),
        }),
    }
}

async fn list_milestones_handler(
    State(state): State<AppState>,
    AxumPath(id): AxumPath<String>,
    axum::extract::Query(params): axum::extract::Query<std::collections::HashMap<String, String>>,
) -> Json<DaemonResponse> {
    let session_id = kobo_core::types::SessionId::new(id);
    let limit = params
        .get("limit")
        .and_then(|l| l.parse().ok())
        .unwrap_or(20usize);

    let session = state.session_manager.get_session(&session_id).await;
    let working_dir = match session {
        Some(s) => s
            .working_dir
            .unwrap_or_else(|| {
                dirs::home_dir()
                    .map(|h| h.to_string_lossy().to_string())
                    .unwrap_or_else(|| "/tmp".to_string())
            }),
        None => {
            return Json(DaemonResponse::Error {
                message: format!("Session not found: {}", session_id),
            });
        }
    };

    let path = std::path::Path::new(&working_dir);

    match crate::git_ops::list_milestones(path, limit) {
        Ok(milestones) => {
            let core_milestones: Vec<kobo_core::types::Milestone> = milestones
                .into_iter()
                .map(|m| kobo_core::types::Milestone {
                    oid: m.oid,
                    message: m.message,
                    timestamp: m.timestamp,
                    files_changed: m.files_changed,
                    insertions: m.insertions,
                    deletions: m.deletions,
                })
                .collect();
            Json(DaemonResponse::Milestones {
                milestones: core_milestones,
            })
        }
        Err(e) => Json(DaemonResponse::Error {
            message: e.to_string(),
        }),
    }
}

async fn diff_milestones_handler(
    State(state): State<AppState>,
    AxumPath(id): AxumPath<String>,
    axum::extract::Query(params): axum::extract::Query<std::collections::HashMap<String, String>>,
) -> Json<DaemonResponse> {
    let session_id = kobo_core::types::SessionId::new(id);

    let from_oid = match params.get("from") {
        Some(f) => f.clone(),
        None => {
            return Json(DaemonResponse::Error {
                message: "Missing 'from' parameter".to_string(),
            });
        }
    };
    let to_oid = match params.get("to") {
        Some(t) => t.clone(),
        None => {
            return Json(DaemonResponse::Error {
                message: "Missing 'to' parameter".to_string(),
            });
        }
    };

    let session = state.session_manager.get_session(&session_id).await;
    let working_dir = match session {
        Some(s) => s
            .working_dir
            .unwrap_or_else(|| {
                dirs::home_dir()
                    .map(|h| h.to_string_lossy().to_string())
                    .unwrap_or_else(|| "/tmp".to_string())
            }),
        None => {
            return Json(DaemonResponse::Error {
                message: format!("Session not found: {}", session_id),
            });
        }
    };

    let path = std::path::Path::new(&working_dir);

    match crate::git_ops::diff_milestones(path, &from_oid, &to_oid) {
        Ok(diff) => {
            let core_diff = kobo_core::types::DiffSummary {
                files: diff
                    .files
                    .into_iter()
                    .map(|f| kobo_core::types::FileDiff {
                        path: f.path,
                        insertions: f.insertions,
                        deletions: f.deletions,
                        status: f.status,
                    })
                    .collect(),
                total_insertions: diff.total_insertions,
                total_deletions: diff.total_deletions,
            };
            Json(DaemonResponse::DiffResult { diff: core_diff })
        }
        Err(e) => Json(DaemonResponse::Error {
            message: e.to_string(),
        }),
    }
}

async fn restore_milestone_handler(
    State(state): State<AppState>,
    AxumPath(id): AxumPath<String>,
    Json(body): Json<RestoreMilestoneBody>,
) -> Json<DaemonResponse> {
    let session_id = kobo_core::types::SessionId::new(id);

    let session = state.session_manager.get_session(&session_id).await;
    let working_dir = match session {
        Some(s) => s
            .working_dir
            .unwrap_or_else(|| {
                dirs::home_dir()
                    .map(|h| h.to_string_lossy().to_string())
                    .unwrap_or_else(|| "/tmp".to_string())
            }),
        None => {
            return Json(DaemonResponse::Error {
                message: format!("Session not found: {}", session_id),
            });
        }
    };

    let path = std::path::Path::new(&working_dir);

    match crate::git_ops::restore_milestone(path, &body.oid) {
        Ok(()) => Json(DaemonResponse::Pong),
        Err(e) => Json(DaemonResponse::Error {
            message: e.to_string(),
        }),
    }
}

// ── Utility functions ──

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

async fn cleanup_stale_socket(socket_path: &Path) -> Result<(), ServerError> {
    if !socket_path.exists() {
        return Ok(());
    }

    match tokio::net::UnixStream::connect(socket_path).await {
        Ok(_) => {
            return Err(ServerError::AlreadyRunning(socket_path.to_path_buf()));
        }
        Err(_) => {
            tracing::warn!("Removing stale socket file: {}", socket_path.display());
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
