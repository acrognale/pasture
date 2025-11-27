import {
  type UseQueryResult,
  useQuery,
  useQueryClient,
} from '@tanstack/react-query';
import { useEffect } from 'react';
import type { Conversation } from '~/codex.gen/Conversation';
import type { ListThreadConversationsResponse } from '~/codex.gen/ListThreadConversationsResponse';
import { Codex } from '~/codex/client';

import { useWorkspace, useWorkspaceKeys } from '../WorkspaceProvider';
import type { WorkspaceThreadsState } from './useWorkspaceThreads';

type ThreadConversationsQueryResult = {
  conversations: Conversation[];
  currentConversationId: string | null;
  query: UseQueryResult<ListThreadConversationsResponse, Error>;
};

export const useWorkspaceThreadConversations = (
  threadId: string | null
): ThreadConversationsQueryResult => {
  const { workspacePath } = useWorkspace();
  const keys = useWorkspaceKeys();
  const queryClient = useQueryClient();

  const query = useQuery<ListThreadConversationsResponse, Error>({
    queryKey: threadId
      ? keys.threadConversations(threadId)
      : ([
          'workspace',
          workspacePath,
          'thread',
          'conversations',
          '__none',
        ] as const),
    queryFn: async () => {
      if (!threadId) {
        throw new Error('threadId is required to load conversations');
      }
      return await Codex.listThreadConversations({
        workspacePath,
        threadId,
      });
    },
    enabled: Boolean(threadId && workspacePath),
    staleTime: Infinity,
    gcTime: Infinity,
    refetchOnMount: false,
    refetchOnWindowFocus: false,
  });

  useEffect(() => {
    if (!query.data) {
      return;
    }
    const data = query.data;
    queryClient.setQueryData<WorkspaceThreadsState | undefined>(
      keys.threads(),
      (state) => {
        if (!state) {
          return state;
        }
        const index = state.items.findIndex(
          (item) => item.threadId === data.threadId
        );
        if (index === -1) {
          return state;
        }

        const updated = {
          ...state.items[index],
          currentConversationId: data.currentConversationId,
          conversationCount: data.conversations.length,
        };
        const items = [...state.items];
        items[index] = updated;
        return { ...state, items };
      }
    );
  }, [keys, query.data, queryClient]);

  const conversations = query.data?.conversations ?? [];
  const currentConversationId = query.data?.currentConversationId ?? null;

  return {
    conversations,
    currentConversationId,
    query,
  };
};
