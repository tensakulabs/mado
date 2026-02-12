use std::sync::Arc;

use tauri::State;
use tokio::sync::Mutex;

use kobo_core::client::DaemonClient;
use kobo_core::types::DaemonStatus;

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

    // Try to connect using the existing client path, or default.
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
