//! RPC method handlers.

use crate::error::BackendError;
use crate::git_analyzer;
use crate::paths;
use crate::protocol::*;
use crate::ranks;
use crate::storage::Db;
use serde_json::Value;
use std::sync::Arc;

/// Application state shared across handlers.
pub struct AppState {
    pub db: Db,
}

/// Handle a ping request.
pub fn handle_ping(_params: Value, _state: &Arc<AppState>) -> Result<Value, BackendError> {
    Ok(serde_json::json!({}))
}

/// Handle a handshake request.
pub fn handle_handshake(params: Value, _state: &Arc<AppState>) -> Result<Value, BackendError> {
    let p: HandshakeParams = serde_json::from_value(params)
        .map_err(|e| BackendError::InvalidParams(format!("Invalid handshake params: {e}")))?;

    let ok = p.version == PROTOCOL_VERSION;

    let result = HandshakeResult {
        version: PROTOCOL_VERSION,
        ok,
    };

    serde_json::to_value(result).map_err(BackendError::Serde)
}

/// Handle an init_profile request.
pub fn handle_init_profile(params: Value, state: &Arc<AppState>) -> Result<Value, BackendError> {
    let p: InitProfileParams = serde_json::from_value(params)
        .map_err(|e| BackendError::InvalidParams(format!("Invalid init_profile params: {e}")))?;

    let profile = state.db.init_profile(p.name, p.path)?;

    serde_json::to_value(profile).map_err(BackendError::Serde)
}

/// Handle a get_profile request.
pub fn handle_get_profile(_params: Value, state: &Arc<AppState>) -> Result<Value, BackendError> {
    let profile = state.db.get_profile()?;

    serde_json::to_value(profile).map_err(BackendError::Serde)
}

/// Handle a set_path request.
pub fn handle_set_path(params: Value, state: &Arc<AppState>) -> Result<Value, BackendError> {
    let p: SetPathParams = serde_json::from_value(params)
        .map_err(|e| BackendError::InvalidParams(format!("Invalid set_path params: {e}")))?;

    let profile = state.db.set_path(p.path)?;

    serde_json::to_value(profile).map_err(BackendError::Serde)
}

/// Handle an analyze_repo request.
pub fn handle_analyze_repo(params: Value, state: &Arc<AppState>) -> Result<Value, BackendError> {
    let p: AnalyzeRepoParams = serde_json::from_value(params)
        .map_err(|e| BackendError::InvalidParams(format!("Invalid analyze_repo params: {e}")))?;

    // Try to get cached stats
    let cached = state.db.get_repo_stats(&p.path)?;

    let stats = if let Some(cached_stats) = cached {
        // We have cached data
        if let (Some(last_seen_sha), Some(current_sha)) = (
            &cached_stats.last_seen_sha,
            git_analyzer::get_head_sha(&p.path).ok(),
        ) {
            // Try to count new commits since the last seen SHA
            match git_analyzer::count_commits_since(&p.path, last_seen_sha) {
                Ok(new_commits) => {
                    let total = cached_stats.total_commits + new_commits;
                    let repo_name = extract_repo_name(&p.path);

                    // Update cache
                    state.db.update_repo_stats(
                        &p.path,
                        repo_name,
                        total,
                        Some(current_sha.clone()),
                    )?;

                    RepoStats {
                        total_commits: total,
                        current_branch: None, // Will be filled below
                        last_seen_sha: Some(current_sha),
                    }
                }
                Err(_) => {
                    // Fallback to full analysis
                    analyze_repo_fallback(&p.path, &state.db)
                }
            }
        } else {
            // No last_seen_sha or couldn't get current SHA, do full analysis
            analyze_repo_fallback(&p.path, &state.db)
        }
    } else {
        // No cache, do full analysis
        analyze_repo_fallback(&p.path, &state.db)
    };

    // Get the current branch
    let current_branch = match git2::Repository::open(&p.path) {
        Ok(repo) => match repo.head() {
            Ok(head) => head.shorthand().map(std::string::ToString::to_string),
            Err(_) => None,
        },
        Err(_) => None,
    };

    let stats = RepoStats {
        current_branch,
        ..stats
    };

    serde_json::to_value(stats).map_err(BackendError::Serde)
}

/// Analyze a repo and cache the results.
fn analyze_repo_fallback(repo_path: &str, db: &Db) -> RepoStats {
    // Try git2 first
    let result = git_analyzer::analyze_repo(repo_path);

    let stats = if let Ok(stats) = result {
        stats
    } else {
        // Fallback to git command-line
        let total_commits = git_analyzer::count_commits_fallback(repo_path).unwrap_or_default();

        let current_sha = git_analyzer::get_head_sha(repo_path).ok();

        RepoStats {
            total_commits,
            current_branch: None,
            last_seen_sha: current_sha,
        }
    };

    // Cache the results
    let repo_name = extract_repo_name(repo_path);
    let _ = db.update_repo_stats(
        repo_path,
        repo_name,
        stats.total_commits,
        stats.last_seen_sha.clone(),
    );

    stats
}

/// Handle a get_rank request.
pub fn handle_get_rank(params: Value, _state: &Arc<AppState>) -> Result<Value, BackendError> {
    let p: GetRankParams = serde_json::from_value(params)
        .map_err(|e| BackendError::InvalidParams(format!("Invalid get_rank params: {e}")))?;

    let rank_info = ranks::rank_for(p.total_commits);

    serde_json::to_value(rank_info).map_err(BackendError::Serde)
}

/// Handle a record_event request.
pub fn handle_record_event(params: Value, state: &Arc<AppState>) -> Result<Value, BackendError> {
    let p: RecordEventParams = serde_json::from_value(params)
        .map_err(|e| BackendError::InvalidParams(format!("Invalid record_event params: {e}")))?;

    state.db.record_event(&p.repo_path, p.op, p.sha)?;

    Ok(serde_json::json!({}))
}

/// Handle a get_message_templates request.
pub fn handle_get_message_templates(
    params: Value,
    _state: &Arc<AppState>,
) -> Result<Value, BackendError> {
    let p: GetMessageTemplatesParams = serde_json::from_value(params).map_err(|e| {
        BackendError::InvalidParams(format!("Invalid get_message_templates params: {e}"))
    })?;

    let templates = paths::message_templates(p.path);

    serde_json::to_value(templates).map_err(BackendError::Serde)
}

/// Extract the repository name from a path.
fn extract_repo_name(path: &str) -> String {
    if let Some(last) = std::path::PathBuf::from(path).file_name() {
        last.to_string_lossy().to_string()
    } else {
        path.to_string()
    }
}
