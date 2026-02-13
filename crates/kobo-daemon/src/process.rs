use std::collections::HashMap;
use std::io::Read;
use std::path::PathBuf;
use std::sync::Arc;

use portable_pty::{CommandBuilder, native_pty_system, PtySize};
use tokio::sync::{broadcast, Mutex};
use tracing;

use kobo_core::types::SessionId;

/// Valid model identifiers for Claude CLI.
const VALID_MODELS: &[&str] = &["opus", "sonnet", "haiku"];

/// Result of spawning a process, indicating what was actually launched.
pub struct SpawnResult {
    /// Whether the shell was used as fallback (claude not found).
    pub shell_fallback: bool,
    /// The command that was executed.
    pub command: String,
}

/// A managed process running in a PTY.
pub struct ManagedProcess {
    /// The child process handle.
    _child: Box<dyn portable_pty::Child + Send>,
    /// Writer to send input to the PTY.
    writer: Box<dyn std::io::Write + Send>,
    /// The master PTY handle (for resize operations).
    master: Box<dyn portable_pty::MasterPty + Send>,
    /// Broadcast sender for output data.
    output_tx: broadcast::Sender<Vec<u8>>,
}

impl ManagedProcess {
    /// Write input data to the PTY (user keystrokes).
    pub fn write_input(&mut self, data: &[u8]) -> std::io::Result<()> {
        use std::io::Write;
        self.writer.write_all(data)?;
        self.writer.flush()?;
        Ok(())
    }

    /// Resize the PTY.
    pub fn resize(&self, rows: u16, cols: u16) -> Result<(), Box<dyn std::error::Error>> {
        self.master.resize(PtySize {
            rows,
            cols,
            pixel_width: 0,
            pixel_height: 0,
        })?;
        Ok(())
    }

    /// Subscribe to output from this process.
    pub fn subscribe_output(&self) -> broadcast::Receiver<Vec<u8>> {
        self.output_tx.subscribe()
    }
}

/// Manages all PTY processes for the daemon.
pub struct ProcessManager {
    processes: HashMap<String, ManagedProcess>,
}

impl ProcessManager {
    pub fn new() -> Self {
        Self {
            processes: HashMap::new(),
        }
    }

    /// Spawn a new process in a PTY.
    ///
    /// Attempts to launch Claude CLI with the given model. If Claude CLI is not
    /// found on the system, falls back to the user's default shell.
    pub fn create(
        &mut self,
        session_id: &SessionId,
        model: &str,
        rows: u16,
        cols: u16,
        working_dir: Option<&str>,
        api_key: Option<&str>,
    ) -> Result<SpawnResult, ProcessError> {
        // Validate model.
        if !VALID_MODELS.contains(&model) {
            return Err(ProcessError::InvalidModel(model.to_string()));
        }

        let pty_system = native_pty_system();

        let pty_size = PtySize {
            rows,
            cols,
            pixel_width: 0,
            pixel_height: 0,
        };

        let pair = pty_system
            .openpty(pty_size)
            .map_err(|e| ProcessError::PtyOpenFailed(e.to_string()))?;

        // Try to find Claude CLI.
        let claude_path = find_claude_binary();

        let (cmd, shell_fallback, command_str) = if let Some(claude) = claude_path {
            let mut cmd = CommandBuilder::new(&claude);
            cmd.arg("--model");
            cmd.arg(model);
            cmd.env("TERM", "xterm-256color");
            cmd.env("COLORTERM", "truecolor");

            // Pass API key if available.
            if let Some(key) = api_key {
                cmd.env("ANTHROPIC_API_KEY", key);
            }

            // Set working directory.
            if let Some(dir) = working_dir {
                cmd.cwd(dir);
            } else if let Ok(home) = std::env::var("HOME") {
                cmd.cwd(home);
            }

            let cmd_str = format!("{} --model {}", claude.display(), model);
            (cmd, false, cmd_str)
        } else {
            tracing::warn!("Claude CLI not found, falling back to shell");
            let shell = std::env::var("SHELL").unwrap_or_else(|_| "/bin/zsh".to_string());
            let mut cmd = CommandBuilder::new(&shell);
            cmd.env("TERM", "xterm-256color");
            cmd.env("COLORTERM", "truecolor");

            if let Some(dir) = working_dir {
                cmd.cwd(dir);
            } else if let Ok(home) = std::env::var("HOME") {
                cmd.cwd(home);
            }

            let cmd_str = shell.clone();
            (cmd, true, cmd_str)
        };

        let child = pair
            .slave
            .spawn_command(cmd)
            .map_err(|e| ProcessError::SpawnFailed(e.to_string()))?;

        let reader = pair
            .master
            .try_clone_reader()
            .map_err(|e| ProcessError::PtyReadFailed(e.to_string()))?;

        let writer = pair
            .master
            .take_writer()
            .map_err(|e| ProcessError::PtyWriteFailed(e.to_string()))?;

        // Create broadcast channel for output.
        let (output_tx, _) = broadcast::channel(64);

        // Spawn a thread to read PTY output and broadcast it.
        let tx_clone = output_tx.clone();
        let sid = session_id.as_str().to_string();
        std::thread::spawn(move || {
            read_pty_output(reader, tx_clone, sid);
        });

        let managed = ManagedProcess {
            _child: child,
            writer,
            master: pair.master,
            output_tx,
        };

        self.processes.insert(session_id.as_str().to_string(), managed);

        tracing::info!(
            "Spawned process for session {} (command: {}, fallback: {})",
            session_id,
            command_str,
            shell_fallback
        );

        Ok(SpawnResult {
            shell_fallback,
            command: command_str,
        })
    }

    /// Destroy a process (kill it and clean up).
    pub fn destroy(&mut self, session_id: &SessionId) -> Result<(), ProcessError> {
        if let Some(mut process) = self.processes.remove(session_id.as_str()) {
            drop(process.writer);
            drop(process.master);
            if let Err(e) = process._child.kill() {
                tracing::warn!("Failed to kill process for session {}: {}", session_id, e);
            }
            tracing::info!("Destroyed process for session {}", session_id);
            Ok(())
        } else {
            Err(ProcessError::SessionNotFound(session_id.as_str().to_string()))
        }
    }

    /// Write input to a session's PTY.
    pub fn write_input(
        &mut self,
        session_id: &SessionId,
        data: &[u8],
    ) -> Result<(), ProcessError> {
        let process = self
            .processes
            .get_mut(session_id.as_str())
            .ok_or_else(|| ProcessError::SessionNotFound(session_id.as_str().to_string()))?;

        process
            .write_input(data)
            .map_err(|e| ProcessError::WriteFailed(e.to_string()))
    }

    /// Resize a session's PTY.
    pub fn resize(
        &self,
        session_id: &SessionId,
        rows: u16,
        cols: u16,
    ) -> Result<(), ProcessError> {
        let process = self
            .processes
            .get(session_id.as_str())
            .ok_or_else(|| ProcessError::SessionNotFound(session_id.as_str().to_string()))?;

        process
            .resize(rows, cols)
            .map_err(|e| ProcessError::ResizeFailed(e.to_string()))
    }

    /// Subscribe to output from a session's PTY.
    pub fn subscribe_output(
        &self,
        session_id: &SessionId,
    ) -> Result<broadcast::Receiver<Vec<u8>>, ProcessError> {
        let process = self
            .processes
            .get(session_id.as_str())
            .ok_or_else(|| ProcessError::SessionNotFound(session_id.as_str().to_string()))?;

        Ok(process.subscribe_output())
    }

    /// Check if a session has a running process.
    pub fn has_process(&self, session_id: &SessionId) -> bool {
        self.processes.contains_key(session_id.as_str())
    }
}

/// Find the Claude CLI binary on the system.
///
/// Checks: PATH, ~/.claude/local/bin/claude, /usr/local/bin/claude
fn find_claude_binary() -> Option<PathBuf> {
    // Check PATH first via `which`.
    if let Ok(output) = std::process::Command::new("which")
        .arg("claude")
        .output()
    {
        if output.status.success() {
            let path = String::from_utf8_lossy(&output.stdout).trim().to_string();
            if !path.is_empty() {
                let p = PathBuf::from(&path);
                if p.exists() {
                    tracing::debug!("Found claude at: {}", p.display());
                    return Some(p);
                }
            }
        }
    }

    // Check common install locations.
    let candidates = [
        dirs::home_dir()
            .map(|h| h.join(".claude").join("local").join("bin").join("claude")),
        Some(PathBuf::from("/usr/local/bin/claude")),
        Some(PathBuf::from("/opt/homebrew/bin/claude")),
    ];

    for candidate in candidates.into_iter().flatten() {
        if candidate.exists() {
            tracing::debug!("Found claude at: {}", candidate.display());
            return Some(candidate);
        }
    }

    tracing::warn!("Claude CLI not found on system");
    None
}

/// Read PTY output in a blocking thread and broadcast it.
fn read_pty_output(
    mut reader: Box<dyn Read + Send>,
    tx: broadcast::Sender<Vec<u8>>,
    session_id: String,
) {
    let mut buf = [0u8; 4096];
    loop {
        match reader.read(&mut buf) {
            Ok(0) => {
                tracing::info!("PTY EOF for session {}", session_id);
                break;
            }
            Ok(n) => {
                let data = buf[..n].to_vec();
                let _ = tx.send(data);
            }
            Err(e) => {
                tracing::error!("PTY read error for session {}: {}", session_id, e);
                break;
            }
        }
    }
}

/// Errors from process management.
#[derive(Debug, thiserror::Error)]
pub enum ProcessError {
    #[error("Failed to open PTY: {0}")]
    PtyOpenFailed(String),

    #[error("Failed to spawn process: {0}")]
    SpawnFailed(String),

    #[error("Failed to read from PTY: {0}")]
    PtyReadFailed(String),

    #[error("Failed to write to PTY: {0}")]
    PtyWriteFailed(String),

    #[error("Session not found: {0}")]
    SessionNotFound(String),

    #[error("Failed to write input: {0}")]
    WriteFailed(String),

    #[error("Failed to resize: {0}")]
    ResizeFailed(String),

    #[error("Invalid model: {0}. Valid models: opus, sonnet, haiku")]
    InvalidModel(String),
}

/// Thread-safe wrapper for ProcessManager.
pub type SharedProcessManager = Arc<Mutex<ProcessManager>>;

pub fn new_shared_process_manager() -> SharedProcessManager {
    Arc::new(Mutex::new(ProcessManager::new()))
}
