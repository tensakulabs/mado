use std::fs;
use std::time::Duration;

use tempfile::TempDir;
use tokio::time::sleep;

use kobo_core::client::DaemonClient;
use kobo_daemon::lifecycle::{DaemonConfig, start_with_shutdown};
use kobo_daemon::pid::PidFile;
use kobo_daemon::state::DaemonState;

/// Wait for a socket file to appear on disk.
async fn wait_for_socket(socket_path: &std::path::Path, timeout: Duration) -> bool {
    let start = std::time::Instant::now();
    while start.elapsed() < timeout {
        if socket_path.exists() {
            sleep(Duration::from_millis(50)).await;
            return true;
        }
        sleep(Duration::from_millis(20)).await;
    }
    false
}

/// Helper to create a daemon config in a temp dir.
fn make_config(tmp: &TempDir) -> DaemonConfig {
    DaemonConfig {
        socket_path: tmp.path().join("test.sock"),
        pid_path: tmp.path().join("test.pid"),
        state_path: tmp.path().join("state.json"),
        daemonize: false,
    }
}

#[tokio::test]
async fn test_pid_prevents_duplicate_daemon() {
    let tmp = TempDir::new().unwrap();
    let config = make_config(&tmp);
    let socket_path = config.socket_path.clone();
    let pid_path = config.pid_path.clone();

    // Start first daemon with a oneshot shutdown.
    let (shutdown_tx, shutdown_rx) = tokio::sync::oneshot::channel::<()>();
    let _server_handle = tokio::spawn(async move {
        start_with_shutdown(config, async {
            shutdown_rx.await.ok();
        })
        .await
        .unwrap();
    });

    assert!(
        wait_for_socket(&socket_path, Duration::from_secs(5)).await,
        "First daemon socket did not appear"
    );

    // Verify PID file exists and contains a valid PID.
    assert!(pid_path.exists(), "PID file should exist");
    let pid_content = fs::read_to_string(&pid_path).unwrap();
    let _pid: u32 = pid_content.trim().parse().expect("PID should be a valid number");

    // Try to acquire the same PID file -- should fail because our process is alive.
    let result = PidFile::acquire(&pid_path, Some(&socket_path));
    assert!(result.is_err(), "Should not be able to acquire PID for running daemon");

    match result {
        Err(kobo_daemon::pid::PidError::AlreadyRunning { .. }) => {
            // Expected
        }
        other => panic!("Expected AlreadyRunning error, got: {:?}", other),
    }

    shutdown_tx.send(()).unwrap();
    sleep(Duration::from_millis(200)).await;
}

#[tokio::test]
async fn test_stale_pid_cleanup_allows_new_daemon() {
    let tmp = TempDir::new().unwrap();
    let config = make_config(&tmp);
    let socket_path = config.socket_path.clone();
    let pid_path = config.pid_path.clone();

    // Write a stale PID file with a dead PID.
    fs::write(&pid_path, "99999999").unwrap();
    // Write a stale socket file.
    fs::write(&socket_path, "stale").unwrap();

    let (shutdown_tx, shutdown_rx) = tokio::sync::oneshot::channel::<()>();
    let server_handle = tokio::spawn(async move {
        start_with_shutdown(config, async {
            shutdown_rx.await.ok();
        })
        .await
        .unwrap();
    });

    assert!(
        wait_for_socket(&socket_path, Duration::from_secs(5)).await,
        "Daemon socket did not appear after stale cleanup"
    );

    // Verify daemon is functional.
    let client = DaemonClient::new(&socket_path);
    let status = client.health().await.expect("Health check should work after stale cleanup");
    assert!(status.pid > 0);

    shutdown_tx.send(()).unwrap();
    server_handle.await.unwrap();
}

#[tokio::test]
async fn test_graceful_shutdown_cleans_up_files() {
    let tmp = TempDir::new().unwrap();
    let config = make_config(&tmp);
    let socket_path = config.socket_path.clone();
    let pid_path = config.pid_path.clone();

    let (shutdown_tx, shutdown_rx) = tokio::sync::oneshot::channel::<()>();
    let server_handle = tokio::spawn(async move {
        start_with_shutdown(config, async {
            shutdown_rx.await.ok();
        })
        .await
        .unwrap();
    });

    assert!(
        wait_for_socket(&socket_path, Duration::from_secs(5)).await,
        "Socket did not appear"
    );

    // Verify both files exist while running.
    assert!(socket_path.exists(), "Socket should exist while running");
    assert!(pid_path.exists(), "PID file should exist while running");

    // Trigger shutdown.
    shutdown_tx.send(()).unwrap();
    server_handle.await.unwrap();

    // After shutdown, both files should be cleaned up.
    assert!(
        !socket_path.exists(),
        "Socket file should be removed after shutdown"
    );
    assert!(
        !pid_path.exists(),
        "PID file should be removed after shutdown"
    );
}

#[test]
fn test_state_persistence_save_and_load() {
    let tmp = TempDir::new().unwrap();
    let state_path = tmp.path().join("state.json");

    let mut state = DaemonState::new();
    state.add_session(kobo_core::types::Session {
        id: kobo_core::types::SessionId::new("test-1"),
        name: "Test Session".to_string(),
        model: "sonnet".to_string(),
        status: kobo_core::types::SessionStatus::Active,
        created_at: chrono::Utc::now(),
        updated_at: chrono::Utc::now(),
    });

    // Save
    state.save(&state_path).unwrap();
    assert!(state_path.exists());

    // Load
    let loaded = DaemonState::load(&state_path).unwrap();
    assert_eq!(loaded.sessions.len(), 1);
    assert!(loaded.sessions.contains_key("test-1"));
    assert_eq!(
        loaded.sessions.get("test-1").unwrap().name,
        "Test Session"
    );
}

#[test]
fn test_atomic_state_write() {
    let tmp = TempDir::new().unwrap();
    let state_path = tmp.path().join("state.json");
    let tmp_path = state_path.with_extension("json.tmp");

    let state = DaemonState::new();
    state.save(&state_path).unwrap();

    // The temp file should not exist (it was renamed).
    assert!(!tmp_path.exists(), "Temp file should not exist after save");
    // The state file should exist.
    assert!(state_path.exists(), "State file should exist after save");
}

#[tokio::test]
async fn test_state_saved_on_shutdown() {
    let tmp = TempDir::new().unwrap();
    let config = make_config(&tmp);
    let state_path = config.state_path.clone();
    let socket_path = config.socket_path.clone();

    let (shutdown_tx, shutdown_rx) = tokio::sync::oneshot::channel::<()>();
    let server_handle = tokio::spawn(async move {
        start_with_shutdown(config, async {
            shutdown_rx.await.ok();
        })
        .await
        .unwrap();
    });

    assert!(
        wait_for_socket(&socket_path, Duration::from_secs(5)).await,
        "Socket did not appear"
    );

    // Trigger shutdown.
    shutdown_tx.send(()).unwrap();
    server_handle.await.unwrap();

    // State file should have been saved on shutdown.
    assert!(state_path.exists(), "State should be saved on shutdown");

    // It should be valid JSON.
    let loaded = DaemonState::load(&state_path).unwrap();
    // Empty state is fine -- no sessions were created.
    assert!(loaded.sessions.is_empty());
}
