#!/usr/bin/env node
/**
 * Package a platform-specific Akatsuki Git VSIX.
 *
 * Builds the Rust backend for a given target, copies the binary into
 * `extension/bin/`, then runs `vsce package --target <target>` to produce a
 * VSIX tagged for that platform (the Marketplace/Open VSX serves the right one
 * to each user automatically).
 *
 * Usage:
 *   node scripts/package.mjs --target <vsce-target> [--debug] [--skip-rustup]
 *
 * Supported <vsce-target> values (see TARGETS below):
 *   darwin-arm64, darwin-x64, linux-x64, linux-arm64, win32-x64
 *
 * Cross-compiling requires the relevant Rust target to be installed
 * (`rustup target add <triple>`); this script attempts to add it automatically
 * unless --skip-rustup is passed.
 */
import { spawnSync } from 'node:child_process';
import { copyFileSync, existsSync, mkdirSync, rmSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const extensionDir = resolve(__dirname, '..');
const repoRoot = resolve(extensionDir, '..');
const binDir = join(extensionDir, 'bin');

/** Maps VS Code platform targets to Rust target triples + binary names. */
const TARGETS = {
  'darwin-arm64': { rust: 'aarch64-apple-darwin', binary: 'akatsuki-backend' },
  'darwin-x64': { rust: 'x86_64-apple-darwin', binary: 'akatsuki-backend' },
  'linux-x64': { rust: 'x86_64-unknown-linux-gnu', binary: 'akatsuki-backend' },
  'linux-arm64': { rust: 'aarch64-unknown-linux-gnu', binary: 'akatsuki-backend' },
  'win32-x64': { rust: 'x86_64-pc-windows-msvc', binary: 'akatsuki-backend.exe' },
};

function parseArgs(argv) {
  const args = { target: null, debug: false, skipRustup: false };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--target') args.target = argv[++i];
    else if (a === '--debug') args.debug = true;
    else if (a === '--skip-rustup') args.skipRustup = true;
    else if (a === '-h' || a === '--help') {
      printUsage();
      process.exit(0);
    }
  }
  return args;
}

function printUsage() {
  console.log(
    [
      'Usage: node scripts/package.mjs --target <vsce-target> [options]',
      '',
      'Options:',
      '  --target <t>   VS Code platform target (required). One of:',
      '                  ' + Object.keys(TARGETS).join(', '),
      '  --debug        Build the backend in debug instead of release.',
      '  --skip-rustup  Do not attempt `rustup target add <triple>`.',
    ].join('\n'),
  );
}

function run(cmd, args, opts = {}) {
  const result = spawnSync(cmd, args, { stdio: 'inherit', shell: process.platform === 'win32', ...opts });
  if (result.status !== 0) {
    console.error(`✗ Command failed (${result.status}): ${cmd} ${args.join(' ')}`);
    process.exit(result.status ?? 1);
  }
}

function main() {
  const { target, debug, skipRustup } = parseArgs(process.argv.slice(2));
  if (!target) {
    console.error('✗ --target is required.');
    printUsage();
    process.exit(1);
  }
  const spec = TARGETS[target];
  if (!spec) {
    console.error(`✗ Unknown target "${target}". Supported: ${Object.keys(TARGETS).join(', ')}`);
    process.exit(1);
  }

  const profile = debug ? 'debug' : 'release';
  console.log(`\n=== Packaging Akatsuki Git for ${target} (${spec.rust}, ${profile}) ===\n`);

  // 1. Ensure the Rust target is installed (best-effort).
  if (!skipRustup) {
    console.log(`→ rustup target add ${spec.rust}`);
    spawnSync('rustup', ['target', 'add', spec.rust], { stdio: 'inherit', shell: process.platform === 'win32' });
  }

  // 2. Build the backend for the target.
  const cargoArgs = ['build', '--manifest-path', join(repoRoot, 'Cargo.toml'), '--target', spec.rust];
  if (!debug) cargoArgs.push('--release');
  console.log(`→ cargo ${cargoArgs.join(' ')}`);
  run('cargo', cargoArgs);

  // 3. Locate the built binary and copy it into extension/bin/.
  const builtBinary = join(repoRoot, 'target', spec.rust, profile, spec.binary);
  if (!existsSync(builtBinary)) {
    console.error(`✗ Built binary not found at ${builtBinary}`);
    process.exit(1);
  }
  mkdirSync(binDir, { recursive: true });
  const destBinary = join(binDir, spec.binary);
  copyFileSync(builtBinary, destBinary);
  console.log(`→ copied ${spec.binary} → extension/bin/`);

  // 4. Compile the extension (ensures out/ is fresh + protocol copied).
  console.log('→ npm run compile');
  run('npm', ['run', 'compile'], { cwd: extensionDir });

  // 5. The Marketplace listing README + LICENSE live at the repo root; stage
  //    them into the extension folder for packaging, then remove afterwards so
  //    the repo keeps a single source of truth (root README/LICENSE).
  const stagedAssets = [join(extensionDir, 'README.md'), join(extensionDir, 'LICENSE')];
  copyFileSync(join(repoRoot, 'README.md'), stagedAssets[0]);
  copyFileSync(join(repoRoot, 'LICENSE'), stagedAssets[1]);
  console.log('→ staged README.md + LICENSE for packaging');

  // 6. Package the VSIX for the platform target.
  const vsceArgs = ['vsce', 'package', '--target', target, '--no-git-tag-version'];
  console.log(`→ npx ${vsceArgs.join(' ')} (cwd: extension)`);
  try {
    run('npx', vsceArgs, { cwd: extensionDir });
  } finally {
    // 7. Clean up staged binary + assets so they don't linger in the worktree.
    rmSync(destBinary, { force: true });
    for (const f of stagedAssets) rmSync(f, { force: true });
  }
  console.log(`\n✓ Packaged VSIX for ${target}. See extension/*.vsix\n`);
}

main();
