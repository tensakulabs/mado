mod bridge;
mod commands;
mod lifecycle;

use commands::DaemonState;
use tauri::{Emitter, Manager};
use tracing;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    // Set up tracing for the Tauri app.
    tracing_subscriber::fmt()
        .with_env_filter(
            tracing_subscriber::EnvFilter::try_from_default_env()
                .unwrap_or_else(|_| tracing_subscriber::EnvFilter::new("info")),
        )
        .init();

    tracing::info!("Starting Kobo v{}", env!("CARGO_PKG_VERSION"));

    tauri::Builder::default()
        .plugin(tauri_plugin_shell::init())
        .manage(DaemonState::new())
        .invoke_handler(tauri::generate_handler![
            commands::health_check,
            commands::daemon_status,
            commands::reconnect,
            commands::list_sessions,
            commands::create_session,
            commands::destroy_session,
            commands::write_input,
            commands::resize_session,
            bridge::attach_session,
        ])
        .setup(|app| {
            let state = app.state::<DaemonState>();
            let client_arc = state.client.clone();
            let app_handle = app.handle().clone();

            // Spawn daemon connection in background.
            tauri::async_runtime::spawn(async move {
                match lifecycle::ensure_daemon().await {
                    Ok(client) => {
                        tracing::info!("Daemon connected successfully");
                        let mut guard = client_arc.lock().await;
                        *guard = Some(client);

                        // Emit success event to frontend.
                        let _ = app_handle.emit("daemon-connected", "connected");
                    }
                    Err(e) => {
                        tracing::error!("Failed to connect to daemon: {}", e);
                        let _ = app_handle.emit("daemon-error", e);
                    }
                }
            });

            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
