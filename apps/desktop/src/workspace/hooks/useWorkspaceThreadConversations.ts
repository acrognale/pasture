import {
  type UseQueryResult,
  useQuery,
  useQueryClient,
} from '@tanstack/react-query';
import { useEffect, useMemo } from 'react';
import type { Conversation } from '~/codex.gen/Conversation';
import type { ListThreadConversationsResponse } from '~/codex.gen/ListThreadConversationsResponse';
import { Codex } from '~/codex/client';

import { useWorkspace, useWorkspaceKeys } from '../WorkspaceProvider';
import type { WorkspaceThreadsState } from './useWorkspaceThreads';

const computeThreadVersionGroupsInternal = (
  conversations: Conversation[]
): Map<number, Conversation[]> => {
  const byConversationId = new Map(
    conversations.map((conv) => [conv.id, conv])
  );
  const groups = new Map<number, Conversation[]>();
  const seenByNth = new Map<number, Set<string>>();

  conversations.forEach((conv) => {
    const nth = conv.forkedAtNthUserMessage;
    if (nth == null) {
      return;
    }

    let current: Conversation | undefined = conv;
    while (current) {
      const seen = seenByNth.get(nth) ?? new Set<string>();
      const group = groups.get(nth) ?? [];
      if (!seen.has(current.id)) {
        group.push(current);
        seen.add(current.id);
        groups.set(nth, group);
        seenByNth.set(nth, seen);
      }

      if (!current.parentConversationId) {
        break;
      }
      current = byConversationId.get(current.parentConversationId);
    }
  });

  groups.forEach((group, nth) => {
    const sorted = [...group].sort((a, b) => {
      const dateComparison = a.createdAt.localeCompare(b.createdAt);
      if (dateComparison !== 0) {
        return dateComparison;
      }
      return a.id.localeCompare(b.id);
    });
    groups.set(nth, sorted);
  });

  return groups;
};

export const computeThreadVersionGroups = (
  conversations: Conversation[]
): Map<number, Conversation[]> =>
  computeThreadVersionGroupsInternal(conversations);

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

type ThreadVersionGroupsResult = {
  groups: Map<number, Conversation[]>;
  conversations: Conversation[];
  currentConversationId: string | null;
  query: UseQueryResult<ListThreadConversationsResponse, Error>;
};

export const useThreadVersionGroups = (
  threadId: string | null
): ThreadVersionGroupsResult => {
  const { conversations, currentConversationId, query } =
    useWorkspaceThreadConversations(threadId);

  const groups = useMemo(
    () => computeThreadVersionGroups(conversations),
    [conversations]
  );

  return {
    groups,
    conversations,
    currentConversationId,
    query,
  };
};
