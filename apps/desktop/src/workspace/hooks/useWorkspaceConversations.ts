import { useQuery } from '@tanstack/react-query';
import { useMemo } from 'react';
import type { ConversationSummary } from '~/codex.gen/ConversationSummary';
import { Codex } from '~/codex/client';
import { mapThreadToConversationSummary } from '~/workspace/conversations';

import { useWorkspace, useWorkspaceKeys } from '../WorkspaceProvider';
import { sortConversationsByTimestamp } from '../conversations';
import { useOpenWorkspaceThreads } from './useWorkspaceThreads';

export type WorkspaceConversationsState = {
  items: ConversationSummary[];
  nextCursor: string | null;
};

export type WorkspaceOpenConversationsState = {
  items: ConversationSummary[];
  nextCursor: null;
};

export const useWorkspaceConversations = () => {
  const { workspacePath, normalizedWorkspacePath } = useWorkspace();
  const keys = useWorkspaceKeys();

  const query = useQuery<WorkspaceConversationsState>({
    queryKey: keys.conversations(),
    queryFn: async () => {
      if (!normalizedWorkspacePath) {
        return { items: [], nextCursor: null };
      }

      const response = await Codex.listThreads({
        workspacePath: normalizedWorkspacePath,
      });

      const mapped = (response.items ?? []).map((thread) =>
        mapThreadToConversationSummary(thread, normalizedWorkspacePath)
      );

      return {
        items: sortConversationsByTimestamp(mapped),
        nextCursor: null,
      };
    },
    enabled: Boolean(workspacePath),
    refetchOnWindowFocus: false,
  });

  return {
    items: query.data?.items ?? [],
    query,
    hasMore: false,
    loadMore: undefined,
    isLoadingMore: false,
  };
};

export const useOpenWorkspaceConversations = () => {
  const threads = useOpenWorkspaceThreads();
  const { normalizedWorkspacePath } = useWorkspace();

  const openItems: ConversationSummary[] = useMemo(
    () =>
      threads.items.map((thread) =>
        mapThreadToConversationSummary(thread, normalizedWorkspacePath)
      ),
    [normalizedWorkspacePath, threads.items]
  );

  return {
    items: openItems,
    query: threads.query,
    hasMore: false,
    loadMore: undefined,
    isLoadingMore: false,
  };
};
