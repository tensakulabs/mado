use std::sync::Arc;

use tauri::State;
use tokio::sync::RwLock;

use serde::Serialize;

use mado_core::client::DaemonClient;
use mado_core::types::{DaemonStatus, Message, Session};

/// Shared daemon state managed by Tauri.
/// Uses RwLock instead of Mutex to allow concurrent read access.
/// Only the setup task needs write access to initialize the client.
pub struct DaemonState {
    pub client: Arc<RwLock<Option<DaemonClient>>>,
}

impl DaemonState {
    pub fn new() -> Self {
        Self {
            client: Arc::new(RwLock::new(None)),
        }
    }
}

/// Health check command -- returns daemon status.
#[tauri::command]
pub async fn health_check(
    state: State<'_, DaemonState>,
) -> Result<DaemonStatus, String> {
    let guard = state.client.read().await;
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
    let guard = state.client.read().await;
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

/// Reconnect to the daemon. Will attempt to start daemon if not running.
#[tauri::command]
pub async fn reconnect(
    state: State<'_, DaemonState>,
) -> Result<String, String> {
    let mut guard = state.client.write().await;

    // Use ensure_daemon which will start the daemon if needed.
    match crate::lifecycle::ensure_daemon().await {
        Ok(client) => {
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
    let guard = state.client.read().await;
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
    cwd: Option<String>,
) -> Result<Session, String> {
    let guard = state.client.read().await;
    let client = guard
        .as_ref()
        .ok_or_else(|| "Not connected to daemon".to_string())?;

    client
        .create_session(&name, &model, rows, cols, cwd.as_deref())
        .await
        .map_err(|e| e.to_string())
}

/// Destroy a session.
#[tauri::command]
pub async fn destroy_session(
    state: State<'_, DaemonState>,
    session_id: String,
) -> Result<(), String> {
    let guard = state.client.read().await;
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
    let guard = state.client.read().await;
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
    let guard = state.client.read().await;
    let client = guard
        .as_ref()
        .ok_or_else(|| "Not connected to daemon".to_string())?;

    client
        .resize_session(&session_id, rows, cols)
        .await
        .map_err(|e| e.to_string())
}

/// Simple sync ping command to test IPC.
#[tauri::command]
pub fn ping() -> String {
    tracing::info!("[ping] Called!");
    "pong".to_string()
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
    let result = mado_daemon::keystore::KeyStore::has_api_key();
    tracing::info!("[has_api_key] Result: {}", result);
    result
}

/// Set the Anthropic API key.
#[tauri::command]
pub fn set_api_key(key: String) -> Result<(), String> {
    mado_daemon::keystore::KeyStore::set_api_key(&key).map_err(|e| e.to_string())
}

/// Delete the stored API key.
#[tauri::command]
pub fn delete_api_key() -> Result<(), String> {
    mado_daemon::keystore::KeyStore::delete_api_key().map_err(|e| e.to_string())
}

// ── Config commands ──

/// Get the current Kobo configuration.
#[tauri::command]
pub fn get_config() -> Result<mado_daemon::config::KoboConfig, String> {
    mado_daemon::config::KoboConfig::load().map_err(|e| e.to_string())
}

/// Update Kobo configuration.
#[tauri::command]
pub fn update_config(config: mado_daemon::config::KoboConfig) -> Result<(), String> {
    config.save().map_err(|e| e.to_string())
}

/// Mark setup as complete in config.
#[tauri::command]
pub fn complete_setup() -> Result<(), String> {
    let mut config = mado_daemon::config::KoboConfig::load().map_err(|e| e.to_string())?;
    config.setup_complete = true;
    config.save().map_err(|e| e.to_string())
}

/// Check if setup has been completed.
#[tauri::command]
pub fn is_setup_complete() -> Result<bool, String> {
    let config = mado_daemon::config::KoboConfig::load().map_err(|e| e.to_string())?;
    Ok(config.setup_complete)
}

/// Check if Claude CLI is authenticated (subscription login).
/// Returns true if ~/.claude/.credentials.json exists.
#[tauri::command]
pub fn check_cli_auth() -> bool {
    let home = dirs::home_dir().expect("Could not determine home directory");
    let credentials_path = home.join(".claude").join(".credentials.json");
    let exists = credentials_path.exists();
    tracing::info!("[check_cli_auth] Credentials at {:?}: {}", credentials_path, exists);
    exists
}

/// Get the current user's display name from the system.
#[tauri::command]
pub fn get_user_display_name() -> String {
    // Try to get the full name from the system
    #[cfg(target_os = "macos")]
    {
        use std::process::Command;
        // On macOS, use `id -F` to get full name
        if let Ok(output) = Command::new("id").arg("-F").output() {
            if output.status.success() {
                let name = String::from_utf8_lossy(&output.stdout).trim().to_string();
                if !name.is_empty() {
                    return name;
                }
            }
        }
    }

    // Fallback to username
    std::env::var("USER")
        .or_else(|_| std::env::var("USERNAME"))
        .unwrap_or_else(|_| "User".to_string())
}

/// Check if Claude CLI is installed.
/// Returns the path if found, None if not installed.
#[tauri::command]
pub fn check_cli_installed() -> Option<String> {
    use std::process::Command;

    // Try `which claude` on Unix
    let output = Command::new("which")
        .arg("claude")
        .output();

    match output {
        Ok(result) if result.status.success() => {
            let path = String::from_utf8_lossy(&result.stdout).trim().to_string();
            tracing::info!("[check_cli_installed] Found at: {}", path);
            Some(path)
        }
        _ => {
            tracing::info!("[check_cli_installed] Claude CLI not found");
            None
        }
    }
}

// ── Versioning commands ──

/// Save a milestone for a session.
#[tauri::command]
pub async fn save_milestone(
    state: State<'_, DaemonState>,
    session_id: String,
    message: String,
) -> Result<mado_core::types::Milestone, String> {
    let guard = state.client.read().await;
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
) -> Result<Vec<mado_core::types::Milestone>, String> {
    let guard = state.client.read().await;
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
) -> Result<mado_core::types::DiffSummary, String> {
    let guard = state.client.read().await;
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
    let guard = state.client.read().await;
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
) -> Result<mado_core::types::DiffSummary, String> {
    let guard = state.client.read().await;
    let client = guard
        .as_ref()
        .ok_or_else(|| "Not connected to daemon".to_string())?;

    client
        .workspace_changes(&session_id)
        .await
        .map_err(|e| e.to_string())
}

// ── Git staging commands ──

/// Get git staging status (staged + unstaged files).
#[tauri::command]
pub async fn git_status(
    state: State<'_, DaemonState>,
    session_id: String,
) -> Result<mado_core::types::GitStatus, String> {
    let guard = state.client.read().await;
    let client = guard
        .as_ref()
        .ok_or_else(|| "Not connected to daemon".to_string())?;

    client
        .git_status(&session_id)
        .await
        .map_err(|e| e.to_string())
}

/// Get unified diff content for a single file.
#[tauri::command]
pub async fn git_file_diff(
    state: State<'_, DaemonState>,
    session_id: String,
    file_path: String,
    staged: bool,
) -> Result<String, String> {
    let guard = state.client.read().await;
    let client = guard
        .as_ref()
        .ok_or_else(|| "Not connected to daemon".to_string())?;

    client
        .git_file_diff(&session_id, &file_path, staged)
        .await
        .map_err(|e| e.to_string())
}

/// Stage a single file.
#[tauri::command]
pub async fn git_stage_file(
    state: State<'_, DaemonState>,
    session_id: String,
    file_path: String,
) -> Result<(), String> {
    let guard = state.client.read().await;
    let client = guard
        .as_ref()
        .ok_or_else(|| "Not connected to daemon".to_string())?;

    client
        .git_stage_file(&session_id, &file_path)
        .await
        .map_err(|e| e.to_string())
}

/// Unstage a single file.
#[tauri::command]
pub async fn git_unstage_file(
    state: State<'_, DaemonState>,
    session_id: String,
    file_path: String,
) -> Result<(), String> {
    let guard = state.client.read().await;
    let client = guard
        .as_ref()
        .ok_or_else(|| "Not connected to daemon".to_string())?;

    client
        .git_unstage_file(&session_id, &file_path)
        .await
        .map_err(|e| e.to_string())
}

/// Stage multiple files in a single batch operation.
#[tauri::command]
pub async fn git_stage_files(
    state: State<'_, DaemonState>,
    session_id: String,
    file_paths: Vec<String>,
) -> Result<(), String> {
    let guard = state.client.read().await;
    let client = guard
        .as_ref()
        .ok_or_else(|| "Not connected to daemon".to_string())?;

    client
        .git_stage_files(&session_id, &file_paths)
        .await
        .map_err(|e| e.to_string())
}

/// Unstage multiple files in a single batch operation.
#[tauri::command]
pub async fn git_unstage_files(
    state: State<'_, DaemonState>,
    session_id: String,
    file_paths: Vec<String>,
) -> Result<(), String> {
    let guard = state.client.read().await;
    let client = guard
        .as_ref()
        .ok_or_else(|| "Not connected to daemon".to_string())?;

    client
        .git_unstage_files(&session_id, &file_paths)
        .await
        .map_err(|e| e.to_string())
}

/// Stage a single hunk from a file.
#[tauri::command]
pub async fn git_stage_hunk(
    state: State<'_, DaemonState>,
    session_id: String,
    file_path: String,
    hunk_index: usize,
) -> Result<(), String> {
    let guard = state.client.read().await;
    let client = guard
        .as_ref()
        .ok_or_else(|| "Not connected to daemon".to_string())?;

    client
        .git_stage_hunk(&session_id, &file_path, hunk_index)
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

// ── Chat mode commands ──

/// Send a message to a session (chat mode).
#[tauri::command]
pub async fn send_message(
    state: State<'_, DaemonState>,
    session_id: String,
    content: String,
    model: Option<String>,
) -> Result<String, String> {
    let guard = state.client.read().await;
    let client = guard
        .as_ref()
        .ok_or_else(|| "Not connected to daemon".to_string())?;

    client
        .send_message(&session_id, &content, model.as_deref())
        .await
        .map_err(|e| e.to_string())
}

/// Get messages from a session (chat mode).
#[tauri::command]
pub async fn get_messages(
    state: State<'_, DaemonState>,
    session_id: String,
    limit: Option<usize>,
    before_id: Option<String>,
) -> Result<Vec<Message>, String> {
    let guard = state.client.read().await;
    let client = guard
        .as_ref()
        .ok_or_else(|| "Not connected to daemon".to_string())?;

    client
        .get_messages(&session_id, limit, before_id.as_deref())
        .await
        .map_err(|e| e.to_string())
}

/// Cancel an in-progress response (chat mode).
#[tauri::command]
pub async fn cancel_response(
    state: State<'_, DaemonState>,
    session_id: String,
) -> Result<(), String> {
    let guard = state.client.read().await;
    let client = guard
        .as_ref()
        .ok_or_else(|| "Not connected to daemon".to_string())?;

    client
        .cancel_response(&session_id)
        .await
        .map_err(|e| e.to_string())
}

/// Import Claude CLI history for a session's working directory.
#[tauri::command]
pub async fn import_history(
    state: State<'_, DaemonState>,
    session_id: String,
    limit: Option<usize>,
    all_sessions: Option<bool>,
) -> Result<Vec<Message>, String> {
    let guard = state.client.read().await;
    let client = guard
        .as_ref()
        .ok_or_else(|| "Not connected to daemon".to_string())?;

    client
        .import_history(&session_id, limit, all_sessions)
        .await
        .map_err(|e| e.to_string())
}
