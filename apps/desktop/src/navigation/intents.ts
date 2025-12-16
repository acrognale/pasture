import type { GetRepoDiffParams } from '@pasture/protocol';

export type ReviewNavigationIntent = {
  target: 'review';
  conversationId: string;
  workspacePath: string;
  mode: 'turn' | 'repo';
  repoParams?: GetRepoDiffParams;
  focusFilePath?: string | null;
};

export type ThreadSwitcherNavigationIntent = {
  target: 'threadSwitcher';
};

export type NavigationIntent =
  | ReviewNavigationIntent
  | ThreadSwitcherNavigationIntent;

