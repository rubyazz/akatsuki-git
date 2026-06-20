/**
 * Akatsuki Git — Main extension entry point.
 *
 * This extension spawns akatsuki-backend, manages the JSON-RPC connection,
 * and integrates with VS Code's Git API to provide a Naruto-themed
 * gamification layer.
 *
 * Architecture:
 * - BackendClient: spawns and communicates with the Rust binary.
 * - GitWatcher: monitors repository changes (HEAD, refs, Git API).
 * - AkatsukiStatusBar: displays rank and mission count.
 * - Onboarding: handles first-run profile creation.
 * - Messages: themed notifications for git operations.
 * - Dashboard: webview panel for detailed stats.
 *
 * Flow on commit detection:
 * 1. GitWatcher detects HEAD change -> triggers refresh.
 * 2. Extension calls analyze_repo to update counts.
 * 3. Extension calls get_rank to compute new rank.
 * 4. StatusBar updates with new rank/missions.
 * 5. Themed notification shown (in-flight -> completion).
 */

import * as vscode from 'vscode';
import { BackendClient } from './backendClient';
import { AkatsukiStatusBar } from './statusBar';
import { GitWatcher } from './gitWatcher';
import { ensureOnboarded, changePath } from './onboarding';
import { testCommitMessage } from './messages';
import { showDashboard as showDashboardPanel, updateDashboardIfNeeded } from './dashboard';
import { createLogger, getLogger } from './logger';
import type { Profile, RepoStats, RankInfo } from './protocol';
import { nowMs } from './util';

let loggerInstance: ReturnType<typeof createLogger> | undefined;
let client: BackendClient | undefined;
let statusBar: AkatsukiStatusBar | undefined;
let gitWatcher: GitWatcher | undefined;
let currentProfile: Profile | undefined;
let currentStats: RepoStats | undefined;
let currentRank: RankInfo | undefined;
let lastRefreshTime = 0;
const REFRESH_THROTTLE_MS = 1000;

/**
 * Extension activation hook.
 */
export async function activate(context: vscode.ExtensionContext): Promise<void> {
  loggerInstance = createLogger();
  context.subscriptions.push(loggerInstance);

  const logger = getLogger();
  logger.info('Akatsuki Git extension activating...');

  // Check for workspace folder
  const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
  if (!workspaceFolder) {
    logger.warn('No workspace folder found; exiting gracefully.');
    vscode.window.showInformationMessage(
      'Akatsuki Git: Open a repository folder to begin your journey.',
    );
    return;
  }

  const repoPath = workspaceFolder.uri.fsPath;
  logger.info(`Workspace folder: ${repoPath}`);

  // Create and spawn backend client
  const config = vscode.workspace.getConfiguration('akatsuki');
  client = new BackendClient(config);

  try {
    await client.spawn();
    logger.info('Backend spawned successfully');
  } catch (err) {
    logger.error(`Failed to spawn backend: ${err}`);
    vscode.window.showErrorMessage(
      `Akatsuki Git: Failed to start backend. Run 'cargo build' in the backend directory. Error: ${err}`,
    );
    return;
  }

  context.subscriptions.push(client);

  // Onboarding flow
  try {
    currentProfile = await ensureOnboarded(client);
    logger.info(`Profile loaded: ${currentProfile.name} (${currentProfile.path})`);
  } catch (err) {
    logger.error(`Onboarding failed: ${err}`);
    vscode.window.showErrorMessage(`Akatsuki Git: Onboarding failed. ${err}`);
    return;
  }

  // Create status bar
  statusBar = new AkatsukiStatusBar();
  statusBar.showBusy();
  context.subscriptions.push(statusBar);

  // Register commands
  registerCommands(context, repoPath);

  // Create git watcher
  gitWatcher = new GitWatcher(repoPath, () => handleGitRefresh(repoPath));
  context.subscriptions.push(gitWatcher);

  // Kick off initial refresh
  await handleGitRefresh(repoPath);

  logger.info('Akatsuki Git extension activated successfully');
}

/**
 * Handle a git repository refresh (triggered by watcher or manual).
 */
async function handleGitRefresh(repoPath: string): Promise<void> {
  const now = nowMs();
  if (now - lastRefreshTime < REFRESH_THROTTLE_MS) {
    getLogger().debug('Refresh throttled');
    return;
  }
  lastRefreshTime = now;

  if (!client || !statusBar || !currentProfile) {
    return;
  }

  try {
    // Analyze repository to get current stats
    getLogger().debug(`Analyzing repo: ${repoPath}`);
    const stats = await client.sendRequest('analyze_repo', { path: repoPath });
    currentStats = stats;

    // Compute rank from total commits
    const rank = await client.sendRequest('get_rank', {
      total_commits: stats.total_commits,
    });
    currentRank = rank;

    // Update status bar
    statusBar.update(stats, rank);

    // Update dashboard if open
    updateDashboardIfNeeded(stats, rank);

    getLogger().info(`Refresh complete: rank=${rank.rank}, missions=${stats.total_commits}`);
  } catch (err) {
    getLogger().error(`Refresh failed: ${err}`);
    statusBar.showError('Backend offline. Check logs for details.');
  }
}

/**
 * Register all extension commands.
 */
function registerCommands(context: vscode.ExtensionContext, repoPath: string): void {
  // Show dashboard
  const showDashboardCmd = vscode.commands.registerCommand(
    'akatsuki.showDashboard',
    () => {
      if (!currentStats || !currentRank) {
        vscode.window.showInformationMessage('No stats available yet. Wait for initial analysis.');
        return;
      }
      showDashboardPanel(context.extensionUri, currentStats, currentRank);
    },
  );
  context.subscriptions.push(showDashboardCmd);

  // Refresh rank
  const refreshRankCmd = vscode.commands.registerCommand('akatsuki.refreshRank', async () => {
    if (!client) {
      return;
    }
    await handleGitRefresh(repoPath);
    vscode.window.showInformationMessage('Rank refreshed.');
  });
  context.subscriptions.push(refreshRankCmd);

  // Change character path
  const changePathCmd = vscode.commands.registerCommand('akatsuki.changePath', async () => {
    if (!client) {
      return;
    }
    await changePath(client);
    if (currentProfile) {
      // Clear template cache when path changes
      const { clearTemplateCache } = await import('./messages');
      clearTemplateCache();
    }
  });
  context.subscriptions.push(changePathCmd);

  // Test commit message (for development/testing)
  const testCmd = vscode.commands.registerCommand('akatsuki.testCommitMessage', async () => {
    if (!client || !currentProfile) {
      vscode.window.showWarningMessage('Profile not loaded. Cannot test commit messages.');
      return;
    }
    await testCommitMessage(client, currentProfile.path);
  });
  context.subscriptions.push(testCmd);
}

/**
 * Extension deactivation hook.
 */
export async function deactivate(): Promise<void> {
  getLogger().info('Akatsuki Git extension deactivating...');

  if (client) {
    await client.dispose();
    client = undefined;
  }

  if (statusBar) {
    statusBar.dispose();
    statusBar = undefined;
  }

  if (gitWatcher) {
    gitWatcher.dispose();
    gitWatcher = undefined;
  }

  if (loggerInstance) {
    loggerInstance.dispose();
    loggerInstance = undefined;
  }
}
