#!/usr/bin/env node
/**
 * Copy shared protocol file to extension source.
 *
 * This script copies ../shared/ts/protocol.ts to src/protocol.ts.
 * It's invoked by npm run copy-protocol before compilation.
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, '..', '..');
const sourcePath = path.join(repoRoot, 'shared', 'ts', 'protocol.ts');
const targetPath = path.resolve(__dirname, '..', 'src', 'protocol.ts');

try {
  const content = fs.readFileSync(sourcePath, 'utf8');
  fs.writeFileSync(targetPath, content, 'utf8');
  console.log(`✓ Copied protocol.ts: ${sourcePath} → ${targetPath}`);
} catch (err) {
  console.error(`✗ Failed to copy protocol.ts: ${err.message}`);
  process.exit(1);
}
