//! Claude CLI history import.
//!
//! Parses Claude CLI session files from ~/.claude/projects/ to import
//! conversation history into Kobo.

use std::fs::{self, File};
use std::io::{BufRead, BufReader};
use std::path::{Path, PathBuf};

use chrono::{DateTime, Utc};
use serde::Deserialize;
use serde_json::Value;

use mado_core::types::{Message, MessageRole, ToolCall, ToolCallStatus};

/// A parsed Claude CLI session entry.
#[derive(Debug, Deserialize)]
struct ClaudeEntry {
    #[serde(rename = "type")]
    entry_type: String,
    message: Option<ClaudeMessage>,
    timestamp: Option<String>,
    #[serde(rename = "sessionId")]
    session_id: Option<String>,
}

#[derive(Debug, Deserialize)]
struct ClaudeMessage {
    role: String,
    content: ClaudeContent,
}

/// Content can be a string (user) or array of blocks (assistant).
#[derive(Debug, Deserialize)]
#[serde(untagged)]
enum ClaudeContent {
    Text(String),
    Blocks(Vec<ClaudeContentBlock>),
}

#[derive(Debug, Deserialize)]
struct ClaudeContentBlock {
    #[serde(rename = "type")]
    block_type: String,
    text: Option<String>,
    id: Option<String>,
    name: Option<String>,
    input: Option<Value>,
}

/// Convert a working directory path to Claude's project directory name.
/// e.g., "/Users/justintieu/tensakulabs/kobo" -> "-Users-justintieu-tensakulabs-kobo"
fn path_to_project_name(path: &Path) -> String {
    path.to_string_lossy()
        .replace('/', "-")
        .trim_start_matches('-')
        .to_string()
}

/// Find Claude CLI project directory for a working directory.
pub fn find_project_dir(working_dir: &Path) -> Option<PathBuf> {
    let claude_dir = dirs::home_dir()?.join(".claude").join("projects");
    let project_name = format!("-{}", path_to_project_name(working_dir));
    let project_path = claude_dir.join(&project_name);

    if project_path.exists() && project_path.is_dir() {
        Some(project_path)
    } else {
        None
    }
}

/// List all session files in a project directory, sorted by modification time (newest first).
pub fn list_sessions(project_dir: &Path) -> Vec<PathBuf> {
    let mut sessions: Vec<_> = fs::read_dir(project_dir)
        .into_iter()
        .flatten()
        .filter_map(|e| e.ok())
        .filter(|e| {
            e.path().extension().map_or(false, |ext| ext == "jsonl")
        })
        .map(|e| e.path())
        .collect();

    // Sort by modification time, newest first.
    sessions.sort_by(|a, b| {
        let a_time = fs::metadata(a).and_then(|m| m.modified()).ok();
        let b_time = fs::metadata(b).and_then(|m| m.modified()).ok();
        b_time.cmp(&a_time)
    });

    sessions
}

/// Parse a Claude CLI session file into Kobo messages.
pub fn parse_session(session_path: &Path) -> Result<Vec<Message>, HistoryError> {
    let file = File::open(session_path)?;
    let reader = BufReader::new(file);
    let mut messages = Vec::new();

    for line in reader.lines() {
        let line = line?;
        if line.is_empty() {
            continue;
        }

        let entry: ClaudeEntry = match serde_json::from_str(&line) {
            Ok(e) => e,
            Err(_) => continue, // Skip unparseable lines
        };

        // Only process user and assistant messages.
        if entry.entry_type != "user" && entry.entry_type != "assistant" {
            continue;
        }

        let Some(msg) = entry.message else {
            continue;
        };

        let role = match msg.role.as_str() {
            "user" => MessageRole::User,
            "assistant" => MessageRole::Assistant,
            _ => continue,
        };

        // Parse timestamp.
        let timestamp = entry
            .timestamp
            .as_ref()
            .and_then(|t| DateTime::parse_from_rfc3339(t).ok())
            .map(|dt| dt.with_timezone(&Utc))
            .unwrap_or_else(Utc::now);

        // Extract content and tool calls.
        let (content, tool_calls) = match msg.content {
            ClaudeContent::Text(text) => (text, Vec::new()),
            ClaudeContent::Blocks(blocks) => {
                let mut text_parts = Vec::new();
                let mut tools = Vec::new();

                for block in blocks {
                    match block.block_type.as_str() {
                        "text" => {
                            if let Some(text) = block.text {
                                text_parts.push(text);
                            }
                        }
                        "tool_use" => {
                            if let (Some(id), Some(name)) = (block.id, block.name) {
                                tools.push(ToolCall {
                                    id,
                                    name,
                                    input: block.input.unwrap_or(Value::Null),
                                    output: None,
                                    status: ToolCallStatus::Completed,
                                });
                            }
                        }
                        _ => {}
                    }
                }

                (text_parts.join("\n"), tools)
            }
        };

        // Generate a deterministic ID from session + index.
        let id = format!(
            "imported-{}-{}",
            session_path.file_stem().unwrap_or_default().to_string_lossy(),
            messages.len()
        );

        messages.push(Message {
            id,
            role,
            content,
            tool_calls,
            timestamp,
            usage: None,
            cost_usd: None,
        });
    }

    Ok(messages)
}

/// Import history from Claude CLI for a working directory.
/// Returns messages from the most recent session.
pub fn import_history(working_dir: &Path, limit: Option<usize>) -> Result<Vec<Message>, HistoryError> {
    let project_dir = find_project_dir(working_dir)
        .ok_or_else(|| HistoryError::ProjectNotFound(working_dir.to_path_buf()))?;

    let sessions = list_sessions(&project_dir);
    if sessions.is_empty() {
        return Ok(Vec::new());
    }

    // Get the most recent session.
    let latest_session = &sessions[0];
    let mut messages = parse_session(latest_session)?;

    // Apply limit.
    if let Some(lim) = limit {
        let start = messages.len().saturating_sub(lim);
        messages = messages[start..].to_vec();
    }

    Ok(messages)
}

/// Import history from all sessions for a working directory.
pub fn import_all_history(working_dir: &Path, limit: Option<usize>) -> Result<Vec<Message>, HistoryError> {
    let project_dir = find_project_dir(working_dir)
        .ok_or_else(|| HistoryError::ProjectNotFound(working_dir.to_path_buf()))?;

    let sessions = list_sessions(&project_dir);
    let mut all_messages = Vec::new();

    for session_path in sessions {
        let mut messages = parse_session(&session_path)?;
        all_messages.append(&mut messages);
    }

    // Sort by timestamp.
    all_messages.sort_by(|a, b| a.timestamp.cmp(&b.timestamp));

    // Apply limit.
    if let Some(lim) = limit {
        let start = all_messages.len().saturating_sub(lim);
        all_messages = all_messages[start..].to_vec();
    }

    Ok(all_messages)
}

/// List available Claude CLI sessions for a working directory.
pub fn list_available_sessions(working_dir: &Path) -> Result<Vec<SessionInfo>, HistoryError> {
    let project_dir = find_project_dir(working_dir)
        .ok_or_else(|| HistoryError::ProjectNotFound(working_dir.to_path_buf()))?;

    let sessions = list_sessions(&project_dir);
    let mut infos = Vec::new();

    for session_path in sessions {
        let id = session_path
            .file_stem()
            .unwrap_or_default()
            .to_string_lossy()
            .to_string();

        let modified = fs::metadata(&session_path)
            .and_then(|m| m.modified())
            .ok()
            .and_then(|t| DateTime::<Utc>::from(t).into());

        // Count messages.
        let message_count = parse_session(&session_path)
            .map(|m| m.len())
            .unwrap_or(0);

        infos.push(SessionInfo {
            id,
            modified,
            message_count,
        });
    }

    Ok(infos)
}

/// Info about a Claude CLI session.
#[derive(Debug, Clone)]
pub struct SessionInfo {
    pub id: String,
    pub modified: Option<DateTime<Utc>>,
    pub message_count: usize,
}

/// Errors from history import.
#[derive(Debug, thiserror::Error)]
pub enum HistoryError {
    #[error("Project not found for path: {0}")]
    ProjectNotFound(PathBuf),

    #[error("IO error: {0}")]
    IoError(#[from] std::io::Error),

    #[error("JSON parse error: {0}")]
    JsonError(#[from] serde_json::Error),
}
