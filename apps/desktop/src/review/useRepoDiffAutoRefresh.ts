import type { RepoChangedPayload } from '@pasture/protocol';
import { useQueryClient } from '@tanstack/react-query';
import { useEffect, useRef } from 'react';
import { listen } from '@tauri-apps/api/event';
import { Codex } from '~/codex/client';
import { isTauriEnvironment } from '~/codex/events';

import { invalidateRepoDiffQueriesForWorkspace } from './queries';

const INVALIDATE_DEBOUNCE_MS = 250;

export function useRepoDiffAutoRefresh(workspacePath: string) {
  const queryClient = useQueryClient();
  const invalidateTimerRef = useRef<number | null>(null);

  useEffect(() => {
    if (!workspacePath) {
      return;
    }
    if (!isTauriEnvironment()) {
      return;
    }

    let cancelled = false;
    let subscriptionId: string | null = null;

    const scheduleInvalidate = () => {
      if (invalidateTimerRef.current !== null) {
        window.clearTimeout(invalidateTimerRef.current);
      }
      invalidateTimerRef.current = window.setTimeout(() => {
        void invalidateRepoDiffQueriesForWorkspace(queryClient, workspacePath);
      }, INVALIDATE_DEBOUNCE_MS);
    };

    const unlistenPromise = listen<RepoChangedPayload>('repo://changed', (event) => {
      if (cancelled) {
        return;
      }
      if (document.visibilityState !== 'visible') {
        return;
      }
      if (event.payload.workspacePath !== workspacePath) {
        return;
      }
      scheduleInvalidate();
    });

    void Codex.startRepoWatch({ workspacePath })
      .then((response) => {
        if (cancelled) {
          void Codex.stopRepoWatch({ subscriptionId: response.subscriptionId });
          return;
        }
        subscriptionId = response.subscriptionId;
      })
      .catch(() => {
        // ignore (watching should never crash the UI)
      });

    return () => {
      cancelled = true;
      void unlistenPromise.then((unlisten) => unlisten());
      if (subscriptionId) {
        void Codex.stopRepoWatch({ subscriptionId });
      }
      if (invalidateTimerRef.current !== null) {
        window.clearTimeout(invalidateTimerRef.current);
        invalidateTimerRef.current = null;
      }
    };
  }, [queryClient, workspacePath]);
}
