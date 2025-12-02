import type {
  GetTurnDiffRangeParams,
  GetTurnDiffRangeResponse,
  ListTurnSnapshotsResponse,
} from '@pasture/protocol';
import { useQuery } from '@tanstack/react-query';
import { useMemo } from 'react';
import { Codex } from '~/codex/client';

import { parseUnifiedDiff } from './diff';
import type { ParsedTurnDiff } from './types';

// Query keys
export const turnReviewKeys = {
  snapshots: (conversationId: string) =>
    ['turnReview', 'snapshots', conversationId] as const,
  diffRange: (params: GetTurnDiffRangeParams) =>
    [
      'turnReview',
      'diffRange',
      params.conversationId,
      params.baseEventId,
      params.targetEventId,
    ] as const,
};

// useTurnDiffRange
const RETRY_DELAY_MS = 1500;
const MAX_RETRIES = 3;

const isSnapshotUnavailableError = (error: unknown): boolean => {
  if (error instanceof Error) {
    return error.message.toLowerCase().includes('snapshot data unavailable');
  }
  if (typeof error === 'string') {
    return error.toLowerCase().includes('snapshot data unavailable');
  }
  return false;
};

export const useTurnDiffRange = (params: GetTurnDiffRangeParams | null) => {
  const query = useQuery<GetTurnDiffRangeResponse>({
    queryKey: params
      ? turnReviewKeys.diffRange(params)
      : (['turnReview', 'diffRange', '__disabled'] as const),
    queryFn: async () => {
      if (!params) {
        throw new Error('params is required');
      }
      return Codex.getTurnDiffRange(params);
    },
    enabled: Boolean(params),
    refetchOnWindowFocus: false,
    retry: (failureCount, error) => {
      if (!isSnapshotUnavailableError(error)) {
        return false;
      }
      return failureCount < MAX_RETRIES;
    },
    retryDelay: RETRY_DELAY_MS,
  });

  const parsedDiff = useMemo<ParsedTurnDiff | null>(() => {
    const raw = query.data?.unifiedDiff;
    if (!raw || !raw.trim()) {
      return null;
    }
    return parseUnifiedDiff(raw);
  }, [query.data?.unifiedDiff]);

  return {
    rawDiff: query.data?.unifiedDiff ?? null,
    parsedDiff,
    query,
  };
};

// useTurnSnapshots
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
