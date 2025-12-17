import { subscribeWithSelector } from 'zustand/middleware';
import { createStore } from 'zustand/vanilla';
import type { StoreApi } from 'zustand/vanilla';

import type { NavigationIntent, ReviewNavigationIntent } from './intents';

export type NavigationEvent = {
  intent: NavigationIntent;
  nonce: number;
};

export type NavigationDeps = {
  openReview: (intent: ReviewNavigationIntent) => void;
};

export type NavigationActions = {
  navigate: (intent: NavigationIntent) => void;
  openThreadSwitcher: () => boolean;
  setThreadSwitcherOpen: (open: boolean) => void;
  openReviewTurn: (params: {
    workspacePath: string;
    conversationId: string;
    threadId?: string | null;
    focusFilePath?: string | null;
    threadTitle?: string | null;
  }) => void;
  openReviewRepo: (params: {
    workspacePath: string;
    conversationId: string;
    threadId?: string | null;
    repoParams: ReviewNavigationIntent['repoParams'];
    focusFilePath?: string | null;
    threadTitle?: string | null;
  }) => void;
};

export type NavigationState = {
  threadSwitcherOpen: boolean;
  lastEvent: NavigationEvent | null;
  actions: NavigationActions;
};

export type NavigationStore = StoreApi<NavigationState>;

export function createNavigationStore(deps: NavigationDeps): NavigationStore {
  let nonce = 0;

  return createStore<NavigationState>()(
    subscribeWithSelector((set, get) => ({
      threadSwitcherOpen: false,
      lastEvent: null,
      actions: {
        navigate: (intent) => {
          nonce += 1;
          set({ lastEvent: { intent, nonce } });

          if (intent.target === 'threadSwitcher') {
            set({ threadSwitcherOpen: true });
            return;
          }

          if (intent.target === 'review') {
            deps.openReview(intent);
            return;
          }
        },
        openThreadSwitcher: () => {
          get().actions.navigate({ target: 'threadSwitcher' });
          return true;
        },
        setThreadSwitcherOpen: (open) => {
          set({ threadSwitcherOpen: open });
        },
        openReviewTurn: ({
          workspacePath,
          conversationId,
          threadId,
          focusFilePath,
          threadTitle,
        }) => {
          get().actions.navigate({
            target: 'review',
            workspacePath,
            conversationId,
            threadId: threadId ?? null,
            mode: 'turn',
            focusFilePath: focusFilePath ?? null,
            threadTitle: threadTitle ?? null,
          });
        },
        openReviewRepo: ({
          workspacePath,
          conversationId,
          threadId,
          repoParams,
          focusFilePath,
          threadTitle,
        }) => {
          if (!repoParams) {
            return;
          }
          get().actions.navigate({
            target: 'review',
            workspacePath,
            conversationId,
            threadId: threadId ?? null,
            mode: 'repo',
            repoParams,
            focusFilePath: focusFilePath ?? null,
            threadTitle: threadTitle ?? null,
          });
        },
      },
    }))
  );
}
