import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useCallback, useState } from 'react';
import type { ConversationSummary } from '~/codex.gen/ConversationSummary';
import { Codex } from '~/codex/client';

import { useWorkspace, useWorkspaceKeys } from '../WorkspaceProvider';
import {
  filterSummariesForWorkspace,
  sortConversationsByTimestamp,
} from '../conversations';

const PAGE_SIZE = 25;

export type WorkspaceConversationsState = {
  items: ConversationSummary[];
  nextCursor: string | null;
};

export const useWorkspaceConversations = () => {
  const { workspacePath, normalizedWorkspacePath } = useWorkspace();
  const keys = useWorkspaceKeys();
  const queryClient = useQueryClient();
  const [isLoadingMore, setIsLoadingMore] = useState(false);

  const query = useQuery<WorkspaceConversationsState>({
    queryKey: keys.conversations(),
    queryFn: async () => {
      if (!normalizedWorkspacePath) {
        return { items: [], nextCursor: null };
      }

      const response = await Codex.listConversations({
        workspacePath: normalizedWorkspacePath,
        cursor: null,
        limit: PAGE_SIZE,
        modelProviders: null,
      });

      const filtered = filterSummariesForWorkspace(
        response.items ?? [],
        normalizedWorkspacePath
      );

      return {
        items: sortConversationsByTimestamp(filtered),
        nextCursor: response.nextCursor ?? null,
      };
    },
    enabled: Boolean(workspacePath),
    refetchOnWindowFocus: false,
  });

  const loadMore = useCallback(async () => {
    const current = queryClient.getQueryData<WorkspaceConversationsState>(
      keys.conversations()
    );
    const cursor = current?.nextCursor;
    if (!cursor || isLoadingMore || !normalizedWorkspacePath) {
      return;
    }

    setIsLoadingMore(true);
    try {
      const response = await Codex.listConversations({
        workspacePath: normalizedWorkspacePath,
        cursor,
        limit: PAGE_SIZE,
        modelProviders: null,
      });

      const filtered = filterSummariesForWorkspace(
        response.items ?? [],
        normalizedWorkspacePath
      );

      queryClient.setQueryData<WorkspaceConversationsState | undefined>(
        keys.conversations(),
        (state) => {
          const existingItems = state?.items ?? [];
          const existingIds = new Set(
            existingItems.map((item) => item.conversationId)
          );
          const mergedItems = [
            ...existingItems,
            ...filtered.filter((item) => !existingIds.has(item.conversationId)),
          ];
          return {
            items: sortConversationsByTimestamp(mergedItems),
            nextCursor: response.nextCursor ?? null,
          };
        }
      );
    } finally {
      setIsLoadingMore(false);
    }
  }, [isLoadingMore, keys, normalizedWorkspacePath, queryClient]);

  return {
    items: query.data?.items ?? [],
    query,
    hasMore: Boolean(query.data?.nextCursor),
    loadMore,
    isLoadingMore,
  };
};
