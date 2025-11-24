import {
  type UseQueryResult,
  useQuery,
  useQueryClient,
} from '@tanstack/react-query';
import { useEffect, useMemo } from 'react';
import type { ListThreadRolloutsResponse } from '~/codex.gen/ListThreadRolloutsResponse';
import type { ThreadRollout } from '~/codex.gen/ThreadRollout';
import { Codex } from '~/codex/client';

import { useWorkspace, useWorkspaceKeys } from '../WorkspaceProvider';
import type { WorkspaceThreadsState } from './useWorkspaceThreads';

const computeThreadVersionGroupsInternal = (
  rollouts: ThreadRollout[]
): Map<number, ThreadRollout[]> => {
  const byConversationId = new Map(
    rollouts.map((rollout) => [rollout.conversationId, rollout])
  );
  const groups = new Map<number, ThreadRollout[]>();
  const seenByNth = new Map<number, Set<string>>();

  rollouts.forEach((rollout) => {
    const nth = rollout.forkedFromNthUserMessage;
    if (nth == null) {
      return;
    }

    let current: ThreadRollout | undefined = rollout;
    while (current) {
      const seen = seenByNth.get(nth) ?? new Set<string>();
      const group = groups.get(nth) ?? [];
      if (!seen.has(current.conversationId)) {
        group.push(current);
        seen.add(current.conversationId);
        groups.set(nth, group);
        seenByNth.set(nth, seen);
      }

      if (!current.forkedFromConversationId) {
        break;
      }
      current = byConversationId.get(current.forkedFromConversationId);
    }
  });

  groups.forEach((group, nth) => {
    const sorted = [...group].sort((a, b) => {
      const dateComparison = a.createdAt.localeCompare(b.createdAt);
      if (dateComparison !== 0) {
        return dateComparison;
      }
      return a.conversationId.localeCompare(b.conversationId);
    });
    groups.set(nth, sorted);
  });

  return groups;
};

export const computeThreadVersionGroups = (
  rollouts: ThreadRollout[]
): Map<number, ThreadRollout[]> => computeThreadVersionGroupsInternal(rollouts);

type ThreadRolloutsQueryResult = {
  rollouts: ThreadRollout[];
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
  groups: Map<number, ThreadRollout[]>;
  rollouts: ThreadRollout[];
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
