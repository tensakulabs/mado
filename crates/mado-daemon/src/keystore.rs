use tracing;

const SERVICE_NAME: &str = "mado";
const USERNAME: &str = "anthropic-api-key";

/// Secure storage for API keys using the OS keychain (macOS Keychain / Linux libsecret).
pub struct KeyStore;

impl KeyStore {
    /// Get the Anthropic API key.
    ///
    /// Checks the OS keychain first, then falls back to the ANTHROPIC_API_KEY environment variable.
    pub fn get_api_key() -> Result<String, KeyStoreError> {
        // Try OS keychain first.
        match keyring::Entry::new(SERVICE_NAME, USERNAME) {
            Ok(entry) => match entry.get_password() {
                Ok(key) => {
                    tracing::debug!("API key loaded from OS keychain");
                    return Ok(key);
                }
                Err(keyring::Error::NoEntry) => {
                    tracing::debug!("No API key in OS keychain, checking env var");
                }
                Err(e) => {
                    tracing::warn!("Failed to read from keychain: {}", e);
                }
            },
            Err(e) => {
                tracing::warn!("Failed to access keychain: {}", e);
            }
        }

        // Fall back to environment variable.
        match std::env::var("ANTHROPIC_API_KEY") {
            Ok(key) if !key.is_empty() => {
                tracing::debug!("API key loaded from ANTHROPIC_API_KEY env var");
                Ok(key)
            }
            _ => Err(KeyStoreError::NotFound),
        }
    }

    /// Store the Anthropic API key in the OS keychain.
    pub fn set_api_key(key: &str) -> Result<(), KeyStoreError> {
        if key.is_empty() {
            return Err(KeyStoreError::InvalidKey("API key cannot be empty".into()));
        }

        let entry = keyring::Entry::new(SERVICE_NAME, USERNAME)
            .map_err(|e| KeyStoreError::KeychainError(e.to_string()))?;

        entry
            .set_password(key)
            .map_err(|e| KeyStoreError::KeychainError(e.to_string()))?;

        tracing::info!("API key stored in OS keychain");
        Ok(())
    }

    /// Delete the Anthropic API key from the OS keychain.
    pub fn delete_api_key() -> Result<(), KeyStoreError> {
        let entry = keyring::Entry::new(SERVICE_NAME, USERNAME)
            .map_err(|e| KeyStoreError::KeychainError(e.to_string()))?;

        match entry.delete_credential() {
            Ok(()) => {
                tracing::info!("API key deleted from OS keychain");
                Ok(())
            }
            Err(keyring::Error::NoEntry) => {
                // Already gone, that's fine.
                Ok(())
            }
            Err(e) => Err(KeyStoreError::KeychainError(e.to_string())),
        }
    }

    /// Check if an API key is available (either keychain or env var).
    pub fn has_api_key() -> bool {
        Self::get_api_key().is_ok()
    }
}

/// Errors from key storage operations.
#[derive(Debug, thiserror::Error)]
pub enum KeyStoreError {
    #[error("No API key found. Set one in the app or export ANTHROPIC_API_KEY.")]
    NotFound,

    #[error("Invalid API key: {0}")]
    InvalidKey(String),

    #[error("Keychain error: {0}")]
    KeychainError(String),
}
