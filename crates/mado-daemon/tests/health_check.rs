use std::os::unix::fs::PermissionsExt;
use std::path::PathBuf;
use std::sync::Arc;
use std::time::Duration;

use http_body_util::{BodyExt, Full};
use hyper::body::Bytes;
use hyper::Request;
use hyper_util::rt::TokioIo;
use tempfile::TempDir;
use tokio::net::UnixStream;
use tokio::sync::Mutex;
use tokio::time::sleep;

use mado_core::protocol::DaemonResponse;
use mado_daemon::state::DaemonState;

/// Create test state for server tests.
fn create_test_state(tmp_dir: &TempDir) -> (Arc<Mutex<DaemonState>>, PathBuf) {
    let state_path = tmp_dir.path().join("state.json");
    let daemon_state = Arc::new(Mutex::new(DaemonState::default()));
    (daemon_state, state_path)
}

/// Helper to send a GET request to the daemon over a Unix socket.
async fn get_request(socket_path: &std::path::Path, path: &str) -> (u16, Bytes) {
    let stream = UnixStream::connect(socket_path).await.expect("Failed to connect to socket");
    let io = TokioIo::new(stream);

    let (mut sender, conn) = hyper::client::conn::http1::handshake(io)
        .await
        .expect("Handshake failed");

    tokio::spawn(async move {
        if let Err(e) = conn.await {
            eprintln!("Connection error: {}", e);
        }
    });

    let req = Request::builder()
        .uri(path)
        .header("Host", "localhost")
        .body(Full::new(Bytes::new()))
        .expect("Failed to build request");

    let resp = sender.send_request(req).await.expect("Request failed");
    let status = resp.status().as_u16();
    let body = resp.into_body().collect().await.expect("Failed to collect body").to_bytes();
    (status, body)
}

/// Wait for a socket file to appear on disk, with a timeout.
async fn wait_for_socket(socket_path: &std::path::Path, timeout: Duration) -> bool {
    let start = std::time::Instant::now();
    while start.elapsed() < timeout {
        if socket_path.exists() {
            // Give the server a moment to start accepting connections.
            sleep(Duration::from_millis(50)).await;
            return true;
        }
        sleep(Duration::from_millis(20)).await;
    }
    false
}

#[tokio::test]
async fn test_health_endpoint_returns_valid_status() {
    let tmp_dir = TempDir::new().expect("Failed to create temp dir");
    let socket_path = tmp_dir.path().join("test.sock");
    let (daemon_state, state_path) = create_test_state(&tmp_dir);

    let socket_path_clone = socket_path.clone();

    // Start the server in a background task.
    let (shutdown_tx, shutdown_rx) = tokio::sync::oneshot::channel::<()>();
    let server_handle = tokio::spawn(async move {
        mado_daemon::server::start_server(
            socket_path_clone,
            state_path,
            daemon_state,
            async {
                shutdown_rx.await.ok();
            },
        )
        .await
        .expect("Server failed to start");
    });

    // Wait for the socket to appear.
    assert!(
        wait_for_socket(&socket_path, Duration::from_secs(5)).await,
        "Socket did not appear in time"
    );

    // Send health check request.
    let (status, body) = get_request(&socket_path, "/health").await;
    assert_eq!(status, 200);

    let response: DaemonResponse =
        serde_json::from_slice(&body).expect("Failed to parse response");

    match response {
        DaemonResponse::Health { status } => {
            assert!(status.pid > 0, "PID should be positive");
            assert_eq!(status.session_count, 0);
            assert!(!status.version.is_empty(), "Version should not be empty");
        }
        other => panic!("Expected Health response, got: {:?}", other),
    }

    // Shutdown the server.
    shutdown_tx.send(()).expect("Failed to send shutdown");
    server_handle.await.expect("Server task panicked");

    // Verify socket is cleaned up after shutdown.
    assert!(
        !socket_path.exists(),
        "Socket file should be removed after shutdown"
    );
}

#[tokio::test]
async fn test_ping_endpoint_returns_pong() {
    let tmp_dir = TempDir::new().expect("Failed to create temp dir");
    let socket_path = tmp_dir.path().join("test.sock");
    let (daemon_state, state_path) = create_test_state(&tmp_dir);

    let socket_path_clone = socket_path.clone();

    let (shutdown_tx, shutdown_rx) = tokio::sync::oneshot::channel::<()>();
    let server_handle = tokio::spawn(async move {
        mado_daemon::server::start_server(
            socket_path_clone,
            state_path,
            daemon_state,
            async {
                shutdown_rx.await.ok();
            },
        )
        .await
        .expect("Server failed to start");
    });

    assert!(
        wait_for_socket(&socket_path, Duration::from_secs(5)).await,
        "Socket did not appear in time"
    );

    let (status, body) = get_request(&socket_path, "/ping").await;
    assert_eq!(status, 200);

    let response: DaemonResponse =
        serde_json::from_slice(&body).expect("Failed to parse response");

    match response {
        DaemonResponse::Pong => {}
        other => panic!("Expected Pong response, got: {:?}", other),
    }

    shutdown_tx.send(()).expect("Failed to send shutdown");
    server_handle.await.expect("Server task panicked");
}

#[tokio::test]
async fn test_socket_permissions_are_0600() {
    let tmp_dir = TempDir::new().expect("Failed to create temp dir");
    let socket_path = tmp_dir.path().join("test.sock");
    let (daemon_state, state_path) = create_test_state(&tmp_dir);

    let socket_path_clone = socket_path.clone();

    let (shutdown_tx, shutdown_rx) = tokio::sync::oneshot::channel::<()>();
    let _server_handle = tokio::spawn(async move {
        mado_daemon::server::start_server(
            socket_path_clone,
            state_path,
            daemon_state,
            async {
                shutdown_rx.await.ok();
            },
        )
        .await
        .expect("Server failed to start");
    });

    assert!(
        wait_for_socket(&socket_path, Duration::from_secs(5)).await,
        "Socket did not appear in time"
    );

    let metadata = std::fs::metadata(&socket_path).expect("Failed to get socket metadata");
    let permissions = metadata.permissions();
    let mode = permissions.mode() & 0o777;
    assert_eq!(
        mode, 0o600,
        "Socket permissions should be 0600, got {:o}",
        mode
    );

    shutdown_tx.send(()).expect("Failed to send shutdown");
}

#[tokio::test]
async fn test_stale_socket_cleanup() {
    let tmp_dir = TempDir::new().expect("Failed to create temp dir");
    let socket_path = tmp_dir.path().join("test.sock");
    let (daemon_state, state_path) = create_test_state(&tmp_dir);

    // Create a dummy file at the socket path to simulate a stale socket.
    std::fs::write(&socket_path, "stale").expect("Failed to create dummy file");
    assert!(socket_path.exists(), "Dummy file should exist");

    let socket_path_clone = socket_path.clone();

    let (shutdown_tx, shutdown_rx) = tokio::sync::oneshot::channel::<()>();
    let server_handle = tokio::spawn(async move {
        mado_daemon::server::start_server(
            socket_path_clone,
            state_path,
            daemon_state,
            async {
                shutdown_rx.await.ok();
            },
        )
        .await
        .expect("Server should handle stale socket file");
    });

    assert!(
        wait_for_socket(&socket_path, Duration::from_secs(5)).await,
        "Socket did not appear in time"
    );

    // Verify the daemon is functional after stale socket cleanup.
    let (status, _body) = get_request(&socket_path, "/ping").await;
    assert_eq!(status, 200);

    shutdown_tx.send(()).expect("Failed to send shutdown");
    server_handle.await.expect("Server task panicked");
}

#[tokio::test]
async fn test_client_health_check() {
    let tmp_dir = TempDir::new().expect("Failed to create temp dir");
    let socket_path = tmp_dir.path().join("test.sock");
    let (daemon_state, state_path) = create_test_state(&tmp_dir);

    let socket_path_clone = socket_path.clone();

    let (shutdown_tx, shutdown_rx) = tokio::sync::oneshot::channel::<()>();
    let _server_handle = tokio::spawn(async move {
        mado_daemon::server::start_server(
            socket_path_clone,
            state_path,
            daemon_state,
            async {
                shutdown_rx.await.ok();
            },
        )
        .await
        .expect("Server failed to start");
    });

    assert!(
        wait_for_socket(&socket_path, Duration::from_secs(5)).await,
        "Socket did not appear in time"
    );

    // Test using the DaemonClient from mado-core.
    let client = mado_core::client::DaemonClient::new(&socket_path);

    // connect() should succeed
    client.connect().await.expect("Client connect should succeed");

    // health() should return valid status
    let status = client.health().await.expect("Health check should succeed");
    assert!(status.pid > 0);
    assert_eq!(status.session_count, 0);
    assert!(!status.version.is_empty());

    shutdown_tx.send(()).expect("Failed to send shutdown");
}
