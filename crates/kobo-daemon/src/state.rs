use std::collections::HashMap;
use std::fs;
use std::io::Write;
use std::path::Path;

use serde::{Deserialize, Serialize};
use tracing;

use kobo_core::types::{Session, SessionId};

/// Persistent state for the daemon.
#[derive(Debug, Clone, Default, Serialize, Deserialize)]
pub struct DaemonState {
    /// Active sessions tracked by the daemon.
    pub sessions: HashMap<String, Session>,
}

impl DaemonState {
    /// Create a new empty state.
    pub fn new() -> Self {
        Self::default()
    }

    /// Save state to disk atomically.
    ///
    /// Writes to a temporary file first, then renames to avoid corruption
    /// if the process crashes mid-write.
    pub fn save(&self, path: &Path) -> Result<(), StateError> {
        let json =
            serde_json::to_string_pretty(self).map_err(|e| StateError::SerializeFailed(e))?;

        // Write to a temp file in the same directory (for atomic rename).
        let tmp_path = path.with_extension("json.tmp");

        let mut file = fs::File::create(&tmp_path).map_err(|e| StateError::IoError {
            path: tmp_path.clone(),
            source: e,
        })?;

        file.write_all(json.as_bytes())
            .map_err(|e| StateError::IoError {
                path: tmp_path.clone(),
                source: e,
            })?;

        file.sync_all().map_err(|e| StateError::IoError {
            path: tmp_path.clone(),
            source: e,
        })?;

        // Atomic rename.
        fs::rename(&tmp_path, path).map_err(|e| StateError::IoError {
            path: path.to_path_buf(),
            source: e,
        })?;

        tracing::debug!("State saved to {}", path.display());
        Ok(())
    }

    /// Load state from disk.
    ///
    /// If the file is missing or corrupt, returns a default empty state
    /// with a warning log.
    pub fn load(path: &Path) -> Result<Self, StateError> {
        if !path.exists() {
            tracing::debug!("No state file at {}, starting fresh", path.display());
            return Ok(Self::default());
        }

        let contents = fs::read_to_string(path).map_err(|e| StateError::IoError {
            path: path.to_path_buf(),
            source: e,
        })?;

        let state: Self = serde_json::from_str(&contents).map_err(|e| {
            tracing::warn!(
                "Corrupt state file at {}: {}, starting fresh",
                path.display(),
                e
            );
            StateError::DeserializeFailed(e)
        })?;

        tracing::info!(
            "Loaded state from {} ({} sessions)",
            path.display(),
            state.sessions.len()
        );

        Ok(state)
    }

    /// Add a session to the state.
    pub fn add_session(&mut self, session: Session) {
        self.sessions.insert(session.id.0.clone(), session);
    }

    /// Remove a session from the state.
    pub fn remove_session(&mut self, id: &SessionId) -> Option<Session> {
        self.sessions.remove(&id.0)
    }

    /// Get a session by ID.
    pub fn get_session(&self, id: &SessionId) -> Option<&Session> {
        self.sessions.get(&id.0)
    }
}

/// Errors related to state persistence.
#[derive(Debug, thiserror::Error)]
pub enum StateError {
    #[error("I/O error with state file {path}: {source}")]
    IoError {
        path: std::path::PathBuf,
        source: std::io::Error,
    },

    #[error("Failed to serialize state: {0}")]
    SerializeFailed(serde_json::Error),

    #[error("Failed to deserialize state: {0}")]
    DeserializeFailed(serde_json::Error),
}

#[cfg(test)]
mod tests {
    use super::*;
    use chrono::Utc;
    use kobo_core::types::SessionStatus;
    use tempfile::TempDir;

    fn make_session(id: &str, name: &str) -> Session {
        Session {
            id: SessionId::new(id),
            name: name.to_string(),
            model: "sonnet".to_string(),
            status: SessionStatus::Active,
            created_at: Utc::now(),
            updated_at: Utc::now(),
        }
    }

    #[test]
    fn test_save_and_load() {
        let tmp = TempDir::new().unwrap();
        let state_path = tmp.path().join("state.json");

        let mut state = DaemonState::new();
        state.add_session(make_session("s1", "Test Session 1"));
        state.add_session(make_session("s2", "Test Session 2"));

        // Save
        state.save(&state_path).unwrap();
        assert!(state_path.exists());

        // Load
        let loaded = DaemonState::load(&state_path).unwrap();
        assert_eq!(loaded.sessions.len(), 2);
        assert!(loaded.sessions.contains_key("s1"));
        assert!(loaded.sessions.contains_key("s2"));
    }

    #[test]
    fn test_load_missing_file() {
        let tmp = TempDir::new().unwrap();
        let state_path = tmp.path().join("nonexistent.json");

        let state = DaemonState::load(&state_path).unwrap();
        assert!(state.sessions.is_empty());
    }

    #[test]
    fn test_load_corrupt_file() {
        let tmp = TempDir::new().unwrap();
        let state_path = tmp.path().join("state.json");

        fs::write(&state_path, "this is not json").unwrap();

        let result = DaemonState::load(&state_path);
        assert!(result.is_err());
    }

    #[test]
    fn test_atomic_save_uses_temp_file() {
        let tmp = TempDir::new().unwrap();
        let state_path = tmp.path().join("state.json");
        let tmp_path = state_path.with_extension("json.tmp");

        let state = DaemonState::new();
        state.save(&state_path).unwrap();

        // After save, temp file should not exist (it was renamed).
        assert!(!tmp_path.exists());
        // But the state file should exist.
        assert!(state_path.exists());
    }

    #[test]
    fn test_add_remove_session() {
        let mut state = DaemonState::new();

        let session = make_session("s1", "Test");
        state.add_session(session);
        assert_eq!(state.sessions.len(), 1);

        let removed = state.remove_session(&SessionId::new("s1"));
        assert!(removed.is_some());
        assert!(state.sessions.is_empty());
    }
}
