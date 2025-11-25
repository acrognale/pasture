import {
  type UseQueryResult,
  useQuery,
  useQueryClient,
} from '@tanstack/react-query';
import { useEffect, useMemo } from 'react';
import type { Fork } from '~/codex.gen/Fork';
import type { ListThreadRolloutsResponse } from '~/codex.gen/ListThreadRolloutsResponse';
import { Codex } from '~/codex/client';

import { useWorkspace, useWorkspaceKeys } from '../WorkspaceProvider';
import type { WorkspaceThreadsState } from './useWorkspaceThreads';

const computeThreadVersionGroupsInternal = (
  rollouts: Fork[]
): Map<number, Fork[]> => {
  const byConversationId = new Map(
    rollouts.map((rollout) => [rollout.id, rollout])
  );
  const groups = new Map<number, Fork[]>();
  const seenByNth = new Map<number, Set<string>>();

  rollouts.forEach((rollout) => {
    const nth = rollout.forkPoint?.afterMessage;
    if (nth == null) {
      return;
    }

    let current: Fork | undefined = rollout;
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
  rollouts: Fork[]
): Map<number, Fork[]> => computeThreadVersionGroupsInternal(rollouts);

type ThreadRolloutsQueryResult = {
  rollouts: Fork[];
  currentConversationId: string | null;
  query: UseQueryResult<ListThreadRolloutsResponse, Error>;
};

export const useWorkspaceThreadRollouts = (
  threadId: string | null
): ThreadRolloutsQueryResult => {
  const { workspacePath } = useWorkspace();
  const keys = useWorkspaceKeys();
  const queryClient = useQueryClient();

  const query = useQuery<ListThreadRolloutsResponse, Error>({
    queryKey: threadId
      ? keys.threadRollouts(threadId)
      : (['workspace', workspacePath, 'thread', 'rollouts', '__none'] as const),
    queryFn: async () => {
      if (!threadId) {
        throw new Error('threadId is required to load rollouts');
      }
      return await Codex.listThreadRollouts({
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
          rolloutCount: data.rollouts.length,
        };
        const items = [...state.items];
        items[index] = updated;
        return { ...state, items };
      }
    );
  }, [keys, query.data, queryClient]);

  const rollouts = query.data?.rollouts ?? [];
  const currentConversationId = query.data?.currentConversationId ?? null;

  return {
    rollouts,
    currentConversationId,
    query,
  };
};

type ThreadVersionGroupsResult = {
  groups: Map<number, Fork[]>;
  rollouts: Fork[];
  currentConversationId: string | null;
  query: UseQueryResult<ListThreadRolloutsResponse, Error>;
};

export const useThreadVersionGroups = (
  threadId: string | null
): ThreadVersionGroupsResult => {
  const { rollouts, currentConversationId, query } =
    useWorkspaceThreadRollouts(threadId);

  const groups = useMemo(
    () => computeThreadVersionGroups(rollouts),
    [rollouts]
  );

  return {
    groups,
    rollouts,
    currentConversationId,
    query,
  };
};
