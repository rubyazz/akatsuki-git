/**
 * Akatsuki Dashboard — a minimal webview panel showing current stats.
 *
 * This is a stub for now, displaying:
 * - Current rank and progress
 * - Mission count (commits)
 * - Current branch
 * - "Coming soon" features
 *
 * Future enhancements (tracked in ROADMAP.md):
 * - Achievements and badges
 * - Chakra level visualization
 * - Daily missions and streaks
 * - Comparison with other shinobi in the org
 */

import * as vscode from 'vscode';
import type { RankInfo, RepoStats } from './protocol';
import { repoDisplayName, formatNumber } from './util';

let currentPanel: vscode.WebviewPanel | undefined;

/**
 * Show or reveal the dashboard webview panel.
 */
export function showDashboard(
  _extensionUri: vscode.Uri,
  stats: RepoStats,
  rank: RankInfo,
): void {
  if (currentPanel) {
    currentPanel.reveal();
    updateDashboard(currentPanel, stats, rank);
    return;
  }

  currentPanel = vscode.window.createWebviewPanel(
    'akatsukiDashboard',
    'Akatsuki Dashboard',
    vscode.ViewColumn.One,
    {
      enableScripts: false, // No scripts needed for now
      retainContextWhenHidden: true,
    },
  );

  updateDashboard(currentPanel, stats, rank);

  currentPanel.onDidDispose(() => {
    currentPanel = undefined;
  });
}

/**
 * Update the dashboard content with current stats.
 */
function updateDashboard(panel: vscode.WebviewPanel, stats: RepoStats, rank: RankInfo): void {
  const repoName = repoDisplayName(stats.current_branch || 'unknown');

  panel.webview.html = getWebviewContent(rank, stats, repoName);
}

/**
 * Generate the webview HTML content.
 */
function getWebviewContent(rank: RankInfo, stats: RepoStats, repoName: string): string {
  const progressPercent = Math.round(rank.progress * 100);
  const nextThreshold =
    rank.next_threshold !== null ? formatNumber(rank.next_threshold) : 'MAX';

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Akatsuki Dashboard</title>
  <style>
    body {
      font-family: var(--vscode-font-family);
      font-size: var(--vscode-font-size);
      font-weight: var(--vscode-font-weight);
      color: var(--vscode-foreground);
      background-color: var(--vscode-editor-background);
      padding: 20px;
      margin: 0;
    }
    .container {
      max-width: 800px;
      margin: 0 auto;
    }
    .header {
      display: flex;
      align-items: center;
      margin-bottom: 30px;
      padding-bottom: 20px;
      border-bottom: 1px solid var(--vscode-panel-border);
    }
    .logo {
      width: 64px;
      height: 64px;
      margin-right: 20px;
    }
    h1 {
      margin: 0;
      font-size: 28px;
      color: var(--vscode-foreground);
    }
    .subtitle {
      margin-top: 5px;
      color: var(--vscode-descriptionForeground);
      font-size: 14px;
    }
    .stats-grid {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(250px, 1fr));
      gap: 20px;
      margin-bottom: 30px;
    }
    .stat-card {
      background: var(--vscode-editor-inactiveSelectionBackground);
      border-radius: 8px;
      padding: 20px;
      border: 1px solid var(--vscode-panel-border);
    }
    .stat-label {
      font-size: 12px;
      text-transform: uppercase;
      letter-spacing: 1px;
      color: var(--vscode-descriptionForeground);
      margin-bottom: 10px;
    }
    .stat-value {
      font-size: 32px;
      font-weight: bold;
      color: var(--vscode-foreground);
      margin-bottom: 5px;
    }
    .stat-detail {
      font-size: 14px;
      color: var(--vscode-descriptionForeground);
    }
    .progress-bar {
      width: 100%;
      height: 8px;
      background: var(--vscode-progressBar-background);
      border-radius: 4px;
      overflow: hidden;
      margin-top: 10px;
    }
    .progress-fill {
      height: 100%;
      background: linear-gradient(90deg, #d32f2f, #f44336);
      transition: width 0.3s ease;
    }
    .coming-soon {
      margin-top: 30px;
      padding: 20px;
      background: var(--vscode-textBlockQuote-background);
      border-left: 4px solid var(--vscode-textBlockQuote-border);
      border-radius: 4px;
    }
    .coming-soon h2 {
      margin-top: 0;
      font-size: 18px;
      color: var(--vscode-foreground);
    }
    .coming-soon ul {
      margin: 10px 0;
      padding-left: 20px;
    }
    .coming-soon li {
      margin: 5px 0;
      color: var(--vscode-descriptionForeground);
    }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <svg class="logo" viewBox="0 0 100 100" xmlns="http://www.w3.org/2000/svg">
        <circle cx="50" cy="50" r="45" fill="#d32f2f" opacity="0.8"/>
        <path d="M 20 30 Q 30 10 50 25 Q 70 10 80 30 Q 90 50 80 70 Q 70 90 50 75 Q 30 90 20 70 Q 10 50 20 30"
              fill="#d32f2f" opacity="0.9"/>
        <circle cx="35" cy="45" r="4" fill="#1a1a1a" opacity="0.7"/>
        <circle cx="65" cy="45" r="4" fill="#1a1a1a" opacity="0.7"/>
        <path d="M 40 60 Q 50 65 60 60" stroke="#1a1a1a" stroke-width="2" fill="none" opacity="0.5"/>
      </svg>
      <div>
        <h1>Akatsuki Dashboard</h1>
        <div class="subtitle">Track your shinobi journey</div>
      </div>
    </div>

    <div class="stats-grid">
      <div class="stat-card">
        <div class="stat-label">Current Rank</div>
        <div class="stat-value">${rank.rank}</div>
        <div class="stat-detail">
          ${formatNumber(rank.current)} missions completed
        </div>
        <div class="progress-bar">
          <div class="progress-fill" style="width: ${progressPercent}%"></div>
        </div>
        <div class="stat-detail" style="margin-top: 8px;">
          ${formatNumber(rank.current)} / ${nextThreshold} to next rank (${progressPercent}%)
        </div>
      </div>

      <div class="stat-card">
        <div class="stat-label">Total Missions</div>
        <div class="stat-value">${formatNumber(stats.total_commits)}</div>
        <div class="stat-detail">Commits across all time</div>
      </div>

      <div class="stat-card">
        <div class="stat-label">Current Branch</div>
        <div class="stat-value" style="font-size: 24px;">${stats.current_branch || 'No branch'}</div>
        <div class="stat-detail">${repoName}</div>
      </div>

      <div class="stat-card">
        <div class="stat-label">Last Mission</div>
        <div class="stat-value" style="font-size: 24px;">${stats.last_seen_sha ? '✓ Recorded' : 'Pending'}</div>
        <div class="stat-detail">
          ${stats.last_seen_sha ? 'Last commit analyzed' : 'No commits recorded yet'}
        </div>
      </div>
    </div>

    <div class="coming-soon">
      <h2>Coming Soon</h2>
      <ul>
        <li>Achievements and badges for special milestones</li>
        <li>Chakra level visualization</li>
        <li>Daily missions and activity streaks</li>
        <li>Compare with other shinobi in your organization</li>
        <li>Seasonal events and special ranks</li>
      </ul>
    </div>
  </div>
</body>
</html>`;
}

/**
 * Update the existing dashboard if it's open.
 */
export function updateDashboardIfNeeded(stats: RepoStats, rank: RankInfo): void {
  if (currentPanel) {
    updateDashboard(currentPanel, stats, rank);
  }
}
