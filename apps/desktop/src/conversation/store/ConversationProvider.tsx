import { useQueryClient } from '@tanstack/react-query';
import type { ReactNode } from 'react';
import { startTransition, useEffect, useMemo, useRef } from 'react';
import { toast } from 'sonner';
import { mapConversationEventToApprovalRequest } from '~/approvals/event-utils';
import type { CodexEvent } from '~/codex.gen';
import type { ConversationEventPayload } from '~/codex.gen/ConversationEventPayload';
import type { EventMsg } from '~/codex.gen/EventMsg';
import type { ListConversationsResponse } from '~/codex.gen/ListConversationsResponse';
import {
  derivePreviewFromEvent,
  getAuthUpdatedPayload,
  isAuthUpdatedEvent,
  isConversationEvent,
  isTauriEnvironment,
  subscribeToCodexEvents,
} from '~/codex/events';
import { createWorkspaceKeys } from '~/lib/workspaceKeys';
import {
  updateConversationPreview,
  updateConversationTimestamp,
  useWorkspaceApprovalsStore,
  useWorkspaceConversationStores,
} from '~/workspace';

import type { ConversationSideEffect } from './reducer';

type ConversationProviderProps = {
  workspacePath: string;
  children: ReactNode;
};

const shouldUpdatePreview = (event: EventMsg): boolean => {
  switch (event.type) {
    case 'user_message':
    case 'task_complete':
      return true;
    default:
      return false;
  }
};

const STREAMING_FPS = 24;
const STREAMING_FRAME_MS = 1000 / STREAMING_FPS;
const STREAMING_RELEASE_RATIO = 0.35;

const shouldBypassStreamingQueue = (
  payload: ConversationEventPayload
): boolean => {
  const eventType = payload.event.type;
  return (
    eventType === 'exec_approval_request' ||
    eventType === 'apply_patch_approval_request'
  );
};

const now = () => {
  if (
    typeof performance !== 'undefined' &&
    typeof performance.now === 'function'
  ) {
    return performance.now();
  }
  return Date.now();
};

export function ConversationProvider({
  workspacePath,
  children,
}: ConversationProviderProps) {
  const { applyConversationEvent } = useWorkspaceConversationStores();
  const queryClient = useQueryClient();
  const approvalsStore = useWorkspaceApprovalsStore();
  const keys = useMemo(
    () => createWorkspaceKeys(workspacePath),
    [workspacePath]
  );
  const lastAuthErrorRef = useRef<string | null>(null);
  const deltaQueueRef = useRef<ConversationEventPayload[]>([]);
  const deltaFlushHandleRef = useRef<ReturnType<typeof setTimeout> | null>(
    null
  );
  const lastDeltaFlushRef = useRef<number>(now());

  useEffect(() => {
    if (!workspacePath || !isTauriEnvironment()) {
      return;
    }

    const conversationsKey = keys.conversations();

    const shouldApplyPreviewUpdate = (
      conversationId: string,
      event: EventMsg
    ) => {
      if (event.type === 'user_message' || event.type === 'task_complete') {
        const summaries =
          queryClient.getQueryData<ListConversationsResponse>(conversationsKey);
        if (!summaries) {
          return true;
        }

        const summary = summaries.items.find(
          (item) => item.conversationId === conversationId
        );
        if (!summary) {
          return true;
        }

        const preview = summary.preview ?? '';
        return preview === 'New session' || preview.trim() === '';
      }

      return true;
    };

    const clearScheduledFlush = () => {
      if (deltaFlushHandleRef.current) {
        clearTimeout(deltaFlushHandleRef.current);
        deltaFlushHandleRef.current = null;
      }
    };

    const processPayload = (payload: ConversationEventPayload) => {
      const conversationId = payload.conversationId;
      if (!conversationId) {
        return;
      }

      const applyPayload = () => {
        const store = applyConversationEvent(payload);
        if (!store) {
          return;
        }

        const timestamp = payload.timestamp;

        if (payload.event.type === 'user_message') {
          updateConversationTimestamp(
            queryClient,
            conversationsKey,
            conversationId,
            timestamp
          );
        }

        if (shouldUpdatePreview(payload.event)) {
          const preview = derivePreviewFromEvent(payload.event);
          if (
            preview &&
            shouldApplyPreviewUpdate(conversationId, payload.event)
          ) {
            updateConversationPreview(
              queryClient,
              conversationsKey,
              conversationId,
              preview,
              timestamp
            );
          }
        }

        const approvalRequest = mapConversationEventToApprovalRequest(payload);
        if (approvalRequest) {
          approvalsStore.getState().enqueue(approvalRequest);
        }

        runSideEffects(store.getState().drainSideEffects());
      };

      startTransition(applyPayload);
    };

    const flushDeltaEvents = () => {
      deltaFlushHandleRef.current = null;
      const queue = deltaQueueRef.current;
      if (queue.length === 0) {
        return;
      }

      const currentTime = now();
      const elapsed = currentTime - lastDeltaFlushRef.current;
      const framesElapsed = Math.max(
        1,
        Math.round(elapsed / STREAMING_FRAME_MS)
      );
      lastDeltaFlushRef.current = currentTime;

      const interpolateCount = Math.max(
        1,
        Math.round(queue.length * STREAMING_RELEASE_RATIO)
      );
      const eventsToProcess = Math.min(
        queue.length,
        Math.max(framesElapsed, interpolateCount)
      );
      const batch = queue.splice(0, eventsToProcess);
      batch.forEach((payload) => {
        processPayload(payload);
      });

      if (queue.length > 0) {
        deltaFlushHandleRef.current = setTimeout(
          flushDeltaEvents,
          STREAMING_FRAME_MS
        );
      }
    };

    const enqueueDeltaPayload = (payload: ConversationEventPayload) => {
      if (shouldBypassStreamingQueue(payload)) {
        processPayload(payload);
        return;
      }

      deltaQueueRef.current.push(payload);
      if (!deltaFlushHandleRef.current) {
        lastDeltaFlushRef.current = now();
        deltaFlushHandleRef.current = setTimeout(
          flushDeltaEvents,
          STREAMING_FRAME_MS
        );
      }
    };

    const handleConversationEvent = (
      event: CodexEvent & { kind: 'conversation-event' }
    ) => {
      const payload: ConversationEventPayload = event.payload;

      enqueueDeltaPayload(payload);
    };

    const handleAuthUpdated = (
      event: CodexEvent & { kind: 'auth-updated' }
    ) => {
      const authPayload = getAuthUpdatedPayload(event);
      queryClient.setQueryData(['auth'], authPayload);

      if (authPayload.lastError) {
        if (authPayload.lastError !== lastAuthErrorRef.current) {
          toast.error('Authentication error', {
            description: authPayload.lastError,
          });
        }
        lastAuthErrorRef.current = authPayload.lastError;
      } else {
        lastAuthErrorRef.current = null;
      }
    };

    const unsubscribe = subscribeToCodexEvents((event: CodexEvent) => {
      if (isConversationEvent(event)) {
        handleConversationEvent(event);
        return;
      }

      if (isAuthUpdatedEvent(event)) {
        handleAuthUpdated(event);
        return;
      }
    });

    return () => {
      unsubscribe?.();
      lastAuthErrorRef.current = null;
      clearScheduledFlush();
      deltaQueueRef.current = [];
    };
  }, [
    applyConversationEvent,
    approvalsStore,
    keys,
    queryClient,
    workspacePath,
  ]);

  return <>{children}</>;
}

const runSideEffects = (effects: ConversationSideEffect[]) => {
  effects.forEach((effect) => {
    const description = effect.description;
    if (effect.variant === 'error') {
      toast.error(effect.title, { description });
    } else {
      toast(effect.title, { description });
    }
  });
};
