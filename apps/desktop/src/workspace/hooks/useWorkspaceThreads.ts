import { useQuery } from '@tanstack/react-query';
import { useMemo } from 'react';
import type { ThreadSummary } from '~/codex.gen/ThreadSummary';
import { Codex } from '~/codex/client';

import {
  useWorkspace,
  useWorkspaceKeys,
  useWorkspaceOpenThreads,
} from '../WorkspaceProvider';
import {
  filterThreadsForWorkspace,
  sortThreadsByTimestamp,
} from '../conversations';

export type WorkspaceThreadsState = {
  items: ThreadSummary[];
};

export type WorkspaceOpenThreadsState = {
  items: ThreadSummary[];
};

export const useWorkspaceThreads = () => {
  const { workspacePath, normalizedWorkspacePath } = useWorkspace();
  const keys = useWorkspaceKeys();

  const query = useQuery<WorkspaceThreadsState>({
    queryKey: keys.threads(),
    queryFn: async () => {
      if (!normalizedWorkspacePath) {
        return { items: [] };
      }

      const response = await Codex.listThreads({
        workspacePath: normalizedWorkspacePath,
      });

      const filtered = filterThreadsForWorkspace(
        response.items ?? [],
        normalizedWorkspacePath
      );

      return {
        items: sortThreadsByTimestamp(filtered),
      };
    },
    enabled: Boolean(workspacePath),
    refetchOnWindowFocus: false,
  });

  return {
    items: query.data?.items ?? [],
    query,
  };
};

export const useOpenWorkspaceThreads = () => {
  const base = useWorkspaceThreads();
  const openThreadIds = useWorkspaceOpenThreads();

  const openItems = useMemo(() => {
    const openSet = new Set(openThreadIds);
    return base.items.filter((item) => openSet.has(item.threadId));
  }, [base.items, openThreadIds]);

  return {
    items: openItems,
    query: base.query,
  };
};
