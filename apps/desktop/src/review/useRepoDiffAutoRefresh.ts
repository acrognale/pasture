import { useQueryClient } from '@tanstack/react-query';
import { useEffect, useRef } from 'react';
import { Codex } from '~/codex/client';
import { isTauriEnvironment } from '~/codex/events';

import { invalidateRepoDiffQueriesForWorkspace } from './queries';

const POLL_INTERVAL_MS = 1500;
const INVALIDATE_DEBOUNCE_MS = 250;

export function useRepoDiffAutoRefresh(workspacePath: string) {
  const queryClient = useQueryClient();
  const previousTokenRef = useRef<string | null>(null);
  const isPollingRef = useRef(false);
  const invalidateTimerRef = useRef<number | null>(null);

  useEffect(() => {
    if (!workspacePath) {
      return;
    }
    if (!isTauriEnvironment()) {
      return;
    }

    let cancelled = false;

    const scheduleInvalidate = () => {
      if (invalidateTimerRef.current !== null) {
        window.clearTimeout(invalidateTimerRef.current);
      }
      invalidateTimerRef.current = window.setTimeout(() => {
        void invalidateRepoDiffQueriesForWorkspace(queryClient, workspacePath);
      }, INVALIDATE_DEBOUNCE_MS);
    };

    const pollOnce = async () => {
      if (cancelled) {
        return;
      }
      if (document.visibilityState !== 'visible') {
        return;
      }
      if (isPollingRef.current) {
        return;
      }
      isPollingRef.current = true;
      try {
        const response = await Codex.getRepoFingerprint({ workspacePath });
        if (cancelled) {
          return;
        }
        const nextToken = response.token;
        const previousToken = previousTokenRef.current;
        previousTokenRef.current = nextToken;
        if (previousToken !== null && previousToken !== nextToken) {
          scheduleInvalidate();
        }
      } catch {
        // ignore (polling should never crash the UI)
      } finally {
        isPollingRef.current = false;
      }
    };

    const intervalId = window.setInterval(() => {
      void pollOnce();
    }, POLL_INTERVAL_MS);

    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        void pollOnce();
      }
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);
    void pollOnce();

    return () => {
      cancelled = true;
      isPollingRef.current = false;
      window.clearInterval(intervalId);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      if (invalidateTimerRef.current !== null) {
        window.clearTimeout(invalidateTimerRef.current);
        invalidateTimerRef.current = null;
      }
    };
  }, [queryClient, workspacePath]);
}
