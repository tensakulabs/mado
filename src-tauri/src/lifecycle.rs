use std::path::PathBuf;

use kobo_core::client::{default_socket_path, DaemonClient};
use tracing;

/// Find the daemon binary path.
///
/// In development: look in the Cargo workspace target directory.
/// In production: look in the Tauri resource directory.
fn find_daemon_binary() -> Result<PathBuf, String> {
    // Development mode: look for the binary in the target directory.
    // The daemon binary is built as part of the workspace.
    let dev_path = std::env::current_exe()
        .ok()
        .and_then(|exe| exe.parent().map(|p| p.to_path_buf()))
        .map(|dir| dir.join("kobo-daemon"));

    if let Some(path) = dev_path {
        if path.exists() {
            tracing::info!("Found daemon binary (dev): {}", path.display());
            return Ok(path);
        }
    }

    // Try common development paths.
    let workspace_target = PathBuf::from(env!("CARGO_MANIFEST_DIR"))
        .parent()
        .unwrap()
        .join("target")
        .join("debug")
        .join("kobo-daemon");

    if workspace_target.exists() {
        tracing::info!("Found daemon binary (workspace): {}", workspace_target.display());
        return Ok(workspace_target);
    }

    Err("Could not find kobo-daemon binary".to_string())
}

/// Ensure the daemon is running and return a connected client.
///
/// Attempts to connect to an existing daemon. If none is found,
/// starts a new one.
pub async fn ensure_daemon(
) -> Result<DaemonClient, String> {
    let socket_path = default_socket_path();

    tracing::info!("Checking for daemon at {}", socket_path.display());

    // Try to connect to existing daemon first.
    let client = DaemonClient::new(&socket_path);
    if client.is_alive().await {
        tracing::info!("Connected to existing daemon");
        return Ok(client);
    }

    // No daemon running -- find and start one.
    let daemon_bin = find_daemon_binary()?;
    tracing::info!("Starting daemon from {}", daemon_bin.display());

    DaemonClient::ensure_daemon_running(&socket_path, &daemon_bin)
        .await
        .map_err(|e| format!("Failed to start daemon: {}", e))
}
