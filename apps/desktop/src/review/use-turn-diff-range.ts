import { useQuery } from '@tanstack/react-query';
import { useMemo } from 'react';
import type {
  GetTurnDiffRangeParams,
  GetTurnDiffRangeResponse,
} from '~/codex.gen';
import { Codex } from '~/codex/client';

import { parseUnifiedDiff } from './diff-parser';
import { turnReviewKeys } from './query-keys';
import type { ParsedTurnDiff } from './types';

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
