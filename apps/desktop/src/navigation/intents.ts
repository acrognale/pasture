import type { GetRepoDiffParams } from '@pasture/protocol';

export type ReviewNavigationIntent = {
  target: 'review';
  conversationId: string;
  workspacePath: string;
  threadId?: string | null;
  mode: 'turn' | 'repo';
  repoParams?: GetRepoDiffParams;
  focusFilePath?: string | null;
  threadTitle?: string | null;
};

export type ThreadSwitcherNavigationIntent = {
  target: 'threadSwitcher';
};

export type NavigationIntent =
  | ReviewNavigationIntent
  | ThreadSwitcherNavigationIntent;
