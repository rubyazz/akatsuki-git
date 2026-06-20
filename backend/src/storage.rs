//! SQLite storage wrapper.

use crate::error::BackendError;
use crate::protocol::{CharacterPath, GitOp, Profile, RepoStats};
use rusqlite::{params, Connection, OptionalExtension};
use std::path::PathBuf;
use std::sync::Mutex;

/// Database wrapper.
pub struct Db {
    conn: Mutex<Connection>,
}

impl Db {
    /// Open or create the database at the default location.
    pub fn open() -> Result<Self, BackendError> {
        let data_dir = dirs::data_dir().ok_or_else(|| {
            BackendError::Storage(rusqlite::Error::InvalidPath(PathBuf::from(
                "Cannot determine data directory",
            )))
        })?;

        let db_dir = data_dir.join("akatsuki-git");
        std::fs::create_dir_all(&db_dir).map_err(|e| {
            BackendError::Storage(rusqlite::Error::InvalidPath(PathBuf::from(format!(
                "Cannot create directory {}: {e}",
                db_dir.display()
            ))))
        })?;

        let db_path = db_dir.join("state.db");
        let conn = Connection::open(&db_path)?;

        // Initialize the database
        let db = Self {
            conn: Mutex::new(conn),
        };
        db.init_schema()?;
        Ok(db)
    }

    /// Initialize the database schema.
    fn init_schema(&self) -> Result<(), BackendError> {
        let conn = self.conn.lock().unwrap();

        // Set pragmas. `journal_mode=WAL` returns a row (the resulting mode), so
        // it must go through `query_row` — rusqlite's `execute()` rejects calls
        // that yield rows. `busy_timeout` is set via rusqlite's native API to
        // avoid the SQL-pragma row-return ambiguity across SQLite versions.
        conn.query_row("PRAGMA journal_mode=WAL;", [], |_| Ok(()))?;
        conn.busy_timeout(std::time::Duration::from_secs(5))?;

        // Create tables
        conn.execute(
            "CREATE TABLE IF NOT EXISTS profile (
                id           INTEGER PRIMARY KEY CHECK (id = 1),
                name         TEXT NOT NULL,
                path         TEXT NOT NULL CHECK (path IN ('itachi','pain','obito','madara')),
                created_at   INTEGER NOT NULL
            );",
            [],
        )?;

        conn.execute(
            "CREATE TABLE IF NOT EXISTS repos (
                id            INTEGER PRIMARY KEY AUTOINCREMENT,
                path          TEXT NOT NULL UNIQUE,
                name          TEXT NOT NULL,
                total_commits INTEGER NOT NULL DEFAULT 0,
                last_seen_sha TEXT,
                first_seen_at INTEGER NOT NULL
            );",
            [],
        )?;

        conn.execute(
            "CREATE TABLE IF NOT EXISTS events (
                id        INTEGER PRIMARY KEY AUTOINCREMENT,
                repo_id   INTEGER NOT NULL REFERENCES repos(id),
                op        TEXT NOT NULL CHECK (op IN ('commit','push','pull','merge','merge_conflict')),
                sha       TEXT,
                ts        INTEGER NOT NULL,
                payload   TEXT
            );",
            [],
        )?;

        conn.execute(
            "CREATE INDEX IF NOT EXISTS idx_events_repo_time ON events(repo_id, ts);",
            [],
        )?;

        conn.execute(
            "CREATE TABLE IF NOT EXISTS kv (
                key   TEXT PRIMARY KEY,
                value TEXT NOT NULL
            );",
            [],
        )?;

        Ok(())
    }

    /// Get the profile, if it exists.
    pub fn get_profile(&self) -> Result<Option<Profile>, BackendError> {
        let conn = self.conn.lock().unwrap();
        let mut stmt = conn.prepare("SELECT name, path, created_at FROM profile WHERE id = 1;")?;

        let mut rows = stmt.query([])?;

        if let Some(row) = rows.next()? {
            let name: String = row.get(0)?;
            let path_key: String = row.get(1)?;
            let created_at: i64 = row.get(2)?;

            let path = CharacterPath::from_key(&path_key)
                .ok_or_else(|| BackendError::Protocol(format!("Invalid path key: {path_key}")))?;

            Ok(Some(Profile {
                name,
                path,
                created_at,
            }))
        } else {
            Ok(None)
        }
    }

    /// Initialize or update the profile.
    pub fn init_profile(&self, name: String, path: CharacterPath) -> Result<Profile, BackendError> {
        let conn = self.conn.lock().unwrap();
        let now = chrono_timestamp_millis();

        // Try to update first
        let updated = conn.execute(
            "UPDATE profile SET name = ?1, path = ?2, created_at = ?3 WHERE id = 1;",
            params![name, path.key(), now],
        )?;

        if updated > 0 {
            // Updated existing row
            Ok(Profile {
                name,
                path,
                created_at: now,
            })
        } else {
            // Insert new row
            conn.execute(
                "INSERT INTO profile (id, name, path, created_at) VALUES (1, ?1, ?2, ?3);",
                params![name, path.key(), now],
            )?;

            Ok(Profile {
                name,
                path,
                created_at: now,
            })
        }
    }

    /// Update just the path field of the profile. Creates the singleton row with
    /// a default name if it does not yet exist.
    pub fn set_path(&self, path: CharacterPath) -> Result<Profile, BackendError> {
        let conn = self.conn.lock().unwrap();

        // Query the existing profile using the connection we already hold. Do NOT
        // call `self.get_profile()` here — that method locks the same Mutex and
        // `std::sync::Mutex` is not reentrant, so it would deadlock.
        let existing: Option<(String, i64)> = conn
            .query_row(
                "SELECT name, created_at FROM profile WHERE id = 1;",
                [],
                |row| Ok((row.get::<_, String>(0)?, row.get::<_, i64>(1)?)),
            )
            .optional()?;

        if let Some((name, created_at)) = existing {
            conn.execute(
                "UPDATE profile SET path = ?1 WHERE id = 1;",
                params![path.key()],
            )?;
            Ok(Profile {
                name,
                path,
                created_at,
            })
        } else {
            let now = chrono_timestamp_millis();
            conn.execute(
                "INSERT INTO profile (id, name, path, created_at) VALUES (1, ?1, ?2, ?3);",
                params!["Shinobi", path.key(), now],
            )?;
            Ok(Profile {
                name: "Shinobi".to_string(),
                path,
                created_at: now,
            })
        }
    }

    /// Get repository stats from cache.
    pub fn get_repo_stats(&self, repo_path: &str) -> Result<Option<RepoStats>, BackendError> {
        let conn = self.conn.lock().unwrap();
        let mut stmt =
            conn.prepare("SELECT total_commits, last_seen_sha FROM repos WHERE path = ?1;")?;

        let mut rows = stmt.query([repo_path])?;

        if let Some(row) = rows.next()? {
            let total_commits: u64 = row.get(0)?;
            let last_seen_sha: Option<String> = row.get(1)?;

            Ok(Some(RepoStats {
                total_commits,
                current_branch: None, // Not stored in cache
                last_seen_sha,
            }))
        } else {
            Ok(None)
        }
    }

    /// Update repository stats in cache.
    pub fn update_repo_stats(
        &self,
        repo_path: &str,
        repo_name: String,
        total_commits: u64,
        last_seen_sha: Option<String>,
    ) -> Result<(), BackendError> {
        let conn = self.conn.lock().unwrap();
        let now = chrono_timestamp_millis();

        // Check if repo exists
        let existing = conn
            .query_row(
                "SELECT id FROM repos WHERE path = ?1;",
                [repo_path],
                |row| row.get::<_, i32>(0),
            )
            .optional()?;

        if existing.is_some() {
            // Update
            conn.execute(
                "UPDATE repos SET total_commits = ?1, last_seen_sha = ?2 WHERE path = ?3;",
                params![total_commits, last_seen_sha, repo_path],
            )?;
        } else {
            // Insert
            conn.execute(
                "INSERT INTO repos (path, name, total_commits, last_seen_sha, first_seen_at) VALUES (?1, ?2, ?3, ?4, ?5);",
                params![repo_path, repo_name, total_commits, last_seen_sha, now],
            )?;
        }

        Ok(())
    }

    /// Record an event.
    pub fn record_event(
        &self,
        repo_path: &str,
        op: GitOp,
        sha: Option<String>,
    ) -> Result<(), BackendError> {
        let conn = self.conn.lock().unwrap();
        let now = chrono_timestamp_millis();

        // Ensure repo exists (get or create)
        let repo_id: i64 = match conn
            .query_row(
                "SELECT id FROM repos WHERE path = ?1;",
                [repo_path],
                |row| row.get::<_, i32>(0),
            )
            .optional()
        {
            Ok(Some(id)) => i64::from(id),
            Ok(None) => {
                // Create the repo
                let repo_name = extract_repo_name(repo_path);
                conn.execute(
                    "INSERT INTO repos (path, name, total_commits, first_seen_at) VALUES (?1, ?2, 0, ?3);",
                    params![repo_path, repo_name, now],
                )?;

                // Get the inserted ID
                conn.last_insert_rowid()
            }
            Err(e) => return Err(BackendError::Storage(e)),
        };

        // Insert the event
        conn.execute(
            "INSERT INTO events (repo_id, op, sha, ts) VALUES (?1, ?2, ?3, ?4);",
            params![repo_id, op.key(), sha, now],
        )?;

        Ok(())
    }
}

/// Extract the repository name from a path.
fn extract_repo_name(path: &str) -> String {
    // Get the last component of the path
    if let Some(last) = PathBuf::from(path).file_name() {
        last.to_string_lossy().to_string()
    } else {
        // Fallback to the path itself
        path.to_string()
    }
}

/// Get the current Unix timestamp in milliseconds.
fn chrono_timestamp_millis() -> i64 {
    use std::time::{SystemTime, UNIX_EPOCH};
    let duration = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .expect("Time went backwards");
    #[allow(clippy::cast_possible_truncation)]
    let result = duration.as_millis() as i64;
    result
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_extract_repo_name() {
        assert_eq!(extract_repo_name("/path/to/repo"), "repo");
        // For paths ending in "/", file_name() still returns the last component
        assert_eq!(extract_repo_name("/path/to/repo/"), "repo");
    }
}
