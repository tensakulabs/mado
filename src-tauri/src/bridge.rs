use tauri::ipc::Channel;
use tauri::State;

use crate::commands::DaemonState;

/// Attach to a session's PTY output stream.
///
/// Connects to the daemon's SSE endpoint for the given session and forwards
/// output chunks to the frontend via a Tauri Channel. The channel receives
/// base64-encoded output data that the frontend decodes and writes to xterm.js.
#[tauri::command]
pub async fn attach_session(
    state: State<'_, DaemonState>,
    session_id: String,
    on_output: Channel<String>,
) -> Result<(), String> {
    let guard = state.client.lock().await;
    let client = guard
        .as_ref()
        .ok_or_else(|| "Not connected to daemon".to_string())?;

    // Get the socket path for creating a direct SSE connection.
    let socket_path = client.socket_path().to_path_buf();
    drop(guard); // Release the lock before long-running stream.

    // Connect to the daemon's SSE endpoint for this session.
    stream_session_output(&socket_path, &session_id, on_output).await
}

/// Stream output from the daemon's SSE endpoint to a Tauri channel.
async fn stream_session_output(
    socket_path: &std::path::Path,
    session_id: &str,
    on_output: Channel<String>,
) -> Result<(), String> {
    use http_body_util::BodyExt;
    use hyper::body::Bytes;
    use hyper::Request;
    use hyper_util::rt::TokioIo;
    use tokio::net::UnixStream;

    let stream = UnixStream::connect(socket_path)
        .await
        .map_err(|e| format!("Failed to connect to daemon: {}", e))?;

    let io = TokioIo::new(stream);

    let (mut sender, conn) = hyper::client::conn::http1::handshake(io)
        .await
        .map_err(|e| format!("HTTP handshake failed: {}", e))?;

    // Spawn connection driver.
    tokio::spawn(async move {
        if let Err(e) = conn.await {
            tracing::error!("SSE connection error: {}", e);
        }
    });

    let req = Request::builder()
        .uri(format!("/sessions/{}/output", session_id))
        .header("Host", "localhost")
        .header("Accept", "text/event-stream")
        .body(http_body_util::Full::new(Bytes::new()))
        .map_err(|e| format!("Failed to build request: {}", e))?;

    let resp = sender
        .send_request(req)
        .await
        .map_err(|e| format!("SSE request failed: {}", e))?;

    // Read the SSE stream frame by frame.
    let mut body = resp.into_body();
    let mut buffer = String::new();

    loop {
        match body.frame().await {
            Some(Ok(frame)) => {
                if let Ok(data) = frame.into_data() {
                    let chunk = String::from_utf8_lossy(&data);
                    buffer.push_str(&chunk);

                    // Parse SSE events from buffer.
                    while let Some(event_end) = buffer.find("\n\n") {
                        let event_text = buffer[..event_end].to_string();
                        buffer = buffer[event_end + 2..].to_string();

                        // Parse event type and data.
                        let mut event_type = String::new();
                        let mut event_data = String::new();

                        for line in event_text.lines() {
                            if let Some(val) = line.strip_prefix("event:") {
                                event_type = val.trim().to_string();
                            } else if let Some(val) = line.strip_prefix("data:") {
                                event_data = val.trim().to_string();
                            }
                        }

                        match event_type.as_str() {
                            "output" => {
                                // Forward base64-encoded output to frontend.
                                if let Err(e) = on_output.send(event_data) {
                                    tracing::warn!("Failed to send to channel: {}", e);
                                    return Ok(());
                                }
                            }
                            "started" => {
                                tracing::debug!("SSE stream started for session {}", session_id);
                            }
                            "error" => {
                                return Err(format!("Session error: {}", event_data));
                            }
                            _ => {}
                        }
                    }
                }
            }
            Some(Err(e)) => {
                tracing::warn!("SSE stream error: {}", e);
                break;
            }
            None => {
                tracing::info!("SSE stream ended for session {}", session_id);
                break;
            }
        }
    }

    Ok(())
}
