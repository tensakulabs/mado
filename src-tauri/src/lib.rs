mod bridge;
mod commands;
mod lifecycle;

use commands::DaemonState;
use tauri::menu::{MenuBuilder, MenuItem, SubmenuBuilder};
use tauri::{Emitter, Manager};
use tracing;

fn build_menu(app: &tauri::App) -> tauri::Result<tauri::menu::Menu<tauri::Wry>> {
    // ── Mado (app menu) ──
    let settings = MenuItem::with_id(app, "settings", "Settings...", true, Some("CmdOrCtrl+,"))?;

    let app_menu = SubmenuBuilder::new(app, "Mado")
        .about(None)
        .separator()
        .item(&settings)
        .separator()
        .services()
        .separator()
        .hide()
        .hide_others()
        .show_all()
        .separator()
        .quit()
        .build()?;

    // ── File ──
    let new_conv = MenuItem::with_id(app, "new-conversation", "New Conversation", true, Some("CmdOrCtrl+N"))?;
    let open_folder = MenuItem::with_id(app, "open-folder", "Open Folder...", true, Some("CmdOrCtrl+O"))?;
    let close_pane = MenuItem::with_id(app, "close-pane", "Close Pane", true, Some("CmdOrCtrl+Shift+W"))?;
    let undo_close = MenuItem::with_id(app, "undo-close", "Undo Close", true, Some("CmdOrCtrl+Shift+T"))?;

    let file_menu = SubmenuBuilder::new(app, "File")
        .item(&new_conv)
        .item(&open_folder)
        .separator()
        .item(&close_pane)
        .item(&undo_close)
        .build()?;

    // ── Edit ──
    let toggle_git = MenuItem::with_id(app, "toggle-git", "Git", true, Some("CmdOrCtrl+G"))?;

    let edit_menu = SubmenuBuilder::new(app, "Edit")
        .undo()
        .redo()
        .separator()
        .cut()
        .copy()
        .paste()
        .select_all()
        .separator()
        .item(&toggle_git)
        .build()?;

    // ── View ──
    let cmd_palette = MenuItem::with_id(app, "command-palette", "Command Palette", true, Some("CmdOrCtrl+K"))?;
    let layout = MenuItem::with_id(app, "layout", "Layout", true, Some("CmdOrCtrl+L"))?;
    let split_h = MenuItem::with_id(app, "split-horizontal", "Split Horizontal", true, Some("CmdOrCtrl+D"))?;
    let split_v = MenuItem::with_id(app, "split-vertical", "Split Vertical", true, Some("CmdOrCtrl+Shift+D"))?;
    let zoom_in = MenuItem::with_id(app, "zoom-in", "Zoom In", true, Some("CmdOrCtrl+="))?;
    let zoom_out = MenuItem::with_id(app, "zoom-out", "Zoom Out", true, Some("CmdOrCtrl+-"))?;
    let zoom_reset = MenuItem::with_id(app, "zoom-reset", "Reset Zoom", true, Some("CmdOrCtrl+0"))?;

    let view_menu = SubmenuBuilder::new(app, "View")
        .item(&cmd_palette)
        .item(&layout)
        .separator()
        .item(&split_h)
        .item(&split_v)
        .separator()
        .item(&zoom_in)
        .item(&zoom_out)
        .item(&zoom_reset)
        .build()?;

    // ── Window ──
    let window_menu = SubmenuBuilder::new(app, "Window")
        .minimize()
        .maximize()
        .close_window()
        .separator()
        .fullscreen()
        .build()?;

    MenuBuilder::new(app)
        .item(&app_menu)
        .item(&file_menu)
        .item(&edit_menu)
        .item(&view_menu)
        .item(&window_menu)
        .build()
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    // Set up tracing for the Tauri app.
    tracing_subscriber::fmt()
        .with_env_filter(
            tracing_subscriber::EnvFilter::try_from_default_env()
                .unwrap_or_else(|_| tracing_subscriber::EnvFilter::new("info")),
        )
        .init();

    tracing::info!("Starting Mado v{}", env!("CARGO_PKG_VERSION"));

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
            commands::delete_all_data,
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
            commands::git_branch_info,
            commands::git_push,
            // Claude CLI history.
            commands::list_cli_sessions,
            // Chat mode commands.
            commands::send_message,
            commands::get_messages,
            commands::cancel_response,
            commands::import_history,
            bridge::attach_chat_session,
        ])
        .setup(|app| {
            // Build and set the native menu bar.
            let menu = build_menu(app)?;
            app.set_menu(menu)?;

            // Forward custom menu-item clicks to the frontend.
            app.on_menu_event(|app_handle, event| {
                let id = event.id().as_ref().to_string();
                let _ = app_handle.emit("menu-action", id);
            });

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
