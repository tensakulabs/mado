use std::collections::HashMap;
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

use mado_core::protocol::DaemonResponse;
use mado_core::types::{DaemonStatus, PtySize, SessionId};

use crate::conversation::{ConversationManager, SharedConversationManager};
use crate::process::new_shared_process_manager;
use crate::session::{SessionManager, SharedSessionManager};
use crate::state::DaemonState;

/// Per-workspace mutex to serialize git operations.
/// Prevents index.lock conflicts when multiple panes share a working directory.
#[derive(Clone, Default)]
pub struct WorkspaceLocks {
    inner: Arc<Mutex<HashMap<PathBuf, Arc<Mutex<()>>>>>,
}

impl WorkspaceLocks {
    /// Acquire a lock for the given workspace path.
    /// Returns an owned guard — drop it when the git operation is done.
    pub async fn acquire(&self, path: &Path) -> tokio::sync::OwnedMutexGuard<()> {
        let mutex = {
            let mut map = self.inner.lock().await;
            map.entry(path.to_path_buf())
                .or_insert_with(|| Arc::new(Mutex::new(())))
                .clone()
        };
        mutex.lock_owned().await
    }
}

/// Shared state for the axum server.
#[derive(Clone)]
pub struct AppState {
    pub start_time: Instant,
    pub pid: u32,
    pub session_manager: SharedSessionManager,
    pub conversation_manager: SharedConversationManager,
    pub workspace_locks: WorkspaceLocks,
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
    /// Working directory for the session.
    #[serde(default)]
    pub cwd: Option<String>,
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

/// Request body for staging/unstaging a file.
#[derive(Debug, Deserialize)]
pub struct StageFileBody {
    pub file_path: String,
}

/// Request body for batch staging/unstaging multiple files.
#[derive(Debug, Deserialize)]
pub struct StageFilesBody {
    pub file_paths: Vec<String>,
}

/// Request body for staging a single hunk.
#[derive(Debug, Deserialize)]
pub struct StageHunkBody {
    pub file_path: String,
    pub hunk_index: usize,
}

/// Query params for file diff.
#[derive(Debug, Deserialize)]
pub struct FileDiffQuery {
    pub file_path: String,
    #[serde(default)]
    pub staged: Option<bool>,
}

/// Request body for sending a message (chat mode).
#[derive(Debug, Deserialize)]
pub struct SendMessageBody {
    pub content: String,
    #[serde(default)]
    pub model: Option<String>,
}

/// Query params for getting messages.
#[derive(Debug, Deserialize)]
pub struct GetMessagesQuery {
    #[serde(default)]
    pub limit: Option<usize>,
    #[serde(default)]
    pub before_id: Option<String>,
}

/// Start the daemon's HTTP server on a Unix domain socket.
pub async fn start_server(
    socket_path: PathBuf,
    state_path: PathBuf,
    daemon_state: Arc<Mutex<DaemonState>>,
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

    let state = create_app_state(daemon_state, state_path);
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
fn create_app_state(daemon_state: Arc<Mutex<DaemonState>>, state_path: PathBuf) -> AppState {
    let process_manager = new_shared_process_manager();
    let session_manager = Arc::new(SessionManager::new(daemon_state.clone(), process_manager));

    // Create conversation manager with storage in ~/.mado/conversations/.
    let storage_dir = dirs::home_dir()
        .map(|h| h.join(".mado").join("conversations"))
        .unwrap_or_else(|| std::path::PathBuf::from("/tmp/mado/conversations"));
    let conversation_manager = Arc::new(ConversationManager::new(storage_dir, daemon_state, state_path));

    AppState {
        start_time: Instant::now(),
        pid: std::process::id(),
        session_manager,
        conversation_manager,
        workspace_locks: WorkspaceLocks::default(),
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
        // Session I/O (PTY mode -- legacy).
        .route("/sessions/{id}/input", post(input_handler))
        .route("/sessions/{id}/resize", post(resize_handler))
        .route("/sessions/{id}/output", get(output_handler))
        // Chat mode (new).
        .route("/sessions/{id}/messages", get(get_messages_handler).post(send_message_handler))
        .route("/sessions/{id}/messages/current", axum::routing::delete(cancel_response_handler))
        .route("/sessions/{id}/stream", get(stream_events_handler))
        .route("/sessions/{id}/history", get(import_history_handler))
        // Versioning.
        .route("/sessions/{id}/save", post(save_milestone_handler))
        .route("/sessions/{id}/milestones", get(list_milestones_handler))
        .route("/sessions/{id}/diff", get(diff_milestones_handler))
        .route("/sessions/{id}/restore", post(restore_milestone_handler))
        // Change indicators.
        .route("/sessions/{id}/changes", get(workspace_changes_handler))
        // Git staging operations.
        .route("/sessions/{id}/git/status", get(git_status_handler))
        .route("/sessions/{id}/git/diff", get(git_file_diff_handler))
        .route("/sessions/{id}/git/stage", post(git_stage_file_handler))
        .route("/sessions/{id}/git/unstage", post(git_unstage_file_handler))
        .route("/sessions/{id}/git/stage-files", post(git_stage_files_handler))
        .route("/sessions/{id}/git/unstage-files", post(git_unstage_files_handler))
        .route("/sessions/{id}/git/stage-hunk", post(git_stage_hunk_handler))
        .route("/sessions/{id}/git/branch-info", get(git_branch_info_handler))
        .route("/sessions/{id}/git/push", post(git_push_handler))
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
        .create_session(body.name, body.model, pty_size, body.cwd)
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

// ── Chat mode endpoints ──

async fn send_message_handler(
    State(state): State<AppState>,
    AxumPath(id): AxumPath<String>,
    Json(body): Json<SendMessageBody>,
) -> Json<DaemonResponse> {
    let session_id = SessionId::new(id.clone());

    // Ensure conversation is initialized for this session.
    let session = state.session_manager.get_session(&session_id).await;
    if let Some(ref s) = session {
        // Pass the stored claude_session_id so conversations can be resumed.
        state
            .conversation_manager
            .init_session(&session_id, &s.model, s.working_dir.clone(), s.claude_session_id.clone())
            .await;
    } else {
        return Json(DaemonResponse::Error {
            message: format!("Session not found: {}", id),
        });
    }

    match state
        .conversation_manager
        .send_message(&session_id, body.content, body.model)
        .await
    {
        Ok(message_id) => Json(DaemonResponse::MessageAccepted { message_id }),
        Err(e) => Json(DaemonResponse::Error {
            message: e.to_string(),
        }),
    }
}

async fn get_messages_handler(
    State(state): State<AppState>,
    AxumPath(id): AxumPath<String>,
    axum::extract::Query(params): axum::extract::Query<GetMessagesQuery>,
) -> Json<DaemonResponse> {
    let session_id = SessionId::new(id.clone());

    // Ensure conversation is initialized for this session.
    let session = state.session_manager.get_session(&session_id).await;
    if let Some(ref s) = session {
        // Pass the stored claude_session_id so conversations can be resumed.
        state
            .conversation_manager
            .init_session(&session_id, &s.model, s.working_dir.clone(), s.claude_session_id.clone())
            .await;
    } else {
        return Json(DaemonResponse::Error {
            message: format!("Session not found: {}", id),
        });
    }

    match state
        .conversation_manager
        .get_messages(&session_id, params.limit, params.before_id)
        .await
    {
        Ok(messages) => Json(DaemonResponse::Messages { messages }),
        Err(e) => Json(DaemonResponse::Error {
            message: e.to_string(),
        }),
    }
}

async fn cancel_response_handler(
    State(state): State<AppState>,
    AxumPath(id): AxumPath<String>,
) -> Json<DaemonResponse> {
    let session_id = SessionId::new(id);

    match state.conversation_manager.cancel_response(&session_id).await {
        Ok(()) => Json(DaemonResponse::CancelAccepted),
        Err(e) => Json(DaemonResponse::Error {
            message: e.to_string(),
        }),
    }
}

async fn stream_events_handler(
    State(state): State<AppState>,
    AxumPath(id): AxumPath<String>,
) -> Sse<std::pin::Pin<Box<dyn Stream<Item = Result<Event, Infallible>> + Send>>> {
    let session_id = SessionId::new(id);

    let rx = state.conversation_manager.subscribe(&session_id).await;

    let stream = BroadcastStream::new(rx).filter_map(|result| match result {
        Ok(event) => {
            let json = serde_json::to_string(&event).unwrap_or_default();
            Some(Ok(Event::default().data(json).event("message")))
        }
        Err(_) => None, // Lagged receiver, skip
    });

    // Prepend a "connected" event.
    let started = futures::stream::once(async {
        Ok(Event::default().data("connected").event("connected"))
    });

    Sse::new(Box::pin(started.chain(stream)))
}

/// Query params for importing history.
#[derive(Debug, Deserialize)]
pub struct ImportHistoryQuery {
    #[serde(default)]
    pub limit: Option<usize>,
    #[serde(default)]
    pub all_sessions: Option<bool>,
}

async fn import_history_handler(
    State(state): State<AppState>,
    AxumPath(id): AxumPath<String>,
    axum::extract::Query(params): axum::extract::Query<ImportHistoryQuery>,
) -> Json<DaemonResponse> {
    let session_id = SessionId::new(id.clone());

    // Get session's working directory.
    let session = state.session_manager.get_session(&session_id).await;
    let working_dir = match session {
        Some(s) => s.working_dir.unwrap_or_else(|| {
            dirs::home_dir()
                .map(|h| h.to_string_lossy().to_string())
                .unwrap_or_else(|| "/tmp".to_string())
        }),
        None => {
            return Json(DaemonResponse::Error {
                message: format!("Session not found: {}", id),
            });
        }
    };

    let path = std::path::Path::new(&working_dir);

    let result = if params.all_sessions.unwrap_or(false) {
        crate::claude_history::import_all_history(path, params.limit)
    } else {
        crate::claude_history::import_history(path, params.limit)
    };

    match result {
        Ok(messages) => Json(DaemonResponse::Messages { messages }),
        Err(e) => Json(DaemonResponse::Error {
            message: e.to_string(),
        }),
    }
}

// ── Versioning endpoints ──

async fn save_milestone_handler(
    State(state): State<AppState>,
    AxumPath(id): AxumPath<String>,
    Json(body): Json<SaveMilestoneBody>,
) -> Json<DaemonResponse> {
    let session_id = mado_core::types::SessionId::new(id);

    let working_dir = match resolve_working_dir(&state, &session_id).await {
        Ok(wd) => wd,
        Err(resp) => return resp,
    };

    let path = std::path::Path::new(&working_dir);
    let _lock = state.workspace_locks.acquire(path).await;

    // Ensure git repo exists.
    if let Err(e) = crate::git_ops::init_repo(path) {
        return Json(DaemonResponse::Error {
            message: format!("Failed to init git repo: {}", e),
        });
    }

    match crate::git_ops::save_milestone(path, &body.message) {
        Ok(milestone) => {
            let core_milestone = mado_core::types::Milestone {
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
    let session_id = mado_core::types::SessionId::new(id);
    let limit = params
        .get("limit")
        .and_then(|l| l.parse().ok())
        .unwrap_or(20usize);

    let working_dir = match resolve_working_dir(&state, &session_id).await {
        Ok(wd) => wd,
        Err(resp) => return resp,
    };

    let path = std::path::Path::new(&working_dir);
    let _lock = state.workspace_locks.acquire(path).await;

    match crate::git_ops::list_milestones(path, limit) {
        Ok(milestones) => {
            let core_milestones: Vec<mado_core::types::Milestone> = milestones
                .into_iter()
                .map(|m| mado_core::types::Milestone {
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
    let session_id = mado_core::types::SessionId::new(id);

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

    let working_dir = match resolve_working_dir(&state, &session_id).await {
        Ok(wd) => wd,
        Err(resp) => return resp,
    };

    let path = std::path::Path::new(&working_dir);
    let _lock = state.workspace_locks.acquire(path).await;

    match crate::git_ops::diff_milestones(path, &from_oid, &to_oid) {
        Ok(diff) => {
            let core_diff = mado_core::types::DiffSummary {
                files: diff
                    .files
                    .into_iter()
                    .map(|f| mado_core::types::FileDiff {
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
    let session_id = mado_core::types::SessionId::new(id);

    let working_dir = match resolve_working_dir(&state, &session_id).await {
        Ok(wd) => wd,
        Err(resp) => return resp,
    };

    let path = std::path::Path::new(&working_dir);
    let _lock = state.workspace_locks.acquire(path).await;

    match crate::git_ops::restore_milestone(path, &body.oid) {
        Ok(()) => Json(DaemonResponse::Pong),
        Err(e) => Json(DaemonResponse::Error {
            message: e.to_string(),
        }),
    }
}

// ── Change indicator endpoint ──

async fn workspace_changes_handler(
    State(state): State<AppState>,
    AxumPath(id): AxumPath<String>,
) -> Json<DaemonResponse> {
    let session_id = mado_core::types::SessionId::new(id);

    let working_dir = match resolve_working_dir(&state, &session_id).await {
        Ok(wd) => wd,
        Err(resp) => return resp,
    };

    let path = std::path::Path::new(&working_dir);
    let _lock = state.workspace_locks.acquire(path).await;

    // Ensure git repo exists before querying changes.
    if let Err(e) = crate::git_ops::init_repo(path) {
        return Json(DaemonResponse::Error {
            message: format!("Failed to init git repo: {}", e),
        });
    }

    match crate::git_ops::workspace_changes(path) {
        Ok(diff) => {
            let core_diff = mado_core::types::DiffSummary {
                files: diff
                    .files
                    .into_iter()
                    .map(|f| mado_core::types::FileDiff {
                        path: f.path,
                        insertions: f.insertions,
                        deletions: f.deletions,
                        status: f.status,
                    })
                    .collect(),
                total_insertions: diff.total_insertions,
                total_deletions: diff.total_deletions,
            };
            Json(DaemonResponse::WorkspaceChanges { changes: core_diff })
        }
        Err(e) => Json(DaemonResponse::Error {
            message: e.to_string(),
        }),
    }
}

// ── Git staging endpoints ──

async fn git_status_handler(
    State(state): State<AppState>,
    AxumPath(id): AxumPath<String>,
) -> Json<DaemonResponse> {
    let session_id = mado_core::types::SessionId::new(id);

    let working_dir = match resolve_working_dir(&state, &session_id).await {
        Ok(wd) => wd,
        Err(resp) => return resp,
    };

    let path = std::path::Path::new(&working_dir);
    let _lock = state.workspace_locks.acquire(path).await;

    // Ensure git repo exists.
    if let Err(e) = crate::git_ops::init_repo(path) {
        return Json(DaemonResponse::Error {
            message: format!("Failed to init git repo: {}", e),
        });
    }

    match crate::git_ops::git_status(path) {
        Ok(status) => {
            let core_status = mado_core::types::GitStatus {
                staged: status
                    .staged
                    .into_iter()
                    .map(|f| mado_core::types::FileDiff {
                        path: f.path,
                        insertions: f.insertions,
                        deletions: f.deletions,
                        status: f.status,
                    })
                    .collect(),
                unstaged: status
                    .unstaged
                    .into_iter()
                    .map(|f| mado_core::types::FileDiff {
                        path: f.path,
                        insertions: f.insertions,
                        deletions: f.deletions,
                        status: f.status,
                    })
                    .collect(),
            };
            Json(DaemonResponse::GitStatusResult {
                status: core_status,
            })
        }
        Err(e) => Json(DaemonResponse::Error {
            message: e.to_string(),
        }),
    }
}

async fn git_file_diff_handler(
    State(state): State<AppState>,
    AxumPath(id): AxumPath<String>,
    axum::extract::Query(params): axum::extract::Query<FileDiffQuery>,
) -> Json<DaemonResponse> {
    let session_id = mado_core::types::SessionId::new(id);

    let working_dir = match resolve_working_dir(&state, &session_id).await {
        Ok(wd) => wd,
        Err(resp) => return resp,
    };

    let path = std::path::Path::new(&working_dir);
    let _lock = state.workspace_locks.acquire(path).await;
    let is_staged = params.staged.unwrap_or(false);

    match crate::git_ops::git_file_diff(path, &params.file_path, is_staged) {
        Ok(diff) => Json(DaemonResponse::FileDiffContent { diff }),
        Err(e) => Json(DaemonResponse::Error {
            message: e.to_string(),
        }),
    }
}

async fn git_stage_file_handler(
    State(state): State<AppState>,
    AxumPath(id): AxumPath<String>,
    Json(body): Json<StageFileBody>,
) -> Json<DaemonResponse> {
    let session_id = mado_core::types::SessionId::new(id);

    let working_dir = match resolve_working_dir(&state, &session_id).await {
        Ok(wd) => wd,
        Err(resp) => return resp,
    };

    let path = std::path::Path::new(&working_dir);
    let _lock = state.workspace_locks.acquire(path).await;

    // Ensure git repo exists.
    if let Err(e) = crate::git_ops::init_repo(path) {
        return Json(DaemonResponse::Error {
            message: format!("Failed to init git repo: {}", e),
        });
    }

    match crate::git_ops::git_stage_file(path, &body.file_path) {
        Ok(()) => Json(DaemonResponse::Pong),
        Err(e) => Json(DaemonResponse::Error {
            message: e.to_string(),
        }),
    }
}

async fn git_unstage_file_handler(
    State(state): State<AppState>,
    AxumPath(id): AxumPath<String>,
    Json(body): Json<StageFileBody>,
) -> Json<DaemonResponse> {
    let session_id = mado_core::types::SessionId::new(id);

    let working_dir = match resolve_working_dir(&state, &session_id).await {
        Ok(wd) => wd,
        Err(resp) => return resp,
    };

    let path = std::path::Path::new(&working_dir);
    let _lock = state.workspace_locks.acquire(path).await;

    match crate::git_ops::git_unstage_file(path, &body.file_path) {
        Ok(()) => Json(DaemonResponse::Pong),
        Err(e) => Json(DaemonResponse::Error {
            message: e.to_string(),
        }),
    }
}

async fn git_stage_files_handler(
    State(state): State<AppState>,
    AxumPath(id): AxumPath<String>,
    Json(body): Json<StageFilesBody>,
) -> Json<DaemonResponse> {
    let session_id = mado_core::types::SessionId::new(id);

    let working_dir = match resolve_working_dir(&state, &session_id).await {
        Ok(wd) => wd,
        Err(resp) => return resp,
    };

    let path = std::path::Path::new(&working_dir);
    let _lock = state.workspace_locks.acquire(path).await;

    // Ensure git repo exists.
    if let Err(e) = crate::git_ops::init_repo(path) {
        return Json(DaemonResponse::Error {
            message: format!("Failed to init git repo: {}", e),
        });
    }

    match crate::git_ops::git_stage_files(path, &body.file_paths) {
        Ok(()) => Json(DaemonResponse::Pong),
        Err(e) => Json(DaemonResponse::Error {
            message: e.to_string(),
        }),
    }
}

async fn git_unstage_files_handler(
    State(state): State<AppState>,
    AxumPath(id): AxumPath<String>,
    Json(body): Json<StageFilesBody>,
) -> Json<DaemonResponse> {
    let session_id = mado_core::types::SessionId::new(id);

    let working_dir = match resolve_working_dir(&state, &session_id).await {
        Ok(wd) => wd,
        Err(resp) => return resp,
    };

    let path = std::path::Path::new(&working_dir);
    let _lock = state.workspace_locks.acquire(path).await;

    match crate::git_ops::git_unstage_files(path, &body.file_paths) {
        Ok(()) => Json(DaemonResponse::Pong),
        Err(e) => Json(DaemonResponse::Error {
            message: e.to_string(),
        }),
    }
}

async fn git_stage_hunk_handler(
    State(state): State<AppState>,
    AxumPath(id): AxumPath<String>,
    Json(body): Json<StageHunkBody>,
) -> Json<DaemonResponse> {
    let session_id = mado_core::types::SessionId::new(id);

    let working_dir = match resolve_working_dir(&state, &session_id).await {
        Ok(wd) => wd,
        Err(resp) => return resp,
    };

    let path = std::path::Path::new(&working_dir);
    let _lock = state.workspace_locks.acquire(path).await;

    // Ensure git repo exists.
    if let Err(e) = crate::git_ops::init_repo(path) {
        return Json(DaemonResponse::Error {
            message: format!("Failed to init git repo: {}", e),
        });
    }

    match crate::git_ops::git_stage_hunk(path, &body.file_path, body.hunk_index) {
        Ok(()) => Json(DaemonResponse::Pong),
        Err(e) => Json(DaemonResponse::Error {
            message: e.to_string(),
        }),
    }
}

// ── Git branch & push endpoints ──

async fn git_branch_info_handler(
    State(state): State<AppState>,
    AxumPath(id): AxumPath<String>,
) -> Json<DaemonResponse> {
    let session_id = mado_core::types::SessionId::new(id);

    let working_dir = match resolve_working_dir(&state, &session_id).await {
        Ok(wd) => wd,
        Err(resp) => return resp,
    };

    let path = std::path::Path::new(&working_dir);
    let _lock = state.workspace_locks.acquire(path).await;

    if let Err(e) = crate::git_ops::init_repo(path) {
        return Json(DaemonResponse::Error {
            message: format!("Failed to init git repo: {}", e),
        });
    }

    match crate::git_ops::git_branch_info(path) {
        Ok(info) => Json(DaemonResponse::GitBranchInfo {
            info: mado_core::types::BranchInfo {
                branch: info.branch,
                has_remote: info.has_remote,
            },
        }),
        Err(e) => Json(DaemonResponse::Error {
            message: e.to_string(),
        }),
    }
}

async fn git_push_handler(
    State(state): State<AppState>,
    AxumPath(id): AxumPath<String>,
) -> Json<DaemonResponse> {
    let session_id = mado_core::types::SessionId::new(id);

    let working_dir = match resolve_working_dir(&state, &session_id).await {
        Ok(wd) => wd,
        Err(resp) => return resp,
    };

    let path = std::path::Path::new(&working_dir);
    let _lock = state.workspace_locks.acquire(path).await;

    match crate::git_ops::git_push(path) {
        Ok(()) => Json(DaemonResponse::GitPushResult),
        Err(e) => Json(DaemonResponse::Error {
            message: e.to_string(),
        }),
    }
}

/// Resolve the working directory for a session, returning an error response if not found.
async fn resolve_working_dir(
    state: &AppState,
    session_id: &mado_core::types::SessionId,
) -> Result<String, Json<DaemonResponse>> {
    let session = state.session_manager.get_session(session_id).await;
    match session {
        Some(s) => Ok(s.working_dir.unwrap_or_else(|| {
            dirs::home_dir()
                .map(|h| h.to_string_lossy().to_string())
                .unwrap_or_else(|| "/tmp".to_string())
        })),
        None => Err(Json(DaemonResponse::Error {
            message: format!("Session not found: {}", session_id),
        })),
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
