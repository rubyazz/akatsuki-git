# Architecture

This document describes the system architecture, communication protocols, data structures, and implementation details of Akatsuki Git.

## High-Level Data Flow

```
┌─────────────────────────────────────────────────────────────────┐
│                     VS Code Extension (TypeScript)               │
│  ┌───────────────────────────────────────────────────────────┐  │
│  │ Protocol │ Status Bar │ Dashboard │ Git Watcher │ Messages│  │
│  └───────────────────────────────────────────────────────────┘  │
└─────────────────────────────┬───────────────────────────────────┘
                              │ JSON-RPC 2.0 (line-delimited)
                              │ stdin → RPC requests
                              │ stdout → RPC responses
                              │ stderr → logging
┌─────────────────────────────┴───────────────────────────────────┐
│                    akatsuki-backend (Rust)                       │
│  ┌────────────────────────────────────────────────────────────┐  │
│  │ RPC Handler │ Git Analyzer │ Storage │ Rank Calculator    │  │
│  └────────────────────────────────────────────────────────────┘  │
└─────────────┬───────────────────────┬────────────────────────────┘
              │                       │
              │                       │
┌─────────────┴─────┐     ┌──────────┴──────────────────┐
│   SQLite Database  │     │ Git Analysis (git2-rs + CLI) │
│  ┌───────────────┐ │     │ ┌────────────────────────┐  │
│  │ Profile       │ │     │ │ Commit DAG Walking    │  │
│  │ Repos         │ │     │ │ SHA Caching          │  │
│  │ Events        │ │     │ │ Commit Counting      │  │
│  │ Key-Value     │ │     │ │ Branch Tracking      │  │
│  └───────────────┘ │     │ └────────────────────────┘  │
└────────────────────┘     └──────────────────────────────┘
```

## IPC Protocol

The extension and backend communicate via line-delimited JSON-RPC 2.0 over standard input/output.

### Connection Lifecycle

1. **Spawn**: Extension activates → spawns `akatsuki-backend` binary
2. **Handshake**: Extension sends `handshake` request with protocol version
3. **Watchdog**: Extension sends `ping` every 15 seconds; missing response → respawn backend
4. **Shutdown**: Extension deactivates → kills backend process

### JSON-RPC Methods

#### `ping`
Health check used by watchdog.

**Request:**
```json
{
  "jsonrpc": "2.0",
  "id": 1,
  "method": "ping",
  "params": {}
}
```

**Response:**
```json
{
  "jsonrpc": "2.0",
  "id": 1,
  "result": {}
}
```

---

#### `handshake`
Version negotiation to ensure protocol compatibility.

**Request:**
```json
{
  "jsonrpc": "2.0",
  "id": 2,
  "method": "handshake",
  "params": {
    "version": 1
  }
}
```

**Response:**
```json
{
  "jsonrpc": "2.0",
  "id": 2,
  "result": {
    "version": 1,
    "ok": true
  }
}
```

If `ok` is `false`, the extension logs a version mismatch error and deactivates.

---

#### `init_profile`
Create or update the singleton user profile (idempotent).

**Request:**
```json
{
  "jsonrpc": "2.0",
  "id": 3,
  "method": "init_profile",
  "params": {
    "name": "Naruto Uzumaki",
    "path": "itachi"
  }
}
```

**Response:**
```json
{
  "jsonrpc": "2.0",
  "id": 3,
  "result": {
    "id": 1,
    "name": "Naruto Uzumaki",
    "path": "itachi",
    "created_at": 1704067200000
  }
}
```

---

#### `get_profile`
Retrieve the current user profile.

**Request:**
```json
{
  "jsonrpc": "2.0",
  "id": 4,
  "method": "get_profile",
  "params": {}
}
```

**Response:**
```json
{
  "jsonrpc": "2.0",
  "id": 4,
  "result": {
    "id": 1,
    "name": "Naruto Uzumaki",
    "path": "itachi",
    "created_at": 1704067200000
  }
}
```

Returns `null` if no profile exists.

---

#### `set_path`
Update the character path for the existing profile.

**Request:**
```json
{
  "jsonrpc": "2.0",
  "id": 5,
  "method": "set_path",
  "params": {
    "path": "madara"
  }
}
```

**Response:**
```json
{
  "jsonrpc": "2.0",
  "id": 5,
  "result": {
    "id": 1,
    "name": "Naruto Uzumaki",
    "path": "madara",
    "created_at": 1704067200000
  }
}
```

---

#### `analyze_repo`
Analyze a Git repository to count commits and track state.

**Request:**
```json
{
  "jsonrpc": "2.0",
  "id": 6,
  "method": "analyze_repo",
  "params": {
    "path": "/path/to/repo"
  }
}
```

**Response:**
```json
{
  "jsonrpc": "2.0",
  "id": 6,
  "result": {
    "total_commits": 47,
    "current_branch": "main",
    "last_seen_sha": "a1b2c3d4e5f6..."
  }
}
```

---

#### `get_rank`
Calculate rank information based on total commit count.

**Request:**
```json
{
  "jsonrpc": "2.0",
  "id": 7,
  "method": "get_rank",
  "params": {
    "total_commits": 150
  }
}
```

**Response:**
```json
{
  "jsonrpc": "2.0",
  "id": 7,
  "result": {
    "rank": "Chunin",
    "rank_key": "chunin",
    "current": 150,
    "next_threshold": 500,
    "progress": 0.125
  }
}
```

For maximum rank (Akatsuki Member), `next_threshold` is `null` and `progress` is `1.0`.

---

#### `record_event`
Log a Git operation event.

**Request:**
```json
{
  "jsonrpc": "2.0",
  "id": 8,
  "method": "record_event",
  "params": {
    "repo_path": "/path/to/repo",
    "op": "commit",
    "sha": "a1b2c3d4..."
  }
}
```

**Response:**
```json
{
  "jsonrpc": "2.0",
  "id": 8,
  "result": {}
}
```

Valid operations: `commit`, `push`, `pull`, `merge`, `merge_conflict`.

---

#### `get_message_templates`
Retrieve themed messages for Git operations based on selected path.

**Request:**
```json
{
  "jsonrpc": "2.0",
  "id": 9,
  "method": "get_message_templates",
  "params": {
    "path": "itachi"
  }
}
```

**Response:**
```json
{
  "jsonrpc": "2.0",
  "id": 9,
  "result": {
    "commit": {
      "in_flight": "Sealing knowledge into a forbidden scroll…",
      "completion": "Mission Report Recorded\n\nEvery growth requires sacrifice."
    },
    "push": {
      "in_flight": "Transmitting intelligence to Akatsuki Headquarters…",
      "completion": "Mission report delivered. Leader has acknowledged your efforts.\n\nEvery growth requires sacrifice."
    },
    "pull": {
      "in_flight": "Receiving intelligence from allied spies…",
      "completion": "New information acquired.\n\nEvery growth requires sacrifice."
    },
    "merge": {
      "in_flight": "Combining parallel timelines…",
      "completion": "Reality stabilized.\n\nEvery growth requires sacrifice."
    },
    "merge_conflict": {
      "in_flight": "⚔ Shinobi Battle Detected",
      "completion": "Two powerful jutsu have collided. Resolve the conflict to continue."
    }
  }
}
```

---

### Notifications (Backend → Extension)

The backend sends unsolicited notifications for state changes:

#### `initialized`
Emitted after successful handshake, indicating the backend is ready.

```json
{
  "jsonrpc": "2.0",
  "method": "initialized",
  "params": {}
}
```

#### `rank_changed`
Emitted when a repository's total commits cross a rank threshold.

```json
{
  "jsonrpc": "2.0",
  "method": "rank_changed",
  "params": {
    "repo_path": "/path/to/repo",
    "old": {
      "rank": "Genin",
      "rank_key": "genin"
    },
    "new": {
      "rank": "Chunin",
      "rank_key": "chunin"
    }
  }
}
```

## Storage

### Database Location

SQLite database file is stored at:
- **macOS**: `~/Library/Application Support/akatsuki-git/state.db`
- **Linux**: `~/.local/share/akatsuki-git/state.db`
- **Windows**: `%APPDATA%\akatsuki-git\state.db`

### Connection Management

- Single SQLite connection behind a `Mutex` for thread-safe access
- WAL mode enabled for concurrent reads
- `busy_timeout=5000` (5 seconds) to handle contention
- All database operations use retry logic

### Schema

```sql
PRAGMA journal_mode=WAL;
PRAGMA busy_timeout=5000;

CREATE TABLE IF NOT EXISTS profile (
  id           INTEGER PRIMARY KEY CHECK (id = 1),
  name         TEXT NOT NULL,
  path         TEXT NOT NULL CHECK (path IN ('itachi','pain','obito','madara')),
  created_at   INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS repos (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  path          TEXT NOT NULL UNIQUE,
  name          TEXT NOT NULL,
  total_commits INTEGER NOT NULL DEFAULT 0,
  last_seen_sha TEXT,
  first_seen_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS events (
  id        INTEGER PRIMARY KEY AUTOINCREMENT,
  repo_id   INTEGER NOT NULL REFERENCES repos(id),
  op        TEXT NOT NULL CHECK (op IN ('commit','push','pull','merge','merge_conflict')),
  sha       TEXT,
  ts        INTEGER NOT NULL,
  payload   TEXT
);

CREATE INDEX IF NOT EXISTS idx_events_repo_time ON events(repo_id, ts);

CREATE TABLE IF NOT EXISTS kv (
  key   TEXT PRIMARY KEY,
  value TEXT NOT NULL
);
```

### Table Purposes

- **`profile`**: Singleton user profile (id=1 enforced) for shinobi name and character path
- **`repos`**: Tracked Git repositories with commit counts and last seen SHA
- **`events`**: Log of Git operations for future analytics
- **`kv`**: Key-value storage for configuration and cache

## Rank System

### Rank Table

| Rank | rank_key | Total Commits Range |
|------|----------|---------------------|
| Academy Student | `academy_student` | 0–24 |
| Genin | `genin` | 25–99 |
| Chunin | `chunin` | 100–499 |
| Jonin | `jonin` | 500–1499 |
| Anbu | `anbu` | 1500–4999 |
| Akatsuki Member | `akatsuki_member` | 5000+ |

### Progress Calculation

Progress within current rank is calculated as:

```
floor = minimum commits for current rank
next_floor = minimum commits for next rank (or null if max rank)
progress = (current_commits - floor) / (next_floor - floor)
```

Result is clamped to `[0, 1]`. For maximum rank, `progress = 1.0` and `next_threshold = null`.

## Character Paths

### Available Paths

| Path | Description |
|------|-------------|
| `itachi` | The path of sacrifice and duty |
| `pain` | The path through suffering to peace |
| `obito` | The path of reality correction |
| `madara` | The path of ambition and power |

Default: `itachi` (selected if user skips onboarding).

### Message Templates

All paths share the same in-flight messages but have unique completion suffixes.

#### Default In-Flight Messages

| Operation | In-Flight Message |
|-----------|-------------------|
| Commit | "Sealing knowledge into a forbidden scroll…" |
| Push | "Transmitting intelligence to Akatsuki Headquarters…" |
| Pull | "Receiving intelligence from allied spies…" |
| Merge | "Combining parallel timelines…" |
| Merge Conflict | "⚔ Shinobi Battle Detected" |

#### Default Completion Messages

| Operation | Completion Message |
|-----------|-------------------|
| Commit | "Mission Report Recorded" |
| Push | "Mission report delivered. Leader has acknowledged your efforts." |
| Pull | "New information acquired." |
| Merge | "Reality stabilized." |
| Merge Conflict | "Two powerful jutsu have collided. Resolve the conflict to continue." |

#### Path Suffixes

The following suffixes are **appended** to completion messages for all operations **except** merge_conflict:

- **Itachi**: "Every growth requires sacrifice."
- **Pain**: "Through pain comes progress."
- **Obito**: "Reality has been corrected."
- **Madara**: "Your ambition grows stronger."

Merge conflict messages remain unchanged regardless of path.

## Git Event Detection

Akatsuki Git uses a hybrid, three-layer approach to detect Git events:

### Layer 1: VS Code Git API (Primary)

Uses the built-in `vscode.git` extension API:

```typescript
const gitApi = vscode.extensions.getExtension('vscode.git')?.exports.getAPI(1);
gitApi.onDidChangeState(e => handleGitStateChange(e));
```

This provides repository state changes with high accuracy within VS Code.

### Layer 2: File System Watcher (Secondary)

Watches `.git/HEAD` for immediate, reliable detection:

```typescript
const watcher = vscode.workspace.createFileSystemWatcher('**/.git/HEAD');
watcher.onDidChange(e => handleHeadChange(e));
```

This catches external Git operations that may not immediately reflect in VS Code's API.

### Layer 3: Polling (Safety Net)

Queries the backend every 5 minutes to poll for changes:

```typescript
setInterval(() => backend.analyzeRepo(activeRepo.path), 5 * 60 * 1000);
```

This ensures no events are missed even if both primary layers fail.

## Git Analysis

### Commit Counting Strategy

1. **Check cache**: Query database for `last_seen_sha` and `total_commits`
2. **Walk DAG**: Use `git2-rs` to walk from `HEAD` to `last_seen_sha` (exclusive)
3. **Incremental count**: Count only new commits since cached SHA
4. **Update cache**: Store new `total_commits` and current HEAD SHA

### Fallback

If `git2-rs` fails (e.g., shallow clone, worktree edge cases), shell out to:

```bash
git rev-list --count HEAD
```

This provides a reliable fallback at the cost of performance for large repositories.

## Concurrency and Safety

### Thread Safety

- **Database**: Single `Mutex<Connection>` ensures serialized access
- **WAL mode**: Allows concurrent reads during writes
- **Busy timeout**: 5-second retry window for contention

### Logging Safety

- **All Rust logging → stderr only**
- **stdout reserved strictly for JSON-RPC frames**
- **Extension forwards backend stderr to "Akatsuki Git" output channel**
- This prevents stdio deadlock from mixed output

### Watchdog and Respawn

- Extension sends `ping` every 15 seconds
- No response within 15 seconds → kill and respawn backend
- New backend instance restarts from handshake

### Version Compatibility

- `PROTOCOL_VERSION` constant on both sides (currently `1`)
- Handshake failure on version mismatch → extension deactivates
- Protocol changes require version bump and mirroring to TypeScript

## Status Bar

Format: `☁ Akatsuki | Rank: <Rank> | Missions: <N>`

Where:
- `<Rank>` = current shinobi rank (e.g., "Chunin")
- `<N>` = total commit count across all tracked repositories

The status bar updates on:
- Rank change
- New repository analyzed
- Commit count change

## Protocol Synchronization

The `shared` crate (`akatsuki-protocol`) is the single source of truth for types:

1. **Rust**: Define types in `shared/src/lib.rs`
2. **Mirror**: Manually update `shared/ts/protocol.ts`
3. **Version**: Bump `PROTOCOL_VERSION` constant
4. **Copy**: Run `npm run copy-protocol` in extension directory

Build step copies `shared/ts/protocol.ts` → `extension/src/protocol.ts`.

Future enhancement: Replace with `ts-rs` codegen for automatic synchronization.
