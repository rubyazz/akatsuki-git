/**
 * Onboarding flow — QuickPick for character path selection.
 *
 * Handles:
 * - First-run profile creation (get_profile -> QuickPick -> init_profile)
 * - Change path command (QuickPick -> set_path)
 * - Welcome information message after onboarding.
 */

import * as vscode from 'vscode';
import type { Profile, CharacterPath } from './protocol';
import { PATH_INFO, CHARACTER_PATHS } from './protocol';
import type { BackendClient } from './backendClient';
import { getLogger } from './logger';
import { getUsername } from './util';

const logger = getLogger();

/**
 * Ensure the user has a profile. If not, run the onboarding flow.
 * Returns the current profile (existing or newly created).
 */
export async function ensureOnboarded(client: BackendClient): Promise<Profile> {
  try {
    const existing = await client.sendRequest('get_profile', undefined);
    if (existing) {
      logger.info(`Profile exists: ${existing.name} (${existing.path})`);
      return existing;
    }
  } catch (err) {
    logger.warn(`Failed to check existing profile: ${err}`);
    // Continue to onboarding
  }

  return await runOnboardingFlow(client);
}

/**
 * Run the interactive onboarding QuickPick flow.
 */
async function runOnboardingFlow(client: BackendClient): Promise<Profile> {
  const quickPick = vscode.window.createQuickPick();
  quickPick.title = 'Welcome to Akatsuki Git — Choose Your Path';
  quickPick.placeholder = 'Select a character path to begin your journey...';
  quickPick.ignoreFocusOut = true;

  // Add character path options
  const items = CHARACTER_PATHS.map((path) => {
    const info = PATH_INFO[path];
    return {
      label: info.label,
      description: info.description,
      detail: info.suffix,
      path: path as CharacterPath,
    };
  });

  // Add "Skip" option (defaults to Itachi)
  items.push({
    label: 'Skip for now',
    description: 'Use the default path (Itachi)',
    detail: 'You can change this later via the Akatsuki: Change Path command',
    path: 'itachi',
  });

  quickPick.items = items;

  const selectedPath = await new Promise<CharacterPath>((resolve) => {
    quickPick.onDidChangeSelection((selection) => {
      if (selection[0]) {
        const item = selection[0] as any;
        resolve(item.path as CharacterPath);
      }
    });
    // If dismissed without a selection, default to Itachi (skip behaviour).
    quickPick.onDidHide(() => resolve('itachi'));
    quickPick.show();
  });

  quickPick.dispose();

  // Create the profile
  const name = getUsername();
  try {
    const profile = await client.sendRequest('init_profile', {
      name,
      path: selectedPath,
    });

    const info = PATH_INFO[selectedPath];
    vscode.window.showInformationMessage(
      `Welcome to Akatsuki, ${name}! You have chosen the path of ${info.label.split(' — ')[0]}.`,
    );

    logger.info(`Created profile: ${profile.name} (${profile.path})`);
    return profile;
  } catch (err) {
    logger.error(`Failed to create profile: ${err}`);
    vscode.window.showErrorMessage(`Failed to create profile: ${err}`);
    throw err;
  }
}

/**
 * Command handler: Change character path.
 */
export async function changePath(client: BackendClient): Promise<void> {
  const quickPick = vscode.window.createQuickPick();
  quickPick.title = 'Change Your Akatsuki Path';
  quickPick.placeholder = 'Select a new character path...';
  quickPick.ignoreFocusOut = true;

  const items = CHARACTER_PATHS.map((path) => {
    const info = PATH_INFO[path];
    return {
      label: info.label,
      description: info.description,
      detail: info.suffix,
      path: path as CharacterPath,
    };
  });

  quickPick.items = items;

  const selectedPath = await new Promise<CharacterPath | undefined>((resolve) => {
    quickPick.onDidChangeSelection((selection) => {
      if (selection[0]) {
        const item = selection[0] as any;
        resolve(item.path as CharacterPath);
      }
    });
    quickPick.onDidHide(() => resolve(undefined));
    quickPick.show();
  });

  quickPick.dispose();

  if (!selectedPath) {
    return; // User cancelled
  }

  try {
    const profile = await client.sendRequest('set_path', { path: selectedPath });
    const info = PATH_INFO[selectedPath];
    vscode.window.showInformationMessage(
      `Path changed to ${info.label.split(' — ')[0]}. ${info.suffix}`,
    );
    logger.info(`Changed path to: ${profile.path}`);
  } catch (err) {
    logger.error(`Failed to change path: ${err}`);
    vscode.window.showErrorMessage(`Failed to change path: ${err}`);
  }
}
