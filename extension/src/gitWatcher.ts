/**
 * Git watcher — monitors repository changes and triggers refreshes.
 *
 * Uses multiple strategies:
 * 1. vscode.git extension API (if available and active).
 * 2. FileSystemWatcher on .git/HEAD and .git/refs/heads/*.
 * 3. Safety net: poll every 5 minutes.
 *
 * Throttles refreshes to avoid excessive backend calls.
 */

import * as vscode from 'vscode';
import { getLogger, Logger } from './logger';
import { nowMs } from './util';

const POLL_INTERVAL_MS = 5 * 60 * 1000; // 5 minutes
const THROTTLE_MS = 1000; // Ignore rapid successive changes

type RefreshCallback = () => void | Promise<void>;

export class GitWatcher implements vscode.Disposable {
  private disposables: vscode.Disposable[] = [];
  private lastRefreshTime = 0;
  private pollInterval: NodeJS.Timeout | undefined;
  private readonly logger: Logger;

  constructor(private readonly repoPath: string, private readonly onRefresh: RefreshCallback) {
    this.logger = getLogger();
    this.setupGitApiWatcher();
    this.setupFsWatchers();
    this.startPolling();
  }

  public dispose(): void {
    for (const disposable of this.disposables) {
      disposable.dispose();
    }
    this.disposables = [];

    if (this.pollInterval) {
      clearInterval(this.pollInterval);
      this.pollInterval = undefined;
    }
  }

  private async triggerRefresh(): Promise<void> {
    const now = nowMs();
    if (now - this.lastRefreshTime < THROTTLE_MS) {
      this.logger.debug('Refresh throttled');
      return;
    }

    this.lastRefreshTime = now;
    this.logger.debug('Triggering refresh...');
    try {
      await this.onRefresh();
    } catch (err) {
      this.logger.error(`Refresh failed: ${err}`);
    }
  }

  /**
   * Try to use the vscode.git extension API.
   * This is undocumented and flaky, so wrap in try/catch.
   */
  private setupGitApiWatcher(): void {
    try {
      const gitExt = vscode.extensions.getExtension('vscode.git');
      if (!gitExt) {
        this.logger.debug('vscode.git extension not found');
        return;
      }

      // Activate the extension if not already active
      if (!gitExt.isActive) {
        gitExt.activate().then(
          () => {
            this.logger.debug('vscode.git extension activated');
            this.attachGitApi(gitExt.exports);
          },
          (err) => {
            this.logger.warn(`Failed to activate vscode.git: ${err}`);
          },
        );
      } else {
        this.attachGitApi(gitExt.exports);
      }
    } catch (err) {
      this.logger.warn(`Failed to setup git API watcher: ${err}`);
    }
  }

  private attachGitApi(exports: any): void {
    try {
      const api = exports.getAPI(1);
      if (!api) {
        this.logger.warn('git API v1 not available');
        return;
      }

      const repositories = api.repositories;
      if (!repositories || repositories.length === 0) {
        this.logger.debug('No git repositories found via API');
        return;
      }

      // Find the repository matching our workspace
      const workspaceUri = vscode.Uri.file(this.repoPath);
      const repo = repositories.find((r: any) => {
        const repoRoot = r.rootUri?.fsPath;
        return repoRoot === this.repoPath || repoRoot === workspaceUri.fsPath;
      });

      if (!repo) {
        this.logger.debug(`Repository not found in git API for: ${this.repoPath}`);
        return;
      }

      // Listen to state changes
      const state = repo.state;
      if (state && state.onDidChange) {
        const subscription = state.onDidChange(() => {
          this.logger.debug('Git state changed (API)');
          this.triggerRefresh();
        });
        this.disposables.push(subscription);
        this.logger.info('Attached to git API state watcher');
      }
    } catch (err) {
      this.logger.warn(`Failed to attach git API: ${err}`);
    }
  }

  /**
   * Set up FileSystemWatcher on .git/HEAD and refs.
   * This is the reliable fallback.
   */
  private setupFsWatchers(): void {
    // Watch .git/HEAD for branch changes and new commits
    const headPattern = new vscode.RelativePattern(this.repoPath, '**/.git/HEAD');
    const headWatcher = vscode.workspace.createFileSystemWatcher(headPattern);
    headWatcher.onDidChange(() => {
      this.logger.debug('.git/HEAD changed');
      this.triggerRefresh();
    });
    this.disposables.push(headWatcher);

    // Watch refs/heads/* for branch updates
    const refsPattern = new vscode.RelativePattern(this.repoPath, '**/.git/refs/heads/*');
    const refsWatcher = vscode.workspace.createFileSystemWatcher(refsPattern);
    refsWatcher.onDidChange(() => {
      this.logger.debug('.git/refs/heads/* changed');
      this.triggerRefresh();
    });
    refsWatcher.onDidCreate(() => {
      this.logger.debug('.git/refs/heads/* created');
      this.triggerRefresh();
    });
    refsWatcher.onDidDelete(() => {
      this.logger.debug('.git/refs/heads/* deleted');
      this.triggerRefresh();
    });
    this.disposables.push(refsWatcher);

    this.logger.info('FileSystemWatcher configured for .git/HEAD and refs');
  }

  /**
   * Safety net: poll every 5 minutes.
   */
  private startPolling(): void {
    this.pollInterval = setInterval(() => {
      this.logger.debug('Polling refresh (safety net)');
      this.triggerRefresh();
    }, POLL_INTERVAL_MS);
  }
}
