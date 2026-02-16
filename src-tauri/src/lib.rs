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
        .plugin(tauri_plugin_dialog::init())
        .manage(DaemonState::new())
        .invoke_handler(tauri::generate_handler![
            commands::ping,
            commands::health_check,
            commands::daemon_status,
            commands::reconnect,
            commands::list_sessions,
            commands::create_session,
            commands::destroy_session,
            commands::write_input,
            commands::resize_session,
            bridge::attach_session,
            commands::list_models,
            commands::has_api_key,
            commands::set_api_key,
            commands::delete_api_key,
            commands::get_config,
            commands::update_config,
            commands::complete_setup,
            commands::is_setup_complete,
            commands::check_cli_auth,
            commands::check_cli_installed,
            commands::get_user_display_name,
            commands::save_milestone,
            commands::list_milestones,
            commands::diff_milestones,
            commands::restore_milestone,
            commands::workspace_changes,
            // Git staging commands.
            commands::git_status,
            commands::git_file_diff,
            commands::git_stage_file,
            commands::git_unstage_file,
            commands::git_stage_files,
            commands::git_unstage_files,
            commands::git_stage_hunk,
            commands::git_commit,
            commands::git_log,
            // Chat mode commands.
            commands::send_message,
            commands::get_messages,
            commands::cancel_response,
            commands::import_history,
            bridge::attach_chat_session,
        ])
        .setup(|app| {
            let state = app.state::<DaemonState>();
            let client_arc = state.client.clone();
            let app_handle = app.handle().clone();

            // Spawn daemon connection in background.
            tauri::async_runtime::spawn(async move {
                match lifecycle::ensure_daemon().await {
                    Ok(client) => {
                        let mut guard = client_arc.write().await;
                        *guard = Some(client);
                        drop(guard);
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
