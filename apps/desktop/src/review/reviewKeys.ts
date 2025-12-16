import type { GetRepoDiffParams } from '@pasture/protocol';

export function makeTurnReviewKey(options: {
  conversationId: string;
  baseEventId: string | null;
  targetEventId: string;
}): string {
  return [
    'turn',
    options.conversationId,
    options.baseEventId ?? '__BASELINE__',
    options.targetEventId,
  ].join(':');
}

export function makeRepoConversationId(params: GetRepoDiffParams): string {
  const targetLabel = params.includeWorktree
    ? '__WORKTREE__'
    : (params.targetRef ?? '__TARGET__');
  return `repo:${params.workspacePath}::${params.baseRef}..${targetLabel}`;
}

export function makeRepoReviewKey(params: GetRepoDiffParams): string {
  const targetLabel = params.includeWorktree
    ? '__WORKTREE__'
    : (params.targetRef ?? '__TARGET__');
  return [
    'repo',
    params.workspacePath,
    params.baseRef,
    targetLabel,
    params.includeWorktree ? '1' : '0',
  ].join(':');
}
