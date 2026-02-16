//! Mado configuration management.
//!
//! Stores app settings in ~/.mado/config.json.
//! API keys are NOT stored here — they use the OS keychain.

use serde::{Deserialize, Serialize};
use std::fs;
use std::path::PathBuf;
use tracing;

/// Configuration version for migrations.
const CONFIG_VERSION: u32 = 1;

/// Get the Mado config directory (~/.mado/).
pub fn config_dir() -> PathBuf {
    dirs::home_dir()
        .expect("Could not determine home directory")
        .join(".mado")
}

/// Get the config file path (~/.mado/config.json).
pub fn config_path() -> PathBuf {
    config_dir().join("config.json")
}

/// UI-related settings.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct UiConfig {
    /// Color theme preset: "dark", "light", "midnight", "forest".
    #[serde(default = "default_theme")]
    pub theme: String,

    /// Display size as percentage (50-200, default 100).
    #[serde(default = "default_zoom_level")]
    pub zoom_level: u32,

    /// Whether to show expanded tool calls (default false = compact view).
    #[serde(default)]
    pub show_tool_calls: bool,

    /// Custom display name for the user (overrides system name).
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub user_name: Option<String>,

    /// Custom display name for the AI assistant.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub ai_name: Option<String>,
}

fn default_theme() -> String {
    "dark".to_string()
}

fn default_zoom_level() -> u32 {
    100
}

impl Default for UiConfig {
    fn default() -> Self {
        Self {
            theme: default_theme(),
            zoom_level: default_zoom_level(),
            show_tool_calls: false,
            user_name: None,
            ai_name: None,
        }
    }
}

/// Main Mado configuration.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct MadoConfig {
    /// Config schema version for future migrations.
    #[serde(default = "default_version")]
    pub version: u32,

    /// Selected AI provider (e.g., "claude", "gpt", "gemini").
    #[serde(default = "default_provider")]
    pub provider: String,

    /// Authentication method: "cli" (subscription login) or "api_key" (API token).
    #[serde(default = "default_auth_method")]
    pub auth_method: String,

    /// Default model to use (e.g., "sonnet", "opus", "haiku").
    #[serde(default = "default_model")]
    pub default_model: String,

    /// Whether onboarding/setup has been completed.
    #[serde(default)]
    pub setup_complete: bool,

    /// UI settings.
    #[serde(default)]
    pub ui: UiConfig,
}

fn default_version() -> u32 {
    CONFIG_VERSION
}

fn default_provider() -> String {
    "claude".to_string()
}

fn default_auth_method() -> String {
    "cli".to_string()
}

fn default_model() -> String {
    "sonnet".to_string()
}

impl Default for MadoConfig {
    fn default() -> Self {
        Self {
            version: CONFIG_VERSION,
            provider: default_provider(),
            auth_method: default_auth_method(),
            default_model: default_model(),
            setup_complete: false,
            ui: UiConfig::default(),
        }
    }
}

impl MadoConfig {
    /// Load config from ~/.mado/config.json.
    /// Creates default config if file doesn't exist.
    pub fn load() -> Result<Self, ConfigError> {
        let path = config_path();

        if !path.exists() {
            tracing::info!("Config file not found, creating default at {:?}", path);
            let config = Self::default();
            config.save()?;
            return Ok(config);
        }

        let contents = fs::read_to_string(&path)
            .map_err(|e| ConfigError::ReadError(e.to_string()))?;

        let config: Self = serde_json::from_str(&contents)
            .map_err(|e| ConfigError::ParseError(e.to_string()))?;

        tracing::debug!("Loaded config from {:?}", path);
        Ok(config)
    }

    /// Save config to ~/.mado/config.json.
    pub fn save(&self) -> Result<(), ConfigError> {
        let dir = config_dir();
        if !dir.exists() {
            fs::create_dir_all(&dir)
                .map_err(|e| ConfigError::WriteError(e.to_string()))?;
        }

        let path = config_path();
        let contents = serde_json::to_string_pretty(self)
            .map_err(|e| ConfigError::SerializeError(e.to_string()))?;

        fs::write(&path, contents)
            .map_err(|e| ConfigError::WriteError(e.to_string()))?;

        tracing::debug!("Saved config to {:?}", path);
        Ok(())
    }

    /// Update a single field and save.
    pub fn update<F>(&mut self, f: F) -> Result<(), ConfigError>
    where
        F: FnOnce(&mut Self),
    {
        f(self);
        self.save()
    }
}

/// Config-related errors.
#[derive(Debug, thiserror::Error)]
pub enum ConfigError {
    #[error("Failed to read config: {0}")]
    ReadError(String),

    #[error("Failed to parse config: {0}")]
    ParseError(String),

    #[error("Failed to serialize config: {0}")]
    SerializeError(String),

    #[error("Failed to write config: {0}")]
    WriteError(String),
}
