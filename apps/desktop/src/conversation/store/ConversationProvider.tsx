import type { ConversationEventPayload } from '@pasture/protocol';
import type { EventMsg } from '@pasture/protocol';
import type { ThreadSummary } from '@pasture/protocol';
import type { CodexEvent } from '@pasture/protocol';
import { TranscriptProvider } from '@pasture/transcript-ui';
import { useQueryClient } from '@tanstack/react-query';
import { convertFileSrc } from '@tauri-apps/api/core';
import type { ReactNode } from 'react';
import {
  startTransition,
  useCallback,
  useEffect,
  useMemo,
  useRef,
} from 'react';
import { toast } from 'sonner';
import { mapConversationEventToApprovalRequest } from '~/approvals/event-utils';
import {
  derivePreviewFromEvent,
  getAuthUpdatedPayload,
  getThreadMetadataPayload,
  isAuthUpdatedEvent,
  isConversationEvent,
  isTauriEnvironment,
  isThreadMetadataUpdatedEvent,
  subscribeToCodexEvents,
} from '~/codex/events';
import { copyToClipboard } from '~/lib/utils';
import { createWorkspaceKeys } from '~/lib/workspaceKeys';
import { notifyTurnError, notifyTurnFinished } from '~/notifications/turns';
import {
  updateConversationPreview,
  updateConversationTimestamp,
  updateThreadPreview,
  updateThreadTimestamp,
  updateThreadTitle,
  useWorkspaceActions,
  useWorkspaceApprovalsStore,
} from '~/workspace';
import type { WorkspaceConversationsState } from '~/workspace/conversations';

import type { ConversationSideEffect } from './reducer';
import { dispatchOpenReviewMapOverlayEvent } from '../events';

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

export function ConversationProvider({
  workspacePath,
  children,
}: ConversationProviderProps) {
  const { applyConversationEvent, getThreadIdForConversation } =
    useWorkspaceActions();
  const queryClient = useQueryClient();
  const approvalsStore = useWorkspaceApprovalsStore();
  const keys = useMemo(
    () => createWorkspaceKeys(workspacePath),
    [workspacePath]
  );
  const lastAuthErrorRef = useRef<string | null>(null);

  useEffect(() => {
    if (!workspacePath || !isTauriEnvironment()) {
      return;
    }

    const conversationsKey = keys.conversations();
    const threadsKey = keys.threads();

    const getThreadTitle = (
      threadId: string | null | undefined
    ): string | null => {
      if (!threadId) return null;

      const threads = queryClient.getQueryData<{ items: ThreadSummary[] }>(
        threadsKey
      );
      return (
        threads?.items.find((item) => item.threadId === threadId)?.title ?? null
      );
    };

    const shouldApplyPreviewUpdate = (
      conversationId: string,
      event: EventMsg
    ) => {
      if (event.type === 'user_message' || event.type === 'task_complete') {
        const threadId = getThreadIdForConversation(conversationId);
        if (threadId) {
          const threads = queryClient.getQueryData<
            { items: ThreadSummary[] } | undefined
          >(threadsKey);
          const preview =
            threads?.items.find((item) => item.threadId === threadId)
              ?.preview ?? '';
          return preview.trim() === '' || preview === 'Untitled thread';
        }

        const summaries =
          queryClient.getQueryData<WorkspaceConversationsState>(
            conversationsKey
          );
        const preview =
          summaries?.items.find(
            (item) => item.conversationId === conversationId
          )?.preview ?? '';
        return preview.trim() === '' || preview === 'Untitled thread';
      }

      return true;
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
        const threadId = getThreadIdForConversation(conversationId);

        if (payload.event.type === 'user_message') {
          updateConversationTimestamp(
            queryClient,
            conversationsKey,
            conversationId,
            timestamp
          );
          if (threadId) {
            updateThreadTimestamp(queryClient, threadsKey, threadId, timestamp);
          }
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
            if (threadId) {
              updateThreadPreview(
                queryClient,
                threadsKey,
                threadId,
                preview,
                timestamp
              );
            }
          }
        }

        const approvalRequest = mapConversationEventToApprovalRequest(payload);
        if (approvalRequest) {
          approvalsStore.getState().enqueue(approvalRequest);
        }

        const threadTitle = threadId ? getThreadTitle(threadId) : null;
        const preview = derivePreviewFromEvent(payload.event);

        if (payload.event.type === 'task_complete') {
          void notifyTurnFinished({ threadTitle, body: preview });
        } else if (
          payload.event.type === 'stream_error' ||
          payload.event.type === 'error'
        ) {
          const body =
            preview ??
            (payload.event.type === 'error'
              ? payload.event.message
              : payload.event.message);
          void notifyTurnError({ threadTitle, body });
        }

        runSideEffects(store.getState().drainSideEffects());
      };

      startTransition(applyPayload);
    };

    const handleConversationEvent = (
      event: CodexEvent & { kind: 'conversation-event' }
    ) => {
      const payload: ConversationEventPayload = event.payload;

      processPayload(payload);
    };

    const handleThreadMetadataUpdated = (
      event: CodexEvent & { kind: 'thread-metadata-updated' }
    ) => {
      const payload = getThreadMetadataPayload(event);
      if (payload.workspacePath !== workspacePath) {
        return;
      }
      if (payload.title) {
        updateThreadTitle(
          queryClient,
          threadsKey,
          payload.threadId,
          payload.title,
          payload.timestamp
        );
      }
      if (payload.preview) {
        updateThreadPreview(
          queryClient,
          threadsKey,
          payload.threadId,
          payload.preview,
          payload.timestamp
        );
      }
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

      if (isThreadMetadataUpdatedEvent(event)) {
        handleThreadMetadataUpdated(event);
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
    };
  }, [
    applyConversationEvent,
    approvalsStore,
    keys,
    getThreadIdForConversation,
    queryClient,
    workspacePath,
  ]);

  const showToastFn = useCallback(
    (message: string, type: 'success' | 'error') => {
      if (type === 'error') {
        toast.error(message);
      } else {
        toast.success(message);
      }
    },
    []
  );

  const convertImageSrcFn = useCallback((path: string) => {
    try {
      return convertFileSrc(path);
    } catch {
      return path;
    }
  }, []);

  return (
    <TranscriptProvider
      copyToClipboard={copyToClipboard}
      workspacePath={workspacePath}
      convertImageSrc={convertImageSrcFn}
      showToast={showToastFn}
    >
      {children}
    </TranscriptProvider>
  );
}

const runSideEffects = (effects: ConversationSideEffect[]) => {
  effects.forEach((effect) => {
    if (effect.type === 'openReviewMapOverlay') {
      dispatchOpenReviewMapOverlayEvent(effect.conversationId);
      return;
    }

    const description = effect.description;
    if (effect.variant === 'error') {
      toast.error(effect.title, { description });
    } else {
      toast(effect.title, { description });
    }
  });
};
