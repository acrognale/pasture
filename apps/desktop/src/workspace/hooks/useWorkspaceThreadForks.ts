import {
  type UseQueryResult,
  useQuery,
  useQueryClient,
} from '@tanstack/react-query';
import { useEffect, useMemo } from 'react';
import type { Fork } from '~/codex.gen/Fork';
import type { ListThreadForksResponse } from '~/codex.gen/ListThreadForksResponse';
import { Codex } from '~/codex/client';

import { useWorkspace, useWorkspaceKeys } from '../WorkspaceProvider';
import type { WorkspaceThreadsState } from './useWorkspaceThreads';

const computeThreadVersionGroupsInternal = (
  forks: Fork[]
): Map<number, Fork[]> => {
  const byConversationId = new Map(forks.map((fork) => [fork.id, fork]));
  const groups = new Map<number, Fork[]>();
  const seenByNth = new Map<number, Set<string>>();

  forks.forEach((fork) => {
    const nth = fork.forkPoint?.afterMessage;
    if (nth == null) {
      return;
    }

    let current: Fork | undefined = fork;
    while (current) {
      const seen = seenByNth.get(nth) ?? new Set<string>();
      const group = groups.get(nth) ?? [];
      if (!seen.has(current.id)) {
        group.push(current);
        seen.add(current.id);
        groups.set(nth, group);
        seenByNth.set(nth, seen);
      }

      if (!current.forkPoint?.forkId) {
        break;
      }
      current = byConversationId.get(current.forkPoint.forkId);
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
  forks: Fork[]
): Map<number, Fork[]> => computeThreadVersionGroupsInternal(forks);

type ThreadForksQueryResult = {
  forks: Fork[];
  currentConversationId: string | null;
  query: UseQueryResult<ListThreadForksResponse, Error>;
};

export const useWorkspaceThreadForks = (
  threadId: string | null
): ThreadForksQueryResult => {
  const { workspacePath } = useWorkspace();
  const keys = useWorkspaceKeys();
  const queryClient = useQueryClient();

  const query = useQuery<ListThreadForksResponse, Error>({
    queryKey: threadId
      ? keys.threadForks(threadId)
      : (['workspace', workspacePath, 'thread', 'forks', '__none'] as const),
    queryFn: async () => {
      if (!threadId) {
        throw new Error('threadId is required to load forks');
      }
      return await Codex.listThreadForks({
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
          forkCount: data.forks.length,
        };
        const items = [...state.items];
        items[index] = updated;
        return { ...state, items };
      }
    );
  }, [keys, query.data, queryClient]);

  const forks = query.data?.forks ?? [];
  const currentConversationId = query.data?.currentConversationId ?? null;

  return {
    forks,
    currentConversationId,
    query,
  };
};

type ThreadVersionGroupsResult = {
  groups: Map<number, Fork[]>;
  forks: Fork[];
  currentConversationId: string | null;
  query: UseQueryResult<ListThreadForksResponse, Error>;
};

export const useThreadVersionGroups = (
  threadId: string | null
): ThreadVersionGroupsResult => {
  const { forks, currentConversationId, query } =
    useWorkspaceThreadForks(threadId);

  const groups = useMemo(() => computeThreadVersionGroups(forks), [forks]);

  return {
    groups,
    forks,
    currentConversationId,
    query,
  };
};
