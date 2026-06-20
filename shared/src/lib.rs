//! Akatsuki Git shared protocol — the single source of truth.
//!
//! This crate defines the JSON-RPC 2.0 protocol exchanged over stdio between
//! the VS Code extension (TypeScript) and the `akatsuki-backend` Rust binary.
//!
//! # Keep in sync
//! `shared/ts/protocol.ts` is a **hand-mirrored** copy of these types.
//! When you change anything in this file you MUST:
//!   1. Update `shared/ts/protocol.ts` to match.
//!   2. Bump [`PROTOCOL_VERSION`] if the change is breaking.
//!   3. The backend refuses mismatched versions at handshake (see `main.rs`).
//!
//! Replacing this mirror with `ts-rs` codegen is tracked in `docs/ROADMAP.md`.

use std::collections::HashMap;

use serde::{Deserialize, Serialize};

/// Bump on any *breaking* protocol change. Both sides must agree at handshake.
pub const PROTOCOL_VERSION: u32 = 1;

// ===========================================================================
// JSON-RPC 2.0 framing
// ===========================================================================

/// A request or notification id: a number or a string (never null for requests).
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq, Hash)]
#[serde(untagged)]
pub enum RpcId {
    Num(i64),
    Str(String),
}

/// An incoming request or notification. `id == None` means notification.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct RpcRequest {
    pub jsonrpc: String,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub id: Option<RpcId>,
    pub method: String,
    /// Raw params; handlers deserialize this into concrete param structs.
    /// Defaults to `Value::Null` when omitted (JSON-RPC permits omitting params).
    #[serde(default)]
    pub params: serde_json::Value,
}

/// An outgoing response (success or error, never both).
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct RpcResponse {
    pub jsonrpc: String,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub id: Option<RpcId>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub result: Option<serde_json::Value>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub error: Option<RpcError>,
}

impl RpcResponse {
    pub fn success(id: Option<RpcId>, result: serde_json::Value) -> Self {
        Self {
            jsonrpc: "2.0".to_string(),
            id,
            result: Some(result),
            error: None,
        }
    }

    pub fn error(id: Option<RpcId>, code: i32, message: impl Into<String>) -> Self {
        Self {
            jsonrpc: "2.0".to_string(),
            id,
            result: None,
            error: Some(RpcError {
                code,
                message: message.into(),
                data: None,
            }),
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct RpcError {
    pub code: i32,
    pub message: String,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub data: Option<serde_json::Value>,
}

/// JSON-RPC error codes (subset, server-defined negative range).
pub mod error_codes {
    pub const PARSE_ERROR: i32 = -32700;
    pub const INVALID_REQUEST: i32 = -32600;
    pub const METHOD_NOT_FOUND: i32 = -32601;
    pub const INVALID_PARAMS: i32 = -32602;
    pub const INTERNAL_ERROR: i32 = -32603;
    /// Application error (non-negative range owned by us).
    pub const PROTOCOL_VERSION_MISMATCH: i32 = 1;
    pub const GIT_ERROR: i32 = 2;
    pub const STORAGE_ERROR: i32 = 3;
    pub const INVALID_PATH: i32 = 4;
}

// ===========================================================================
// Method names
// ===========================================================================

pub mod methods {
    // Requests (extension -> backend)
    pub const PING: &str = "ping";
    pub const HANDSHAKE: &str = "handshake";
    pub const INIT_PROFILE: &str = "init_profile";
    pub const GET_PROFILE: &str = "get_profile";
    pub const SET_PATH: &str = "set_path";
    pub const ANALYZE_REPO: &str = "analyze_repo";
    pub const GET_RANK: &str = "get_rank";
    pub const RECORD_EVENT: &str = "record_event";
    pub const GET_MESSAGE_TEMPLATES: &str = "get_message_templates";

    // Notifications (backend -> extension)
    pub const NOTIFY_INITIALIZED: &str = "initialized";
    pub const NOTIFY_RANK_CHANGED: &str = "rank_changed";
}

// ===========================================================================
// Domain types
// ===========================================================================

/// The four character paths. Chosen once at onboarding.
#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq, Eq, Hash)]
#[serde(rename_all = "lowercase")]
pub enum CharacterPath {
    Itachi,
    Pain,
    Obito,
    Madara,
}

impl CharacterPath {
    /// All paths in QuickPick display order.
    pub const ALL: [CharacterPath; 4] = [
        CharacterPath::Itachi,
        CharacterPath::Pain,
        CharacterPath::Obito,
        CharacterPath::Madara,
    ];

    /// Display label for the QuickPick.
    #[must_use]
    pub fn label(self) -> &'static str {
        match self {
            CharacterPath::Itachi => "Itachi — The Sacrifice",
            CharacterPath::Pain => "Pain — The Conviction",
            CharacterPath::Obito => "Obito — The Vision",
            CharacterPath::Madara => "Madara — The Ambition",
        }
    }

    /// Short description shown under the label.
    #[must_use]
    pub fn description(self) -> &'static str {
        match self {
            CharacterPath::Itachi => "Calm, measured, willing to bear the cost.",
            CharacterPath::Pain => "Relentless; growth forged through hardship.",
            CharacterPath::Obito => "Bends reality toward a chosen future.",
            CharacterPath::Madara => "Unapologetic drive toward absolute power.",
        }
    }

    /// Suffix appended to a completion message for this path.
    #[must_use]
    pub fn suffix(self) -> &'static str {
        match self {
            CharacterPath::Itachi => "Every growth requires sacrifice.",
            CharacterPath::Pain => "Through pain comes progress.",
            CharacterPath::Obito => "Reality has been corrected.",
            CharacterPath::Madara => "Your ambition grows stronger.",
        }
    }

    /// Stable snake_case key matching the serde representation.
    #[must_use]
    pub fn key(self) -> &'static str {
        match self {
            CharacterPath::Itachi => "itachi",
            CharacterPath::Pain => "pain",
            CharacterPath::Obito => "obito",
            CharacterPath::Madara => "madara",
        }
    }
}

impl CharacterPath {
    /// Parse from a snake_case key; used when reading stale persisted state.
    #[must_use]
    pub fn from_key(key: &str) -> Option<Self> {
        match key {
            "itachi" => Some(Self::Itachi),
            "pain" => Some(Self::Pain),
            "obito" => Some(Self::Obito),
            "madara" => Some(Self::Madara),
            _ => None,
        }
    }
}

/// The git operation that triggered a themed message.
#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq, Eq, Hash)]
#[serde(rename_all = "snake_case")]
pub enum GitOp {
    Commit,
    Push,
    Pull,
    Merge,
    MergeConflict,
}

impl GitOp {
    /// Stable snake_case key used as the HashMap key for message templates.
    #[must_use]
    pub fn key(self) -> &'static str {
        match self {
            GitOp::Commit => "commit",
            GitOp::Push => "push",
            GitOp::Pull => "pull",
            GitOp::Merge => "merge",
            GitOp::MergeConflict => "merge_conflict",
        }
    }
}

/// The singleton user profile.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Profile {
    pub name: String,
    pub path: CharacterPath,
    /// Unix timestamp in milliseconds.
    pub created_at: i64,
}

/// Statistics computed for a repository.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct RepoStats {
    pub total_commits: u64,
    /// `None` when the HEAD is detached or the branch name can't be read.
    pub current_branch: Option<String>,
    pub last_seen_sha: Option<String>,
}

/// Rank information returned by `get_rank`.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct RankInfo {
    /// Human-readable label, e.g. "Chunin".
    pub rank: String,
    /// Stable snake_case key, e.g. "chunin".
    pub rank_key: String,
    /// The commit count the rank was computed from.
    pub current: u64,
    /// Floor of the next rank (`None` at the maximum rank).
    pub next_threshold: Option<u64>,
    /// Progress toward the next rank, clamped to `[0.0, 1.0]`.
    pub progress: f64,
}

/// A themed message pair shown during/after a git operation.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct MessageTemplate {
    /// Shown while the operation is in flight (progress notification).
    pub in_flight: String,
    /// Shown on completion.
    pub completion: String,
}

// ===========================================================================
// Request params
// ===========================================================================

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct HandshakeParams {
    pub version: u32,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct HandshakeResult {
    pub version: u32,
    pub ok: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct InitProfileParams {
    pub name: String,
    pub path: CharacterPath,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SetPathParams {
    pub path: CharacterPath,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AnalyzeRepoParams {
    pub path: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct GetRankParams {
    pub total_commits: u64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct RecordEventParams {
    pub repo_path: String,
    pub op: GitOp,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub sha: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct GetMessageTemplatesParams {
    pub path: CharacterPath,
}

/// Result of `get_message_templates`: op-key → template (completion text
/// already suffixed with the chosen path's wisdom).
pub type MessageTemplates = HashMap<String, MessageTemplate>;

// ===========================================================================
// Notification payloads
// ===========================================================================

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct RankChangedParams {
    pub repo_path: String,
    pub old: String,
    pub new: String,
}
