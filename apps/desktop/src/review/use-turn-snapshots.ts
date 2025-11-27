import { useQuery } from '@tanstack/react-query';
import { useMemo } from 'react';
import type { ListTurnSnapshotsResponse } from '~/codex.gen';
import { Codex } from '~/codex/client';

import { turnReviewKeys } from './query-keys';

const DISABLED_RESPONSE: ListTurnSnapshotsResponse = {
  disabled: true,
  baseCommitId: null,
  snapshots: [],
};

export const useTurnSnapshots = (conversationId: string | null) => {
  const query = useQuery<ListTurnSnapshotsResponse>({
    queryKey: turnReviewKeys.snapshots(conversationId ?? ''),
    queryFn: async () => {
      if (!conversationId) {
        return DISABLED_RESPONSE;
      }
      try {
        return await Codex.listTurnSnapshots({ conversationId });
      } catch (error) {
        console.debug('[TurnReview] Failed to load snapshot metadata', error);
        return DISABLED_RESPONSE;
      }
    },
    enabled: Boolean(conversationId),
    refetchOnWindowFocus: false,
  });

  const turnSnapshots = useMemo<ReadonlyMap<string, string>>(() => {
    const data = query.data;
    if (!data) {
      return new Map();
    }
    const entries = new Map<string, string>();
    for (const descriptor of data.snapshots) {
      entries.set(descriptor.eventId, descriptor.commitId);
    }
    return entries;
  }, [query.data]);

  return {
    snapshotDisabled: query.data?.disabled ?? true,
    baselineSnapshotId: query.data?.baseCommitId ?? null,
    turnSnapshots,
    query,
  };
};
