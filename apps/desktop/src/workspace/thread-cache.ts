import type { QueryClient } from '@tanstack/react-query';
import type { ListThreadRolloutsResponse } from '~/codex.gen/ListThreadRolloutsResponse';
import type { WorkspaceKeys } from '~/lib/workspaceKeys';

import type { WorkspaceThreadsState } from './hooks/useWorkspaceThreads';

type UpdateThreadOnForkArgs = {
  threadId: string;
  conversationId: string;
  rolloutPath: string;
  createdAt: string;
  forkBaseConversationId: string;
  forkNthUserMessage: number;
};

type UpdateThreadOnSwitchArgs = {
  threadId: string;
  conversationId: string;
};

export const updateThreadOnFork = (
  queryClient: QueryClient,
  keys: WorkspaceKeys,
  {
    threadId,
    conversationId,
    rolloutPath,
    createdAt,
    forkBaseConversationId,
    forkNthUserMessage,
  }: UpdateThreadOnForkArgs
) => {
  queryClient.setQueryData<WorkspaceThreadsState | undefined>(
    keys.threads(),
    (state) => {
      if (!state) {
        return state;
      }
      const index = state.items.findIndex(
        (thread) => thread.threadId === threadId
      );
      if (index === -1) {
        return state;
      }
      const updated = {
        ...state.items[index],
        currentConversationId: conversationId,
        rolloutCount: (state.items[index]?.rolloutCount ?? 0) + 1,
        timestamp: createdAt,
      };
      const items = [...state.items];
      items[index] = updated;
      return { ...state, items };
    }
  );

  queryClient.setQueryData<ListThreadRolloutsResponse | undefined>(
    keys.threadRollouts(threadId),
    (state) => {
      const rollouts = state?.rollouts ?? [];
      const existingIndex = rollouts.findIndex(
        (item) => item.id === conversationId
      );
      const nextRollouts =
        existingIndex === -1
          ? [
              ...rollouts,
              {
                id: conversationId,
                threadId,
                rolloutPath,
                createdAt,
                label: null,
                forkPoint: {
                  forkId: forkBaseConversationId,
                  afterMessage: forkNthUserMessage,
                },
              },
            ]
          : [
              ...rollouts.slice(0, existingIndex),
              {
                id: conversationId,
                threadId,
                rolloutPath,
                createdAt,
                label: null,
                forkPoint: {
                  forkId: forkBaseConversationId,
                  afterMessage: forkNthUserMessage,
                },
              },
              ...rollouts.slice(existingIndex + 1),
            ];

      return {
        threadId,
        currentConversationId: conversationId,
        rollouts: nextRollouts,
      };
    }
  );
};

export const updateThreadOnSwitch = (
  queryClient: QueryClient,
  keys: WorkspaceKeys,
  { threadId, conversationId }: UpdateThreadOnSwitchArgs
) => {
  const timestamp = new Date().toISOString();

  queryClient.setQueryData<WorkspaceThreadsState | undefined>(
    keys.threads(),
    (state) => {
      if (!state) {
        return state;
      }
      const index = state.items.findIndex(
        (thread) => thread.threadId === threadId
      );
      if (index === -1) {
        return state;
      }
      const updated = {
        ...state.items[index],
        currentConversationId: conversationId,
        timestamp,
      };
      const items = [...state.items];
      items[index] = updated;
      return { ...state, items };
    }
  );

  queryClient.setQueryData<ListThreadRolloutsResponse | undefined>(
    keys.threadRollouts(threadId),
    (state) =>
      state ? { ...state, currentConversationId: conversationId } : state
  );
};
