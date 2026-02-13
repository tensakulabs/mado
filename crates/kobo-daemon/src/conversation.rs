//! ConversationManager: Handles chat-style interactions with Claude CLI.
//!
//! Unlike the PTY-based ProcessManager, this spawns `claude -p` per message
//! and parses the structured JSON output for streaming to the UI.

use std::collections::HashMap;
use std::io::{BufRead, BufReader};
use std::path::PathBuf;
use std::process::{Child, Command, Stdio};
use std::sync::Arc;

use chrono::Utc;
use serde_json::Value;
use tokio::sync::{broadcast, Mutex, RwLock};
use tracing;
use uuid::Uuid;

use kobo_core::types::{
    ConversationState, Message, MessageRole, SessionId, StreamEvent, TokenUsage, ToolCall,
    ToolCallStatus,
};

/// Find the Claude CLI binary on the system.
fn find_claude_binary() -> Option<PathBuf> {
    // Check PATH first via `which`.
    if let Ok(output) = Command::new("which").arg("claude").output() {
        if output.status.success() {
            let path = String::from_utf8_lossy(&output.stdout).trim().to_string();
            if !path.is_empty() {
                let p = PathBuf::from(&path);
                if p.exists() {
                    return Some(p);
                }
            }
        }
    }

    // Check common install locations.
    let candidates = [
        dirs::home_dir().map(|h| h.join(".claude").join("local").join("bin").join("claude")),
        Some(PathBuf::from("/usr/local/bin/claude")),
        Some(PathBuf::from("/opt/homebrew/bin/claude")),
    ];

    for candidate in candidates.into_iter().flatten() {
        if candidate.exists() {
            return Some(candidate);
        }
    }

    None
}

/// A running claude -p process.
struct ActiveProcess {
    child: Child,
    session_id: SessionId,
}

/// Per-session conversation state.
#[derive(Debug, Clone)]
pub struct ConversationSession {
    /// All messages in the conversation.
    pub messages: Vec<Message>,
    /// Current state of the conversation.
    pub state: ConversationState,
    /// Claude CLI session ID for --resume.
    pub claude_session_id: Option<String>,
    /// Cumulative token usage.
    pub total_usage: TokenUsage,
    /// Cumulative cost in USD.
    pub total_cost_usd: f64,
    /// Working directory for this conversation.
    pub working_dir: Option<String>,
    /// Model to use.
    pub model: String,
}

impl Default for ConversationSession {
    fn default() -> Self {
        Self {
            messages: Vec::new(),
            state: ConversationState::Empty,
            claude_session_id: None,
            total_usage: TokenUsage::default(),
            total_cost_usd: 0.0,
            working_dir: None,
            model: "sonnet".to_string(),
        }
    }
}

/// Manages conversations with Claude via `claude -p`.
pub struct ConversationManager {
    /// Per-session conversation data (Arc-wrapped for sharing with tasks).
    sessions: Arc<RwLock<HashMap<String, ConversationSession>>>,
    /// Active streaming processes (for cancellation).
    active_processes: Arc<Mutex<HashMap<String, Child>>>,
    /// Broadcast channels for streaming events per session.
    event_senders: Arc<RwLock<HashMap<String, broadcast::Sender<StreamEvent>>>>,
    /// Base directory for storing conversations.
    storage_dir: PathBuf,
}

impl ConversationManager {
    pub fn new(storage_dir: PathBuf) -> Self {
        Self {
            sessions: Arc::new(RwLock::new(HashMap::new())),
            active_processes: Arc::new(Mutex::new(HashMap::new())),
            event_senders: Arc::new(RwLock::new(HashMap::new())),
            storage_dir,
        }
    }

    /// Initialize or get a conversation session.
    pub async fn get_or_create_session(
        &self,
        session_id: &SessionId,
        model: &str,
        working_dir: Option<String>,
    ) -> ConversationSession {
        let mut sessions = self.sessions.write().await;
        if let Some(session) = sessions.get(session_id.as_str()) {
            session.clone()
        } else {
            let session = ConversationSession {
                model: model.to_string(),
                working_dir,
                ..Default::default()
            };
            sessions.insert(session_id.as_str().to_string(), session.clone());
            session
        }
    }

    /// Get a broadcast receiver for a session's events.
    pub async fn subscribe(&self, session_id: &SessionId) -> broadcast::Receiver<StreamEvent> {
        let mut senders = self.event_senders.write().await;
        if let Some(tx) = senders.get(session_id.as_str()) {
            tx.subscribe()
        } else {
            let (tx, rx) = broadcast::channel(256);
            senders.insert(session_id.as_str().to_string(), tx);
            rx
        }
    }

    /// Get a sender for a session's events.
    async fn get_sender(&self, session_id: &SessionId) -> broadcast::Sender<StreamEvent> {
        let mut senders = self.event_senders.write().await;
        if let Some(tx) = senders.get(session_id.as_str()) {
            tx.clone()
        } else {
            let (tx, _) = broadcast::channel(256);
            senders.insert(session_id.as_str().to_string(), tx.clone());
            tx
        }
    }

    /// Send a message and start streaming the response.
    pub async fn send_message(
        &self,
        session_id: &SessionId,
        content: String,
        model_override: Option<String>,
    ) -> Result<String, ConversationError> {
        // Ensure we have a session.
        let session = {
            let sessions = self.sessions.read().await;
            sessions.get(session_id.as_str()).cloned()
        };

        let session = session.ok_or_else(|| {
            ConversationError::SessionNotFound(session_id.as_str().to_string())
        })?;

        let model = model_override.unwrap_or(session.model.clone());

        // Create user message.
        let user_msg = Message {
            id: Uuid::new_v4().to_string(),
            role: MessageRole::User,
            content: content.clone(),
            tool_calls: Vec::new(),
            timestamp: Utc::now(),
            usage: None,
            cost_usd: None,
        };
        let user_msg_id = user_msg.id.clone();

        // Store user message and update state.
        {
            let mut sessions = self.sessions.write().await;
            if let Some(s) = sessions.get_mut(session_id.as_str()) {
                s.messages.push(user_msg.clone());
                s.state = ConversationState::Streaming;
            }
        }

        // Find Claude CLI.
        let claude_path = find_claude_binary().ok_or(ConversationError::ClaudeNotFound)?;

        // Build command.
        let mut cmd = Command::new(&claude_path);
        cmd.arg("-p").arg(&content);
        cmd.arg("--output-format").arg("stream-json");
        cmd.arg("--verbose");
        cmd.arg("--model").arg(&model);

        // Add --resume if we have a Claude session ID.
        if let Some(ref claude_sid) = session.claude_session_id {
            cmd.arg("--resume").arg(claude_sid);
        }

        // Set working directory.
        if let Some(ref dir) = session.working_dir {
            cmd.current_dir(dir);
        }

        cmd.stdout(Stdio::piped());
        cmd.stderr(Stdio::piped());

        // Spawn the process.
        let mut child = cmd
            .spawn()
            .map_err(|e| ConversationError::SpawnFailed(e.to_string()))?;

        let stdout = child.stdout.take().ok_or_else(|| {
            ConversationError::SpawnFailed("Failed to capture stdout".to_string())
        })?;

        // Store child for cancellation.
        {
            let mut active = self.active_processes.lock().await;
            active.insert(session_id.as_str().to_string(), child);
        }

        // Get broadcast sender.
        let tx = self.get_sender(session_id).await;
        let session_id_clone = session_id.clone();
        let sessions_ref = self.sessions.clone();
        let active_ref = self.active_processes.clone();

        // Spawn reader task.
        tokio::task::spawn_blocking(move || {
            let reader = BufReader::new(stdout);
            let mut accumulated_text = String::new();
            let mut tool_calls: Vec<ToolCall> = Vec::new();
            let mut final_usage: Option<TokenUsage> = None;
            let mut final_cost: Option<f64> = None;
            let mut final_claude_sid: Option<String> = None;

            for line in reader.lines() {
                let line = match line {
                    Ok(l) => l,
                    Err(e) => {
                        tracing::error!("Failed to read line: {}", e);
                        break;
                    }
                };

                if line.is_empty() {
                    continue;
                }

                // Parse JSON event.
                let event: Value = match serde_json::from_str(&line) {
                    Ok(v) => v,
                    Err(e) => {
                        tracing::warn!("Failed to parse JSON: {} - line: {}", e, line);
                        continue;
                    }
                };

                let event_type = event["type"].as_str().unwrap_or("");

                match event_type {
                    "assistant" => {
                        // Assistant message content - extract text from message.content
                        if let Some(message) = event.get("message") {
                            if let Some(content_arr) = message.get("content").and_then(|c| c.as_array()) {
                                for block in content_arr {
                                    if block.get("type").and_then(|t| t.as_str()) == Some("text") {
                                        if let Some(text) = block.get("text").and_then(|t| t.as_str()) {
                                            accumulated_text.push_str(text);
                                            let _ = tx.send(StreamEvent::TextDelta {
                                                text: text.to_string(),
                                            });
                                        }
                                    }
                                }
                            }
                        }
                    }
                    "content_block_delta" => {
                        // Streaming text delta.
                        if let Some(delta) = event.get("delta") {
                            if delta.get("type").and_then(|t| t.as_str()) == Some("text_delta") {
                                if let Some(text) = delta.get("text").and_then(|t| t.as_str()) {
                                    accumulated_text.push_str(text);
                                    let _ = tx.send(StreamEvent::TextDelta {
                                        text: text.to_string(),
                                    });
                                }
                            }
                        }
                    }
                    "content_block_start" => {
                        // Check for tool use start.
                        if let Some(content_block) = event.get("content_block") {
                            if content_block.get("type").and_then(|t| t.as_str()) == Some("tool_use")
                            {
                                let tool_id = content_block
                                    .get("id")
                                    .and_then(|i| i.as_str())
                                    .unwrap_or("")
                                    .to_string();
                                let tool_name = content_block
                                    .get("name")
                                    .and_then(|n| n.as_str())
                                    .unwrap_or("")
                                    .to_string();

                                let _ = tx.send(StreamEvent::ToolUseStart {
                                    tool_call_id: tool_id.clone(),
                                    name: tool_name.clone(),
                                    input: Value::Object(Default::default()),
                                });

                                tool_calls.push(ToolCall {
                                    id: tool_id,
                                    name: tool_name,
                                    input: Value::Object(Default::default()),
                                    output: None,
                                    status: ToolCallStatus::Running,
                                });
                            }
                        }
                    }
                    "result" => {
                        // Final result with metadata.
                        final_claude_sid = event
                            .get("session_id")
                            .and_then(|s| s.as_str())
                            .map(String::from);
                        final_cost = event.get("cost_usd").and_then(|c| c.as_f64());

                        if let Some(usage) = event.get("usage") {
                            final_usage = Some(TokenUsage {
                                input_tokens: usage
                                    .get("input_tokens")
                                    .and_then(|t| t.as_u64())
                                    .unwrap_or(0),
                                output_tokens: usage
                                    .get("output_tokens")
                                    .and_then(|t| t.as_u64())
                                    .unwrap_or(0),
                                cache_read_tokens: usage
                                    .get("cache_read_input_tokens")
                                    .and_then(|t| t.as_u64()),
                                cache_write_tokens: usage
                                    .get("cache_creation_input_tokens")
                                    .and_then(|t| t.as_u64()),
                            });
                        }

                        // Create the complete assistant message.
                        let assistant_msg = Message {
                            id: Uuid::new_v4().to_string(),
                            role: MessageRole::Assistant,
                            content: accumulated_text.clone(),
                            tool_calls: tool_calls.clone(),
                            timestamp: Utc::now(),
                            usage: final_usage.clone(),
                            cost_usd: final_cost,
                        };

                        let _ = tx.send(StreamEvent::MessageComplete {
                            message: Box::new(assistant_msg),
                        });
                    }
                    _ => {
                        // Log unknown event types for debugging.
                        tracing::debug!("Unknown event type: {}", event_type);
                    }
                }
            }

            // Update session state after completion.
            let rt = tokio::runtime::Handle::current();
            rt.block_on(async {
                let mut sessions = sessions_ref.write().await;
                if let Some(s) = sessions.get_mut(session_id_clone.as_str()) {
                    // Create final assistant message if we have accumulated text.
                    if !accumulated_text.is_empty() {
                        let assistant_msg = Message {
                            id: Uuid::new_v4().to_string(),
                            role: MessageRole::Assistant,
                            content: accumulated_text,
                            tool_calls,
                            timestamp: Utc::now(),
                            usage: final_usage.clone(),
                            cost_usd: final_cost,
                        };
                        s.messages.push(assistant_msg);
                    }

                    // Update session metadata.
                    if let Some(sid) = final_claude_sid {
                        s.claude_session_id = Some(sid);
                    }
                    if let Some(usage) = final_usage {
                        s.total_usage.input_tokens += usage.input_tokens;
                        s.total_usage.output_tokens += usage.output_tokens;
                    }
                    if let Some(cost) = final_cost {
                        s.total_cost_usd += cost;
                    }
                    s.state = ConversationState::Idle;
                }

                // Remove from active processes.
                let mut active = active_ref.lock().await;
                active.remove(session_id_clone.as_str());
            });

            let _ = tx.send(StreamEvent::Idle);
        });

        Ok(user_msg_id)
    }

    /// Cancel an in-progress response.
    pub async fn cancel_response(&self, session_id: &SessionId) -> Result<(), ConversationError> {
        let mut active = self.active_processes.lock().await;
        if let Some(mut child) = active.remove(session_id.as_str()) {
            child
                .kill()
                .map_err(|e| ConversationError::KillFailed(e.to_string()))?;

            // Update state.
            let mut sessions = self.sessions.write().await;
            if let Some(s) = sessions.get_mut(session_id.as_str()) {
                s.state = ConversationState::Idle;
            }

            // Send idle event.
            let tx = self.get_sender(session_id).await;
            let _ = tx.send(StreamEvent::Idle);

            Ok(())
        } else {
            Err(ConversationError::NoActiveResponse)
        }
    }

    /// Get all messages for a session.
    pub async fn get_messages(
        &self,
        session_id: &SessionId,
        limit: Option<usize>,
        before_id: Option<String>,
    ) -> Result<Vec<Message>, ConversationError> {
        let sessions = self.sessions.read().await;
        let session = sessions.get(session_id.as_str()).ok_or_else(|| {
            ConversationError::SessionNotFound(session_id.as_str().to_string())
        })?;

        let mut messages = session.messages.clone();

        // Apply before_id filter.
        if let Some(ref bid) = before_id {
            if let Some(pos) = messages.iter().position(|m| m.id == *bid) {
                messages = messages[..pos].to_vec();
            }
        }

        // Apply limit.
        if let Some(lim) = limit {
            let start = messages.len().saturating_sub(lim);
            messages = messages[start..].to_vec();
        }

        Ok(messages)
    }

    /// Get the current conversation state.
    pub async fn get_state(&self, session_id: &SessionId) -> Option<ConversationState> {
        let sessions = self.sessions.read().await;
        sessions.get(session_id.as_str()).map(|s| s.state.clone())
    }

    /// Initialize a session (called when creating a new session).
    pub async fn init_session(
        &self,
        session_id: &SessionId,
        model: &str,
        working_dir: Option<String>,
    ) {
        let mut sessions = self.sessions.write().await;
        sessions.insert(
            session_id.as_str().to_string(),
            ConversationSession {
                model: model.to_string(),
                working_dir,
                ..Default::default()
            },
        );
    }

    /// Remove a session.
    pub async fn remove_session(&self, session_id: &SessionId) {
        let mut sessions = self.sessions.write().await;
        sessions.remove(session_id.as_str());

        let mut senders = self.event_senders.write().await;
        senders.remove(session_id.as_str());

        let mut active = self.active_processes.lock().await;
        if let Some(mut child) = active.remove(session_id.as_str()) {
            let _ = child.kill();
        }
    }
}

/// Thread-safe wrapper for ConversationManager.
pub type SharedConversationManager = Arc<ConversationManager>;

/// Errors from conversation management.
#[derive(Debug, thiserror::Error)]
pub enum ConversationError {
    #[error("Session not found: {0}")]
    SessionNotFound(String),

    #[error("Claude CLI not found on system")]
    ClaudeNotFound,

    #[error("Failed to spawn process: {0}")]
    SpawnFailed(String),

    #[error("Failed to kill process: {0}")]
    KillFailed(String),

    #[error("No active response to cancel")]
    NoActiveResponse,

    #[error("IO error: {0}")]
    IoError(#[from] std::io::Error),
}
