# Development Guide

This document covers development workflow, build instructions, debugging, and troubleshooting for contributing to Akatsuki Git.

## Prerequisites

### Required Tools

- **Rust toolchain**:
  - `cargo` (package manager)
  - `rustc` (compiler)
  - Install via [rustup](https://rustup.rs/)
- **Node.js 18+** with `npm`
- **VS Code 1.85+** (for Extension Development Host)

### Supported Platforms

- **macOS** (Intel and Apple Silicon)
- **Linux** (tested on Ubuntu/Debian)
- **Windows 10/11**

## Project Structure

```
akatsuki-git/
├── Cargo.toml                 # Rust workspace root
├── shared/                    # akatsuki-protocol crate
│   ├── src/lib.rs            # Rust types (source of truth)
│   └── ts/protocol.ts         # TypeScript mirror
├── backend/                   # akatsuki-backend binary
│   └── src/                   # Rust source files
└── extension/                 # VS Code extension
    ├── package.json
    └── src/                   # TypeScript source files
```

## Building

### Backend (Rust)

From the repository root:

```bash
cargo build
```

This builds the workspace and produces the binary at:
- Debug: `target/debug/akatsuki-backend`
- Release: `target/release/akatsuki-backend` (use `cargo build --release`)

### Extension (TypeScript)

```bash
cd extension
npm install
npm run compile
npm run copy-protocol
```

The `copy-protocol` script copies `shared/ts/protocol.ts` → `extension/src/protocol.ts`.

### Full Clean Build

```bash
# Clean all build artifacts
cargo clean
rm -rf extension/node_modules extension/out

# Rebuild
cargo build
cd extension && npm install && npm run compile && npm run copy-protocol
```

## Running and Debugging

### VS Code Debugger (Recommended)

1. **Open the project** in VS Code:
   ```bash
   code /path/to/akatsuki-git
   ```

2. **Open the Run and Debug view** (or press `Cmd+Shift+D` / `Ctrl+Shift+D`)

3. **Select "Run Extension"** from the dropdown

4. **Press `F5`** to launch the Extension Development Host

5. **Open a Git repository** in the new window to activate Akatsuki Git

The `.vscode/launch.json` configuration handles:
- Spawning the backend binary
- Forwarding stderr to the "Akatsuki Git" output channel
- Enabling hot reload for TypeScript changes

### Command Line

```bash
# From repository root
code --extensionDevelopmentPath=$PWD/extension
```

This launches a new VS Code window with the extension loaded.

### Backend Standalone Testing

Test the backend manually with JSON-RPC:

```bash
# Ping test
printf '{"jsonrpc":"2.0","id":1,"method":"ping","params":{}}\n' | ./target/debug/akatsuki-backend

# Handshake test
printf '{"jsonrpc":"2.0","id":1,"method":"handshake","params":{"version":1}}\n' | ./target/debug/akatsuki-backend
```

Expected output:
```json
{"jsonrpc":"2.0","id":1,"result":{}}
```

## Debugging

### Rust Backend

#### Enable Logging

Set the `RUST_LOG` environment variable:

```bash
# From VS Code launch.json (pre-configured)
"RUST_LOG": "akatsuki_backend=debug"

# Or in terminal
export RUST_LOG=akatsuki_backend=debug
```

Logs appear in the "Akatsuki Git" output channel (the extension forwards stderr).

#### Native Debugging

**Option 1: Attach to running process**
1. Start extension via `F5`
2. Find the backend PID:
   ```bash
   ps aux | grep akatsuki-backend
   ```
3. Attach using LLDB:
   ```bash
   lldb -p <PID>
   ```

**Option 2: LLDB VS Code Extension**
1. Install the [LLDB](https://marketplace.visualstudio.com/items?itemName=llvm-vs-code-extensions.lldb-dap) extension
2. Add a debug configuration in `.vscode/launch.json`:
   ```json
   {
     "type": "lldb",
     "request": "attach",
     "name": "Attach to Backend",
     "program": "${workspaceFolder}/target/debug/akatsuki-backend"
   }
   ```
3. Set breakpoints in Rust code and attach

**Option 3: CodeLLDB Extension**
1. Install [CodeLLDB](https://marketplace.visualstudio.com/items?itemName=vadimcn.vscode-lldb)
2. Use similar attach configuration as above

### TypeScript Extension

- Use VS Code's built-in debugger
- Set breakpoints in `.ts` files
- Console logs appear in the "Developer Tools" console (toggle via `Help → Toggle Developer Tools`)

### Test Repository Setup

Create a test repository to verify rank progression:

```bash
# Create test repo
mkdir ~/test-akatsuki
cd ~/test-akatsuki
git init

# Create test commits to cross rank thresholds
for i in {1..100}; do
  echo "Commit $i" > file.txt
  git add file.txt
  git commit -m "Test commit $i"
done
```

Expected ranks:
- 0–24: Academy Student
- 25–99: Genin
- 100–499: Chunin
- 500–1499: Jonin
- 1500–4999: Anbu
- 5000+: Akatsuki Member

## Protocol Development Workflow

When modifying protocol types:

1. **Edit Rust source**: Update `shared/src/lib.rs`
2. **Mirror to TypeScript**: Manually update `shared/ts/protocol.ts`
3. **Bump version**: Increment `PROTOCOL_VERSION` constant on both sides
4. **Copy**: Run `npm run copy-protocol` in `extension/`
5. **Rebuild**: Run `cargo build` and `npm run compile`

Example change:

```rust
// shared/src/lib.rs
pub const PROTOCOL_VERSION: u32 = 2;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct RankInfo {
    pub rank: String,
    pub rank_key: String,
    pub current: u32,
    pub next_threshold: Option<u32>,
    pub progress: f64,
    pub new_field: String,  // Added in v2
}
```

```typescript
// shared/ts/protocol.ts
export const PROTOCOL_VERSION: number = 2;

export interface RankInfo {
  rank: string;
  rank_key: string;
  current: number;
  next_threshold: number | null;
  progress: number;
  new_field: string;  // Added in v2
}
```

## Troubleshooting

### Backend Binary Not Found

**Symptom**: Extension fails to spawn backend

**Solution**:
```bash
# Ensure backend is built
cargo build

# Verify binary exists
ls -la target/debug/akatsuki-backend
```

### Extension Can't Find Protocol Types

**Symptom**: TypeScript compilation errors about missing types

**Solution**:
```bash
cd extension
npm run copy-protocol
```

### Status Bar Shows "Offline"

**Symptom**: Status bar displays offline indicator

**Solutions**:
1. Check the "Akatsuki Git" output channel for errors
2. Enable debug logging: set `RUST_LOG=akatsuki_backend=debug`
3. Verify backend is running: check Activity Monitor / Task Manager
4. Try reloading the window: `Cmd+Shift+P` → "Reload Window"

### Handshake Version Mismatch

**Symptom**: Extension logs "Protocol version mismatch" and deactivates

**Solution**:
- Ensure `PROTOCOL_VERSION` matches on both sides
- Rebuild backend and extension after protocol changes
- Run `npm run copy-protocol` after TypeScript changes

### Stdio Deadlock

**Symptom**: Backend hangs, extension becomes unresponsive

**Cause**: Accidental stdout print in Rust code

**Solution**:
- Ensure all logging uses `log` macros (`info!`, `debug!`, etc.)
- Never use `println!` or `print!` in backend code
- Verify `RUST_LOG` goes to stderr, not stdout

### Database Locked

**Symptom**: SQLite "database is locked" errors

**Solutions**:
1. Check for other processes accessing the database
2. Verify WAL mode is enabled: check backend logs
3. Ensure `busy_timeout` is set (5000ms default)
4. Close all Extension Development Host windows and retry

### Git Analysis Errors

**Symptom**: Repository analysis fails or shows incorrect counts

**Solutions**:
1. Enable debug logging: `RUST_LOG=akatsuki_backend=debug`
2. Check if repository is a shallow clone:
   ```bash
   git rev-parse --is-shallow-repository
   ```
3. Verify `git` CLI is available (fallback requires it)
4. Check file permissions for repository access

## Packaging and Distribution

### Development Builds

For local testing, use the existing workflow:
```bash
cargo build  # Backend
cd extension && npm install && npm run compile  # Extension
```

### Production Builds

Cross-platform packaging requires bundling platform-specific binaries:

1. **Build backend for each target**:
   ```bash
   # macOS (Intel)
   cargo build --release --target x86_64-apple-darwin

   # macOS (Apple Silicon)
   cargo build --release --target aarch64-apple-darwin

   # Linux
   cargo build --release --target x86_64-unknown-linux-gnu

   # Windows
   cargo build --release --target x86_64-pc-windows-msvc
   ```

2. **Package extension with `vsce`**:
   ```bash
   npm install -g @vscode/vsce

   # Include platform-specific binary
   # (This is planned for future implementation)
   vsce package --target <platform>
   ```

**Note**: Full cross-platform packaging is planned for a future phase. Current development builds reference `target/debug/akatsuki-backend` directly.

### Extension Marketplace

Future steps for publishing to VS Code Marketplace:
1. Create publisher account at [marketplace.visualstudio.com](https://marketplace.visualstudio.com)
2. Set `publisher` in `extension/package.json`
3. Package with `vsce package`
4. Upload via `vsce publish`

## Development Tips

### Hot Reload

- **TypeScript**: Changes recompile automatically (`npm run compile -- --watch`)
- **Rust**: Requires manual rebuild (`cargo build`), then reload extension host

### Code Style

- **Rust**: Use `cargo fmt` and `cargo clippy`
- **TypeScript**: Use Prettier (pre-configured in extension)

### Testing

- **Unit tests**: Add to `backend/src/*.rs` with `#[cfg(test)]`
- **Integration tests**: Create `backend/tests/*.rs`
- **Extension tests**: Use `vscode-test` framework (planned)

### Useful Commands

```bash
# Format all Rust code
cargo fmt

# Check for Rust warnings
cargo clippy

# Run Rust tests
cargo test

# Watch TypeScript compilation
cd extension && npm run compile -- --watch

# Clean all build artifacts
cargo clean && rm -rf extension/node_modules extension/out
```

## Getting Help

- Check the [Architecture](ARCHITECTURE.md) document for implementation details
- Review the [Roadmap](ROADMAP.md) for planned features
- Enable debug logging to inspect runtime behavior
- Use VS Code's built-in TypeScript debugging for extension issues
- Use LLDB for backend Rust issues
