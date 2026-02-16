use std::path::PathBuf;

use kobo_core::client::{default_socket_path, DaemonClient};
use tracing;

/// Find the daemon binary path.
///
/// In development: look in the Cargo workspace target directory.
/// In production: look in the Tauri resource directory or next to the app.
fn find_daemon_binary() -> Result<PathBuf, String> {
    // Development mode: look for the binary next to the executable.
    let dev_path = std::env::current_exe()
        .ok()
        .and_then(|exe| exe.parent().map(|p| p.to_path_buf()))
        .map(|dir| dir.join("kobo-daemon"));

    if let Some(path) = dev_path {
        if path.exists() {
            tracing::info!("Found daemon binary (exe dir): {}", path.display());
            return Ok(path);
        }
    }

    // Try workspace release path first (more common).
    let workspace_root = PathBuf::from(env!("CARGO_MANIFEST_DIR"))
        .parent()
        .unwrap()
        .to_path_buf();

    let release_path = workspace_root.join("target").join("release").join("kobo-daemon");
    if release_path.exists() {
        tracing::info!("Found daemon binary (release): {}", release_path.display());
        return Ok(release_path);
    }

    // Try debug path as fallback.
    let debug_path = workspace_root.join("target").join("debug").join("kobo-daemon");
    if debug_path.exists() {
        tracing::info!("Found daemon binary (debug): {}", debug_path.display());
        return Ok(debug_path);
    }

    Err(format!(
        "Could not find kobo-daemon binary. Checked:\n  - {}\n  - {}",
        release_path.display(),
        debug_path.display()
    ))
}

/// Ensure the daemon is running and return a connected client.
///
/// Attempts to connect to an existing daemon. If none is found,
/// starts a new one. Retries on failure.
pub async fn ensure_daemon() -> Result<DaemonClient, String> {
    let socket_path = default_socket_path();
    let max_retries = 3;
    let mut last_error = String::new();

    for attempt in 1..=max_retries {
        tracing::info!("Connecting to daemon (attempt {}/{})", attempt, max_retries);

        // Try to connect to existing daemon first.
        let client = DaemonClient::new(&socket_path);
        if client.is_alive().await {
            tracing::info!("Connected to existing daemon");
            return Ok(client);
        }

        // No daemon running -- find and start one.
        let daemon_bin = match find_daemon_binary() {
            Ok(bin) => bin,
            Err(e) => {
                last_error = e;
                continue;
            }
        };

        tracing::info!("Starting daemon from {}", daemon_bin.display());

        match DaemonClient::ensure_daemon_running(&socket_path, &daemon_bin).await {
            Ok(client) => return Ok(client),
            Err(e) => {
                last_error = format!("{}", e);
                tracing::warn!("Attempt {} failed: {}", attempt, last_error);

                // Brief delay before retry.
                tokio::time::sleep(tokio::time::Duration::from_millis(500)).await;
            }
        }
    }

    Err(format!("Failed to start daemon after {} attempts: {}", max_retries, last_error))
}

/// Try to reconnect to the daemon. Called when connection is lost.
pub async fn reconnect_daemon() -> Result<DaemonClient, String> {
    tracing::info!("Attempting to reconnect to daemon...");
    ensure_daemon().await
}
