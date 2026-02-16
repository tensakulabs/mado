use std::fs;
use std::io::{Read, Write};
use std::path::{Path, PathBuf};

use tracing;

/// Errors related to PID file management.
#[derive(Debug, thiserror::Error)]
pub enum PidError {
    #[error("Another daemon is already running (pid: {pid})")]
    AlreadyRunning { pid: u32 },

    #[error("I/O error with PID file {path}: {source}")]
    IoError {
        path: PathBuf,
        source: std::io::Error,
    },

    #[error("Invalid PID file content at {path}: {reason}")]
    InvalidPidFile { path: PathBuf, reason: String },
}

/// A handle to a PID file. Automatically removes the PID file when dropped.
#[derive(Debug)]
pub struct PidFile {
    path: PathBuf,
}

impl PidFile {
    /// Acquire a PID file at the given path.
    ///
    /// If a PID file already exists:
    /// - If the process is alive, returns `Err(PidError::AlreadyRunning)`.
    /// - If the process is dead (stale PID), cleans up the stale PID file and
    ///   optionally the stale socket file, then acquires the PID file.
    pub fn acquire(path: impl Into<PathBuf>, socket_path: Option<&Path>) -> Result<Self, PidError> {
        let path = path.into();

        if path.exists() {
            let existing_pid = Self::read_pid(&path)?;

            if is_process_alive(existing_pid) {
                return Err(PidError::AlreadyRunning { pid: existing_pid });
            }

            // Stale PID file -- process is dead.
            tracing::warn!(
                "Found stale PID file for dead process {} at {}, cleaning up",
                existing_pid,
                path.display()
            );
            let _ = fs::remove_file(&path);

            // Also clean up stale socket file if it exists.
            if let Some(sock) = socket_path {
                if sock.exists() {
                    tracing::warn!(
                        "Removing stale socket file: {}",
                        sock.display()
                    );
                    let _ = fs::remove_file(sock);
                }
            }
        }

        // Write current PID.
        let pid = std::process::id();
        Self::write_pid(&path, pid)?;

        tracing::info!("PID file created: {} (pid: {})", path.display(), pid);

        Ok(Self { path })
    }

    /// Update the PID file with a new PID (used after daemonization when the
    /// PID changes due to fork).
    pub fn update_pid(&self, new_pid: u32) -> Result<(), PidError> {
        Self::write_pid(&self.path, new_pid)
    }

    /// Get the path to the PID file.
    pub fn path(&self) -> &Path {
        &self.path
    }

    /// Read the PID from a PID file.
    fn read_pid(path: &Path) -> Result<u32, PidError> {
        let mut file = fs::File::open(path).map_err(|e| PidError::IoError {
            path: path.to_path_buf(),
            source: e,
        })?;

        let mut contents = String::new();
        file.read_to_string(&mut contents)
            .map_err(|e| PidError::IoError {
                path: path.to_path_buf(),
                source: e,
            })?;

        contents
            .trim()
            .parse::<u32>()
            .map_err(|_| PidError::InvalidPidFile {
                path: path.to_path_buf(),
                reason: format!("Cannot parse '{}' as PID", contents.trim()),
            })
    }

    /// Write a PID to a PID file.
    fn write_pid(path: &Path, pid: u32) -> Result<(), PidError> {
        let mut file = fs::File::create(path).map_err(|e| PidError::IoError {
            path: path.to_path_buf(),
            source: e,
        })?;

        write!(file, "{}", pid).map_err(|e| PidError::IoError {
            path: path.to_path_buf(),
            source: e,
        })?;

        Ok(())
    }
}

impl Drop for PidFile {
    fn drop(&mut self) {
        if self.path.exists() {
            match fs::remove_file(&self.path) {
                Ok(()) => {
                    tracing::info!("PID file removed: {}", self.path.display());
                }
                Err(e) => {
                    tracing::error!(
                        "Failed to remove PID file {}: {}",
                        self.path.display(),
                        e
                    );
                }
            }
        }
    }
}

/// Check if a process with the given PID is still alive.
///
/// Uses `kill(pid, 0)` which checks if the process exists without
/// actually sending a signal.
pub fn is_process_alive(pid: u32) -> bool {
    // Safety: kill with signal 0 just checks process existence.
    unsafe { libc::kill(pid as i32, 0) == 0 }
}

#[cfg(test)]
mod tests {
    use super::*;
    use tempfile::TempDir;

    #[test]
    fn test_acquire_and_drop() {
        let tmp = TempDir::new().unwrap();
        let pid_path = tmp.path().join("test.pid");

        {
            let pid_file = PidFile::acquire(&pid_path, None).unwrap();
            assert!(pid_path.exists());

            // Read the file and verify it contains our PID.
            let contents = fs::read_to_string(&pid_path).unwrap();
            let stored_pid: u32 = contents.trim().parse().unwrap();
            assert_eq!(stored_pid, std::process::id());

            drop(pid_file);
        }

        // After drop, the file should be removed.
        assert!(!pid_path.exists());
    }

    #[test]
    fn test_acquire_blocks_duplicate() {
        let tmp = TempDir::new().unwrap();
        let pid_path = tmp.path().join("test.pid");

        let _pid_file = PidFile::acquire(&pid_path, None).unwrap();

        // Second acquire should fail because our process is still alive.
        match PidFile::acquire(&pid_path, None) {
            Err(PidError::AlreadyRunning { pid }) => {
                assert_eq!(pid, std::process::id());
            }
            other => panic!("Expected AlreadyRunning, got: {:?}", other),
        }
    }

    #[test]
    fn test_stale_pid_cleanup() {
        let tmp = TempDir::new().unwrap();
        let pid_path = tmp.path().join("test.pid");
        let sock_path = tmp.path().join("test.sock");

        // Write a PID that doesn't belong to any running process.
        // PID 99999999 should not exist.
        fs::write(&pid_path, "99999999").unwrap();
        fs::write(&sock_path, "stale").unwrap();

        // Acquire should succeed after cleaning up the stale PID.
        let pid_file = PidFile::acquire(&pid_path, Some(&sock_path)).unwrap();

        // Stale socket should be cleaned up.
        assert!(!sock_path.exists());

        // The PID file should contain our actual PID now.
        let contents = fs::read_to_string(&pid_path).unwrap();
        let stored_pid: u32 = contents.trim().parse().unwrap();
        assert_eq!(stored_pid, std::process::id());

        drop(pid_file);
    }

    #[test]
    fn test_invalid_pid_file() {
        let tmp = TempDir::new().unwrap();
        let pid_path = tmp.path().join("test.pid");

        // Write garbage content.
        fs::write(&pid_path, "not_a_number").unwrap();

        match PidFile::acquire(&pid_path, None) {
            Err(PidError::InvalidPidFile { .. }) => {}
            other => panic!("Expected InvalidPidFile, got: {:?}", other),
        }
    }

    #[test]
    fn test_is_process_alive() {
        // Our own PID should be alive.
        assert!(is_process_alive(std::process::id()));

        // A very large PID should not exist.
        assert!(!is_process_alive(99999999));
    }
}
