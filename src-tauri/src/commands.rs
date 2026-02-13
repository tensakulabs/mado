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
