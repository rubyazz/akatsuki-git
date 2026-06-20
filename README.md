# Akatsuki Git

Akatsuki Git is a Naruto-themed Git companion for VS Code that transforms your everyday development workflow into a shinobi progression journey. Every commit you make advances your rank from Academy Student to legendary Akatsuki Member, with themed notifications and status bar updates inspired by the Naruto universe.

**Note:** This project is in early experimental stages. Features and architecture may evolve as we develop the core experience.

## Screenshots

*Visual demonstrations coming soon*

## Features

- **Real Git Integration**: Automatically tracks your actual commits using `git2-rs` with fallback to `git` CLI
- **Rank Progression**: Six-tier shinobi ranking system based on your total commit count
- **Character Paths**: Choose your ninja path (Itachi, Pain, Obito, or Madara) with unique themed messages
- **Status Bar Display**: Live view of your current rank and total missions (commits)
- **Themed Notifications**: Immersive messages for commits, pushes, pulls, merges, and merge conflicts
- **Onboarding Experience**: Guided setup to select your character path and initialize your profile
- **Hybrid Event Detection**: Multi-layered approach using VS Code Git API, file system watchers, and polling

## Quick Start

### Prerequisites

- **Rust toolchain**: `cargo` and `rustc` (for building the backend)
- **Node.js 18+**: with `npm` (for building the VS Code extension)
- **VS Code 1.85+**: Extension Development Host support

### Building

1. **Clone the repository**
   ```bash
   git clone <repository-url>
   cd akatsuki-git
   ```

2. **Build the Rust backend**
   ```bash
   cargo build
   ```
   This produces the binary at `target/debug/akatsuki-backend`.

3. **Build the VS Code extension**
   ```bash
   cd extension
   npm install
   npm run compile
   npm run copy-protocol  # Copies protocol types from shared/
   ```

### Running

**Option 1: Using VS Code debugger**
1. Open the `extension/` folder (or repository root) in VS Code
2. Press `F5` to launch the Extension Development Host
3. Open any Git repository in the new window to activate Akatsuki Git

**Option 2: Command line**
```bash
code --extensionDevelopmentPath=$PWD/extension
```

Once activated, you'll be guided through the onboarding flow to select your character path. Then start making commits to watch your shinobi rank grow!

## Documentation

- **[Architecture](docs/ARCHITECTURE.md)**: System design, IPC protocol, database schema, and implementation details
- **[Development](docs/DEVELOPMENT.md)**: Build instructions, debugging guide, and development workflow
- **[Roadmap](docs/ROADMAP.md)**: Planned features and future enhancements

## License

MIT
