/**
 * Akatsuki status bar item — shows rank and mission count.
 *
 * Displays: ☁ Akatsuki | Rank: <Rank> | Missions: <N>
 * Clicking opens the dashboard.
 */

import * as vscode from 'vscode';
import type { RankInfo, RepoStats } from './protocol';

const CLOUD_ICON = '$(cloud)'; // Using codicon
const DISPLAY_NAME = 'Akatsuki Git';

export class AkatsukiStatusBar implements vscode.Disposable {
  private readonly item: vscode.StatusBarItem;

  constructor() {
    this.item = vscode.window.createStatusBarItem(
      vscode.StatusBarAlignment.Left,
      100, // High priority
    );
    this.item.command = 'akatsuki.showDashboard';
    this.item.tooltip = 'Click to open Akatsuki Dashboard';
  }

  /**
   * Update the status bar with current stats and rank.
   */
  public update(stats: RepoStats, rank: RankInfo): void {
    const { rank: rankLabel, progress } = rank;
    const missions = stats.total_commits;
    const branch = stats.current_branch || 'no branch';

    this.item.text = `${CLOUD_ICON} ${DISPLAY_NAME} | Rank: ${rankLabel} | Missions: ${missions} | ${branch}`;
    this.item.tooltip = `Rank: ${rankLabel}\nMissions: ${missions}\nBranch: ${branch}\nProgress: ${Math.round(progress * 100)}% to next rank`;
    this.item.show();
  }

  /**
   * Show a busy indicator (e.g., during analysis).
   */
  public showBusy(): void {
    this.item.text = `${CLOUD_ICON} ${DISPLAY_NAME} | $(loading~spin) Analyzing...`;
    this.item.show();
  }

  /**
   * Show an error state (e.g., backend offline).
   */
  public showError(message: string): void {
    this.item.text = `${CLOUD_ICON} ${DISPLAY_NAME} | $(error) Error`;
    this.item.tooltip = message;
    this.item.show();
  }

  /**
   * Hide the status bar item.
   */
  public hide(): void {
    this.item.hide();
  }

  /**
   * Dispose of the status bar item.
   */
  public dispose(): void {
    this.item.dispose();
  }
}
