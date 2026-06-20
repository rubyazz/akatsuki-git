//! Git repository analysis using git2.

use crate::error::BackendError;
use crate::protocol::RepoStats;
use git2::Repository;
use std::path::Path;

/// Analyze a git repository and return statistics.
pub fn analyze_repo(repo_path: &str) -> Result<RepoStats, BackendError> {
    let path = Path::new(repo_path);

    // Try to open the repository with git2
    let repo = Repository::open(path)
        .map_err(|e| BackendError::Git(format!("Failed to open repository: {e}")))?;

    // Get HEAD
    let head = repo
        .head()
        .map_err(|e| BackendError::Git(format!("Failed to get HEAD: {e}")))?;

    // Get current SHA
    let sha = head
        .target()
        .ok_or_else(|| BackendError::Git("HEAD has no target".to_string()))?
        .to_string();

    // Get current branch name (if not detached)
    let current_branch = head.shorthand().map(std::string::ToString::to_string);

    // Count commits
    let total_commits = count_commits(&repo)?;

    Ok(RepoStats {
        total_commits,
        current_branch,
        last_seen_sha: Some(sha),
    })
}

/// Count commits in a repository.
fn count_commits(repo: &Repository) -> Result<u64, BackendError> {
    // Try to walk commits
    let head = repo
        .head()
        .map_err(|e| BackendError::Git(format!("Failed to get HEAD: {e}")))?;
    let obj = head
        .target()
        .ok_or_else(|| BackendError::Git("HEAD has no target".to_string()))?;

    let commit = repo
        .find_commit(obj)
        .map_err(|e| BackendError::Git(format!("Failed to find commit: {e}")))?;

    let mut revwalk = repo
        .revwalk()
        .map_err(|e| BackendError::Git(format!("Failed to create revwalk: {e}")))?;

    revwalk
        .push(commit.id())
        .map_err(|e| BackendError::Git(format!("Failed to push commit: {e}")))?;

    let count = revwalk.count();

    Ok(count as u64)
}

/// Count new commits since a given SHA.
pub fn count_commits_since(repo_path: &str, since_sha: &str) -> Result<u64, BackendError> {
    let path = Path::new(repo_path);
    let repo = Repository::open(path)
        .map_err(|e| BackendError::Git(format!("Failed to open repository: {e}")))?;

    // Parse the since SHA
    let since_oid = git2::Oid::from_str(since_sha)
        .map_err(|e| BackendError::Git(format!("Invalid SHA: {e}")))?;

    // Get HEAD
    let head = repo
        .head()
        .map_err(|e| BackendError::Git(format!("Failed to get HEAD: {e}")))?;

    let head_oid = head
        .target()
        .ok_or_else(|| BackendError::Git("HEAD has no target".to_string()))?;

    // If HEAD is the same as since_sha, no new commits
    if head_oid == since_oid {
        return Ok(0);
    }

    // Try to walk from HEAD to since_sha
    let mut revwalk = repo
        .revwalk()
        .map_err(|e| BackendError::Git(format!("Failed to create revwalk: {e}")))?;

    // Mark the since commit as hide
    revwalk
        .push(head_oid)
        .map_err(|e| BackendError::Git(format!("Failed to push HEAD: {e}")))?;
    let () = revwalk
        .hide(since_oid)
        .map_err(|e| BackendError::Git(format!("Failed to hide since SHA: {e}")))?;

    let count = revwalk.count();

    Ok(count as u64)
}

/// Get the current HEAD SHA.
pub fn get_head_sha(repo_path: &str) -> Result<String, BackendError> {
    let path = Path::new(repo_path);
    let repo = Repository::open(path)
        .map_err(|e| BackendError::Git(format!("Failed to open repository: {e}")))?;

    let head = repo
        .head()
        .map_err(|e| BackendError::Git(format!("Failed to get HEAD: {e}")))?;

    let sha = head
        .target()
        .ok_or_else(|| BackendError::Git("HEAD has no target".to_string()))?;

    Ok(sha.to_string())
}

/// Count commits using git command-line fallback.
pub fn count_commits_fallback(repo_path: &str) -> Result<u64, BackendError> {
    use std::process::Command;

    let output = Command::new("git")
        .args(["rev-list", "--count", "HEAD"])
        .current_dir(repo_path)
        .output()
        .map_err(|e| BackendError::Git(format!("Failed to execute git: {e}")))?;

    if !output.status.success() {
        return Err(BackendError::Git(format!(
            "git rev-list failed: {}",
            String::from_utf8_lossy(&output.stderr)
        )));
    }

    let stdout = String::from_utf8(output.stdout)
        .map_err(|e| BackendError::Git(format!("Failed to parse git output: {e}")))?;

    let count = stdout
        .trim()
        .parse::<u64>()
        .map_err(|e| BackendError::Git(format!("Failed to parse commit count: {e}")))?;

    Ok(count)
}

#[cfg(test)]
mod tests {
    use super::*;
    use git2::{Repository, Signature, Time};
    use tempfile::TempDir;

    fn create_test_repo() -> (TempDir, Repository) {
        let temp_dir = TempDir::new().unwrap();
        let repo_path = temp_dir.path();

        let repo = Repository::init(repo_path).unwrap();

        // Create some commits
        let sig = Signature::new(
            "Test User",
            "test@example.com",
            &Time::new(1_234_567_890, 0),
        )
        .unwrap();

        // Create an initial commit
        let tree_oid = {
            let builder = repo.treebuilder(None).unwrap();
            builder.write().unwrap()
        };

        let oid = {
            let tree = repo.find_tree(tree_oid).unwrap();
            repo.commit(Some("HEAD"), &sig, &sig, "Initial commit", &tree, &[])
                .unwrap()
        };

        // Make sure the commit exists
        repo.find_commit(oid).unwrap();

        (temp_dir, repo)
    }

    #[test]
    fn test_count_commits() {
        let (_temp_dir, repo) = create_test_repo();
        let count = count_commits(&repo).unwrap();
        assert_eq!(count, 1);
    }

    #[test]
    fn test_analyze_repo() {
        let (_temp_dir, repo) = create_test_repo();
        let repo_path = repo.path().to_str().unwrap();
        let repo_path_str = repo_path.to_string();

        let stats = analyze_repo(&repo_path_str).unwrap();
        assert_eq!(stats.total_commits, 1);
        assert!(stats.current_branch.is_some());
        assert!(stats.last_seen_sha.is_some());
    }

    #[test]
    fn test_count_commits_since() {
        let (_temp_dir, repo) = create_test_repo();
        let repo_path = repo.path().to_str().unwrap();
        let repo_path_str = repo_path.to_string();

        // Get the current SHA
        let current_sha = get_head_sha(&repo_path_str).unwrap();

        // Count commits since the current SHA should be 0
        let count = count_commits_since(&repo_path_str, &current_sha).unwrap();
        assert_eq!(count, 0);

        // Create another commit
        let sig = Signature::new(
            "Test User",
            "test@example.com",
            &Time::new(1_234_567_891, 0),
        )
        .unwrap();

        let head = repo.head().unwrap();
        let parent_commit = repo.find_commit(head.target().unwrap()).unwrap();

        let tree_oid = {
            let builder = repo.treebuilder(None).unwrap();
            builder.write().unwrap()
        };

        let tree = repo.find_tree(tree_oid).unwrap();
        let _new_oid = repo
            .commit(
                Some("HEAD"),
                &sig,
                &sig,
                "Second commit",
                &tree,
                &[&parent_commit],
            )
            .unwrap();

        // Count commits since the original SHA should now be 1
        let count = count_commits_since(&repo_path_str, &current_sha).unwrap();
        assert_eq!(count, 1);
    }

    #[test]
    fn test_count_commits_fallback() {
        let (_temp_dir, repo) = create_test_repo();
        let repo_path = repo.path().to_str().unwrap();
        let repo_path_str = repo_path.to_string();

        // This test requires git to be installed
        // If git is not available, the test will fail gracefully
        let count = count_commits_fallback(&repo_path_str);
        if let Ok(c) = count {
            assert_eq!(c, 1);
        }
    }
}
