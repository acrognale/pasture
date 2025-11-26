import type { QueryClient } from '@tanstack/react-query';
import type { ListThreadConversationsResponse } from '~/codex.gen/ListThreadConversationsResponse';
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
    (state: WorkspaceThreadsState | undefined) => {
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
        conversationCount: (state.items[index]?.conversationCount ?? 0) + 1,
        timestamp: createdAt,
      };
      const items = [...state.items];
      items[index] = updated;
      return { ...state, items };
    }
  );

  queryClient.setQueryData<ListThreadConversationsResponse | undefined>(
    keys.threadConversations(threadId),
    (state: ListThreadConversationsResponse | undefined) => {
      const conversations = state?.conversations ?? [];
      const existingIndex = conversations.findIndex(
        (item) => item.id === conversationId
      );
      const nextConversations =
        existingIndex === -1
          ? [
              ...conversations,
              {
                id: conversationId,
                threadId,
                rolloutPath,
                createdAt,
                label: null,
                parentConversationId: forkBaseConversationId,
                forkedAtNthUserMessage: forkNthUserMessage,
              },
            ]
          : [
              ...conversations.slice(0, existingIndex),
              {
                id: conversationId,
                threadId,
                rolloutPath,
                createdAt,
                label: null,
                parentConversationId: forkBaseConversationId,
                forkedAtNthUserMessage: forkNthUserMessage,
              },
              ...conversations.slice(existingIndex + 1),
            ];

      return {
        threadId,
        currentConversationId: conversationId,
        conversations: nextConversations,
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
    (state: WorkspaceThreadsState | undefined) => {
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

  queryClient.setQueryData<ListThreadConversationsResponse | undefined>(
    keys.threadConversations(threadId),
    (state: ListThreadConversationsResponse | undefined) =>
      state ? { ...state, currentConversationId: conversationId } : state
  );
};
