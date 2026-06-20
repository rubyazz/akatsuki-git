/**
 * Themed notification helpers — Akatsuki-flavored progress and completion messages.
 *
 * Features:
 * - showThemedProgress: in-flight notification (via withProgress) -> completion message.
 * - Template caching per-character-path.
 * - Fetch templates from backend and apply to git operations.
 */

import * as vscode from 'vscode';
import type { MessageTemplates, GitOp, CharacterPath } from './protocol';
import type { BackendClient } from './backendClient';
import { getLogger } from './logger';

const logger = getLogger();

const TEMPLATE_CACHE = new Map<CharacterPath, MessageTemplates>();

/**
 * Show a themed progress notification followed by a completion message.
 *
 * @param client - Backend client for fetching templates
 * @param profilePath - Current profile's character path
 * @param op - Git operation type
 * @param repoPath - Repository path (for template context)
 * @param work - Async work to perform during the in-flight message
 */
export async function showThemedProgress<T>(
  client: BackendClient,
  profilePath: CharacterPath,
  op: GitOp,
  _repoPath: string,
  work: () => Promise<T>,
): Promise<T> {
  const templates = await getTemplates(client, profilePath);
  const template = templates[op];

  if (!template) {
    logger.warn(`No message template found for op: ${op}`);
    // Fallback to generic messages
    return await showGenericProgress(op, work);
  }

  return await vscode.window.withProgress(
    {
      location: vscode.ProgressLocation.Notification,
      title: template.in_flight,
      cancellable: false,
    },
    async () => {
      const result = await work();
      vscode.window.showInformationMessage(template.completion);
      return result;
    },
  );
}

/**
 * Get message templates for a character path, with caching.
 */
async function getTemplates(
  client: BackendClient,
  path: CharacterPath,
): Promise<MessageTemplates> {
  if (TEMPLATE_CACHE.has(path)) {
    return TEMPLATE_CACHE.get(path)!;
  }

  try {
    const templates = await client.sendRequest('get_message_templates', { path });
    TEMPLATE_CACHE.set(path, templates);
    logger.debug(`Cached message templates for path: ${path}`);
    return templates;
  } catch (err) {
    logger.error(`Failed to fetch message templates: ${err}`);
    return {};
  }
}

/**
 * Generic progress fallback when templates are unavailable.
 */
async function showGenericProgress<T>(op: GitOp, work: () => Promise<T>): Promise<T> {
  const messages: Record<GitOp, string> = {
    commit: 'Recording your mission...',
    push: 'Dispatching intelligence report...',
    pull: 'Receiving intel from HQ...',
    merge: 'Merging tactical data...',
    merge_conflict: 'Resolving internal conflicts...',
  };

  const completions: Record<GitOp, string> = {
    commit: 'Mission recorded successfully.',
    push: 'Intel dispatched to headquarters.',
    pull: 'Intel received and integrated.',
    merge: 'Tactical data merged.',
    merge_conflict: 'Conflicts resolved — peace restored.',
  };

  return await vscode.window.withProgress(
    {
      location: vscode.ProgressLocation.Notification,
      title: messages[op] || 'Processing...',
      cancellable: false,
    },
    async () => {
      const result = await work();
      vscode.window.showInformationMessage(completions[op] || 'Operation complete.');
      return result;
    },
  );
}

/**
 * Test command handler: preview the themed commit message flow.
 */
export async function testCommitMessage(client: BackendClient, profilePath: CharacterPath): Promise<void> {
  await showThemedProgress(
    client,
    profilePath,
    'commit',
    '/test/repo',
    async () => {
      // Simulate work
      await new Promise((resolve) => setTimeout(resolve, 2000));
      logger.info('Test commit flow completed');
    },
  );
}

/**
 * Clear the template cache (useful for testing or path changes).
 */
export function clearTemplateCache(): void {
  TEMPLATE_CACHE.clear();
  logger.debug('Template cache cleared');
}
