//! Backend error types.

use thiserror::Error;

/// Backend error type.
#[derive(Error, Debug)]
pub enum BackendError {
    /// `SQLite` storage error.
    #[error("Storage error: {0}")]
    Storage(#[from] rusqlite::Error),

    /// Git operation error.
    #[error("Git error: {0}")]
    Git(String),

    /// IO error.
    #[error("IO error: {0}")]
    Io(#[from] std::io::Error),

    /// JSON serialization/deserialization error.
    #[error("Serde error: {0}")]
    Serde(#[from] serde_json::Error),

    /// Invalid parameters.
    #[error("Invalid parameters: {0}")]
    InvalidParams(String),

    /// Protocol error.
    #[error("Protocol error: {0}")]
    Protocol(String),
}
