use std::sync::Arc;

use tauri::State;
use tokio::sync::Mutex;

use serde::Serialize;

use kobo_core::client::DaemonClient;
use kobo_core::types::{DaemonStatus, Session};

/// Shared daemon state managed by Tauri.
pub struct DaemonState {
    pub client: Arc<Mutex<Option<DaemonClient>>>,
}

impl DaemonState {
    pub fn new() -> Self {
        Self {
            client: Arc::new(Mutex::new(None)),
        }
    }
}

/// Health check command -- returns daemon status.
#[tauri::command]
pub async fn health_check(
    state: State<'_, DaemonState>,
) -> Result<DaemonStatus, String> {
    let guard = state.client.lock().await;
    let client = guard
        .as_ref()
        .ok_or_else(|| "Not connected to daemon".to_string())?;

    client.health().await.map_err(|e| e.to_string())
}

/// Daemon status command -- returns "connected" or "disconnected".
#[tauri::command]
pub async fn daemon_status(
    state: State<'_, DaemonState>,
) -> Result<String, String> {
    let guard = state.client.lock().await;
    match guard.as_ref() {
        Some(client) => {
            if client.is_alive().await {
                Ok("connected".to_string())
            } else {
                Ok("disconnected".to_string())
            }
        }
        None => Ok("disconnected".to_string()),
    }
}

/// Reconnect to the daemon.
#[tauri::command]
pub async fn reconnect(
    state: State<'_, DaemonState>,
) -> Result<String, String> {
    let mut guard = state.client.lock().await;

    let socket_path = match guard.as_ref() {
        Some(client) => client.socket_path().to_path_buf(),
        None => kobo_core::client::default_socket_path(),
    };

    let client = DaemonClient::new(&socket_path);
    match client.connect().await {
        Ok(()) => {
            *guard = Some(client);
            Ok("connected".to_string())
        }
        Err(e) => Err(format!("Failed to reconnect: {}", e)),
    }
}

/// List all sessions.
#[tauri::command]
pub async fn list_sessions(
    state: State<'_, DaemonState>,
) -> Result<Vec<Session>, String> {
    let guard = state.client.lock().await;
    let client = guard
        .as_ref()
        .ok_or_else(|| "Not connected to daemon".to_string())?;

    client.list_sessions().await.map_err(|e| e.to_string())
}

/// Create a new session.
#[tauri::command]
pub async fn create_session(
    state: State<'_, DaemonState>,
    name: String,
    model: String,
    rows: u16,
    cols: u16,
) -> Result<Session, String> {
    let guard = state.client.lock().await;
    let client = guard
        .as_ref()
        .ok_or_else(|| "Not connected to daemon".to_string())?;

    client
        .create_session(&name, &model, rows, cols)
        .await
        .map_err(|e| e.to_string())
}

/// Destroy a session.
#[tauri::command]
pub async fn destroy_session(
    state: State<'_, DaemonState>,
    session_id: String,
) -> Result<(), String> {
    let guard = state.client.lock().await;
    let client = guard
        .as_ref()
        .ok_or_else(|| "Not connected to daemon".to_string())?;

    client
        .destroy_session(&session_id)
        .await
        .map_err(|e| e.to_string())
}

/// Write input to a session's PTY.
#[tauri::command]
pub async fn write_input(
    state: State<'_, DaemonState>,
    session_id: String,
    data: Vec<u8>,
) -> Result<(), String> {
    let guard = state.client.lock().await;
    let client = guard
        .as_ref()
        .ok_or_else(|| "Not connected to daemon".to_string())?;

    client
        .write_input(&session_id, &data)
        .await
        .map_err(|e| e.to_string())
}

/// Resize a session's PTY.
#[tauri::command]
pub async fn resize_session(
    state: State<'_, DaemonState>,
    session_id: String,
    rows: u16,
    cols: u16,
) -> Result<(), String> {
    let guard = state.client.lock().await;
    let client = guard
        .as_ref()
        .ok_or_else(|| "Not connected to daemon".to_string())?;

    client
        .resize_session(&session_id, rows, cols)
        .await
        .map_err(|e| e.to_string())
}

/// Available model info.
#[derive(Debug, Clone, Serialize)]
pub struct ModelInfo {
    pub id: String,
    pub name: String,
    pub description: String,
}

/// Check if an API key is configured.
#[tauri::command]
pub fn has_api_key() -> bool {
    kobo_daemon::keystore::KeyStore::has_api_key()
}

/// Set the Anthropic API key.
#[tauri::command]
pub fn set_api_key(key: String) -> Result<(), String> {
    kobo_daemon::keystore::KeyStore::set_api_key(&key).map_err(|e| e.to_string())
}

/// Delete the stored API key.
#[tauri::command]
pub fn delete_api_key() -> Result<(), String> {
    kobo_daemon::keystore::KeyStore::delete_api_key().map_err(|e| e.to_string())
}

// ── Versioning commands ──

/// Save a milestone for a session.
#[tauri::command]
pub async fn save_milestone(
    state: State<'_, DaemonState>,
    session_id: String,
    message: String,
) -> Result<kobo_core::types::Milestone, String> {
    let guard = state.client.lock().await;
    let client = guard
        .as_ref()
        .ok_or_else(|| "Not connected to daemon".to_string())?;

    client
        .save_milestone(&session_id, &message)
        .await
        .map_err(|e| e.to_string())
}

/// List milestones for a session.
#[tauri::command]
pub async fn list_milestones(
    state: State<'_, DaemonState>,
    session_id: String,
    limit: Option<usize>,
) -> Result<Vec<kobo_core::types::Milestone>, String> {
    let guard = state.client.lock().await;
    let client = guard
        .as_ref()
        .ok_or_else(|| "Not connected to daemon".to_string())?;

    client
        .list_milestones(&session_id, limit.unwrap_or(20))
        .await
        .map_err(|e| e.to_string())
}

/// Diff between two milestones.
#[tauri::command]
pub async fn diff_milestones(
    state: State<'_, DaemonState>,
    session_id: String,
    from_oid: String,
    to_oid: String,
) -> Result<kobo_core::types::DiffSummary, String> {
    let guard = state.client.lock().await;
    let client = guard
        .as_ref()
        .ok_or_else(|| "Not connected to daemon".to_string())?;

    client
        .diff_milestones(&session_id, &from_oid, &to_oid)
        .await
        .map_err(|e| e.to_string())
}

/// Restore to a milestone.
#[tauri::command]
pub async fn restore_milestone(
    state: State<'_, DaemonState>,
    session_id: String,
    oid: String,
) -> Result<(), String> {
    let guard = state.client.lock().await;
    let client = guard
        .as_ref()
        .ok_or_else(|| "Not connected to daemon".to_string())?;

    client
        .restore_milestone(&session_id, &oid)
        .await
        .map_err(|e| e.to_string())
}

/// Get current workspace changes for a session.
#[tauri::command]
pub async fn workspace_changes(
    state: State<'_, DaemonState>,
    session_id: String,
) -> Result<kobo_core::types::DiffSummary, String> {
    let guard = state.client.lock().await;
    let client = guard
        .as_ref()
        .ok_or_else(|| "Not connected to daemon".to_string())?;

    client
        .workspace_changes(&session_id)
        .await
        .map_err(|e| e.to_string())
}

/// List available AI models.
#[tauri::command]
pub fn list_models() -> Vec<ModelInfo> {
    vec![
        ModelInfo {
            id: "opus".to_string(),
            name: "Claude Opus".to_string(),
            description: "Most capable, best for complex tasks".to_string(),
        },
        ModelInfo {
            id: "sonnet".to_string(),
            name: "Claude Sonnet".to_string(),
            description: "Balanced performance and speed".to_string(),
        },
        ModelInfo {
            id: "haiku".to_string(),
            name: "Claude Haiku".to_string(),
            description: "Fastest, great for quick tasks".to_string(),
        },
    ]
}
