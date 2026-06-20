/**
 * Small utility functions for the Akatsuki Git extension.
 */

import * as path from 'path';

/**
 * Derive a display name from a repository path.
 * Example: /Users/foo/bar/baz -> bar/baz
 */
export function repoDisplayName(repoPath: string): string {
  const parts = path.normalize(repoPath).split(path.sep);
  if (parts.length >= 2) {
    return parts.slice(-2).join(path.sep);
  }
  return parts[parts.length - 1] || repoPath;
}

/**
 * Compare two version strings (e.g., "1.2.3" vs "1.2.10").
 * Returns: negative if a < b, zero if equal, positive if a > b.
 */
export function compareVersions(a: string, b: string): number {
  const pa = a.split('.').map(x => parseInt(x, 10));
  const pb = b.split('.').map(x => parseInt(x, 10));

  for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
    const na = pa[i] ?? 0;
    const nb = pb[i] ?? 0;
    if (na !== nb) {
      return na - nb;
    }
  }
  return 0;
}

/**
 * Get current time in milliseconds (Unix timestamp).
 */
export function nowMs(): number {
  return Date.now();
}

/**
 * Format a number with commas (e.g., 1234 -> "1,234").
 */
export function formatNumber(num: number): string {
  return num.toLocaleString('en-US');
}

/**
 * Safe wrapper for os.userInfo() (handles platforms where it may throw).
 */
export function getUsername(): string {
  try {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const os = require('os');
    return os.userInfo()?.username || 'Shinobi';
  } catch {
    return 'Shinobi';
  }
}
