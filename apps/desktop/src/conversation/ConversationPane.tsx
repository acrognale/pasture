import { useQueryClient } from '@tanstack/react-query';
import { useRouter } from '@tanstack/react-router';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { toast } from 'sonner';
import {
  ComposerBar,
  type ComposerBarControls,
} from '~/composer/components/ComposerBar';
import type { HandoffCommandResult } from '~/composer/slash-commands';
import { MessageCommentProvider } from '~/conversation/comments/MessageCommentContext';
import { useMessageComments } from '~/conversation/comments/MessageCommentContext';
import { MessageCommentDraftProvider } from '~/conversation/comments/MessageCommentDraftContext';
import { buildMessageCommentsPrompt } from '~/conversation/comments/utils';
import { useNamedShortcut } from '~/keyboard/hooks';
import { encodeWorkspaceId } from '~/lib/routing';
import { copyToClipboard } from '~/lib/utils';
import {
  sortThreadsByTimestamp,
  useWorkspaceActions,
  useWorkspaceKeys,
} from '~/workspace';
import type { WorkspaceThreadsState } from '~/workspace';

import { ConversationCommentFeedbackFooter } from './components/ConversationCommentFeedbackFooter';
import { ConversationDevCommandMenu } from './components/ConversationDevCommandMenu';
import { ConversationPaneHeader } from './components/ConversationPaneHeader';
import { ConversationReviewOverlay } from './components/ConversationReviewOverlay';
import {
  type ConversationTranscriptHandle,
  ConversationTranscriptSection,
} from './components/ConversationTranscriptSection';
import { StatusIndicator } from './components/StatusIndicator';
import {
  OPEN_REVIEW_OVERLAY_EVENT,
  type OpenReviewOverlayDetail,
} from './events';
import { setHandoffDraft, takeHandoffDraft } from './handoffDraftStore';
import { useInterruptConversation } from './hooks/useInterruptConversation';
import { useQueueableSendMessage } from './hooks/useQueueableSendMessage';
import { useReplay } from './replay';
import {
  useConversationHasTurnDiffHistory,
  useConversationIsRunning,
  useConversationQueueActions,
  useConversationQueuedMessages,
} from './store/hooks';

type ConversationPaneProps = {
  workspacePath: string;
  conversationId: string;
  threadId?: string | null;
  onConversationForked?: (conversationId: string) => void;
};

function ConversationPaneContent({
  workspacePath,
  conversationId,
  threadId,
  onConversationForked,
}: ConversationPaneProps) {
  const router = useRouter();
  const queryClient = useQueryClient();
  const keys = useWorkspaceKeys();
  const { getConversationStore, markThreadOpen } = useWorkspaceActions();
  const { interruptConversation, isPending: interruptPending } =
    useInterruptConversation(conversationId);
  const [expandedTurnsByConversation, setExpandedTurnsByConversation] =
    useState<Record<string, Record<string, boolean>>>({});
  const [handoffStatus, setHandoffStatus] = useState<{
    running: boolean;
    startedAt: string | null;
    header: string | null;
  }>({ running: false, startedAt: null, header: null });
  const transcriptHandleRef = useRef<ConversationTranscriptHandle | null>(null);
  const [composerControls, setComposerControls] =
    useState<ComposerBarControls | null>(null);
  const interruptRequestedRef = useRef(false);
  const [isReviewOpen, setIsReviewOpen] = useState(false);
  const [reviewFocusFilePath, setReviewFocusFilePath] = useState<string | null>(
    null
  );
  const [isCommandMenuOpen, setIsCommandMenuOpen] = useState(false);
  const expandedTurns = expandedTurnsByConversation[conversationId] ?? {};
  const isTurnActive = useConversationIsRunning(conversationId);
  const hasReviewHistory = useConversationHasTurnDiffHistory(conversationId);
  const { isReplaying, startReplay, stopReplay } = useReplay({
    conversationId,
  });
  const queuedUserMessages = useConversationQueuedMessages(conversationId);
  const { clearQueuedUserMessages } =
    useConversationQueueActions(conversationId);
  const { sendNextQueuedIfIdle } = useQueueableSendMessage(
    workspacePath,
    conversationId
  );

  const handleScrollToBottom = useCallback(() => {
    transcriptHandleRef.current?.scrollToBottomAndMark();
  }, []);

  const toggleTurn = (turnId: string) => {
    setExpandedTurnsByConversation((prev) => {
      const nextTurns = prev[conversationId] ?? {};
      return {
        ...prev,
        [conversationId]: {
          ...nextTurns,
          [turnId]: !nextTurns[turnId],
        },
      };
    });
  };

  const handleReviewFeedback = useCallback(
    (prompt: string) => {
      if (!composerControls) {
        return;
      }
      const existing = composerControls.getDraft().trim();
      const nextDraft = existing ? `${existing}\n\n${prompt}` : prompt;
      composerControls.setDraft(nextDraft);
      composerControls.focus();
      handleScrollToBottom();
    },
    [composerControls, handleScrollToBottom]
  );

  const { comments: messageComments, markCommentsSubmitted } =
    useMessageComments();
  const pendingComments = useMemo(
    () =>
      messageComments.filter(
        (comment) =>
          !comment.isSubmitted && comment.conversationId === conversationId
      ),
    [conversationId, messageComments]
  );

  const handleInsertMessageCommentsFeedback = useCallback(() => {
    const prompt = buildMessageCommentsPrompt(pendingComments);
    if (!prompt) {
      return;
    }
    if (!composerControls) {
      return;
    }
    const existing = composerControls.getDraft().trim();
    const nextDraft = existing ? `${existing}\n\n${prompt}` : prompt;
    composerControls.setDraft(nextDraft);
    composerControls.focus();
    handleScrollToBottom();
    markCommentsSubmitted(pendingComments.map((comment) => comment.id));
  }, [
    pendingComments,
    composerControls,
    handleScrollToBottom,
    markCommentsSubmitted,
  ]);

  const handleCopyEventsJsonl = useCallback(async () => {
    const store = getConversationStore(conversationId);
    const jsonl = store.getState().getEventsAsJsonl();
    if (!jsonl) {
      toast.info('No events to copy', {
        description: 'This conversation has no events yet',
      });
      return;
    }

    const success = await copyToClipboard(jsonl);
    if (success) {
      const eventCount = store.getState().getEventCount();
      toast.success('Events copied to clipboard', {
        description: `Copied ${eventCount} event(s) as JSONL`,
      });
    } else {
      toast.error('Failed to copy events', {
        description: 'Could not write to clipboard',
      });
    }
  }, [conversationId, getConversationStore]);

  const handleCopyConversationId = useCallback(async () => {
    const success = await copyToClipboard(conversationId);
    if (success) {
      toast.success('Conversation ID copied to clipboard', {
        description: conversationId,
      });
    } else {
      toast.error('Failed to copy conversation ID', {
        description: 'Could not write to clipboard',
      });
    }
  }, [conversationId]);

  const handleInterrupt = useCallback(() => {
    const queuedText = queuedUserMessages
      .map((message) => message.text)
      .filter((value) => value.trim().length > 0)
      .join('\n');
    const queuedAttachments = queuedUserMessages.flatMap(
      (message) => message.attachments ?? []
    );
    const existingDraft = composerControls?.getDraft().trim() ?? '';
    let combinedDraft = existingDraft;

    if (queuedText && existingDraft) {
      combinedDraft = `${queuedText}\n${existingDraft}`;
    } else if (queuedText) {
      combinedDraft = queuedText;
    }

    if (combinedDraft) {
      composerControls?.setDraft(combinedDraft);
      composerControls?.focus();
    }
    if (queuedAttachments.length > 0) {
      composerControls?.appendAttachments(queuedAttachments);
    }

    clearQueuedUserMessages();
    interruptRequestedRef.current = true;
    void interruptConversation();
  }, [
    clearQueuedUserMessages,
    composerControls,
    interruptConversation,
    queuedUserMessages,
  ]);

  const devActions = useMemo(
    () => [
      {
        id: 'copy-conversation-id',
        label: 'Copy conversation ID',
        onSelect: () => {
          void handleCopyConversationId();
        },
      },
      {
        id: 'copy-events-jsonl',
        label: 'Copy events JSONL',
        onSelect: () => {
          void handleCopyEventsJsonl();
        },
      },
      {
        id: 'toggle-replay',
        label: isReplaying ? 'Stop replay' : 'Replay transcript',
        onSelect: () => {
          if (isReplaying) {
            stopReplay();
          } else {
            void startReplay();
          }
        },
      },
    ],
    [
      handleCopyConversationId,
      handleCopyEventsJsonl,
      isReplaying,
      startReplay,
      stopReplay,
    ]
  );

  const closeReviewShortcutOverrides = useMemo(
    () => ({
      enabled: () => isReviewOpen,
    }),
    [isReviewOpen]
  );

  const handleCloseReviewShortcut = useCallback(() => {
    if (!isReviewOpen) {
      return false;
    }
    setIsReviewOpen(false);
    return true;
  }, [isReviewOpen]);

  useNamedShortcut(
    'overlay.conversationReview.close',
    closeReviewShortcutOverrides,
    handleCloseReviewShortcut
  );

  const interruptShortcutOverrides = useMemo(
    () => ({
      enabled: () => Boolean(conversationId) && isTurnActive,
    }),
    [conversationId, isTurnActive]
  );

  const handleInterruptShortcut = useCallback(() => {
    if (!isTurnActive) {
      return false;
    }
    handleInterrupt();
    return true;
  }, [handleInterrupt, isTurnActive]);

  useNamedShortcut(
    'conversation.interruptTurn',
    interruptShortcutOverrides,
    handleInterruptShortcut
  );

  const handleToggleCommandMenuShortcut = useCallback(() => {
    setIsCommandMenuOpen((prev) => !prev);
    return true;
  }, [setIsCommandMenuOpen]);

  useNamedShortcut(
    'conversation.toggleDevCommandMenu',
    undefined,
    handleToggleCommandMenuShortcut
  );

  const handleHandoffComplete = useCallback(
    (result: HandoffCommandResult) => {
      const {
        threadId: newThreadId,
        conversationId: newConversationId,
        composerDraft,
        goal,
        title,
      } = result;

      markThreadOpen(newThreadId);

      queryClient.setQueryData<WorkspaceThreadsState | undefined>(
        keys.threads(),
        (state) => {
          const now = new Date().toISOString();
          const normalizedTitle = title?.trim() || null;
          const preview = normalizedTitle || goal?.trim() || 'Untitled thread';
          const existingItems = state?.items ?? [];
          const filtered = existingItems.filter(
            (item) => item.threadId !== newThreadId
          );

          const optimistic = {
            threadId: newThreadId,
            workspacePath,
            currentConversationId: newConversationId,
            preview,
            title: normalizedTitle,
            timestamp: now,
            conversationCount: 1,
          };

          return {
            items: sortThreadsByTimestamp([optimistic, ...filtered]),
          };
        }
      );

      const store = getConversationStore(conversationId);
      store.getState().attachHandoffDestination({
        threadId: newThreadId,
        conversationId: newConversationId,
        goal,
        title,
      });

      setHandoffDraft(newThreadId, composerDraft);

      void router.navigate({
        to: '/workspaces/$workspaceId/threads/$threadId',
        params: {
          workspaceId: encodeWorkspaceId(workspacePath),
          threadId: newThreadId,
        },
      });
    },
    [
      conversationId,
      getConversationStore,
      keys,
      markThreadOpen,
      queryClient,
      router,
      workspacePath,
    ]
  );

  const handleHandoffStatusChange = useCallback((running: boolean) => {
    if (running) {
      setHandoffStatus({
        running: true,
        startedAt: new Date().toISOString(),
        header: 'Generating handoff prompt…',
      });
    } else {
      setHandoffStatus({ running: false, startedAt: null, header: null });
    }
  }, []);

  useEffect(() => {
    if (typeof window === 'undefined') {
      return;
    }

    const handleOpenReview = (event: CustomEvent<OpenReviewOverlayDetail>) => {
      if (event.detail.conversationId !== conversationId) {
        return;
      }
      setReviewFocusFilePath(event.detail.fileDisplayPath ?? null);
      setIsReviewOpen(true);
    };

    window.addEventListener(
      OPEN_REVIEW_OVERLAY_EVENT,
      handleOpenReview as EventListener
    );

    return () => {
      window.removeEventListener(
        OPEN_REVIEW_OVERLAY_EVENT,
        handleOpenReview as EventListener
      );
    };
  }, [conversationId]);

  const previousRunningState = useRef(isTurnActive);
  useEffect(() => {
    const wasRunning = previousRunningState.current;
    if (wasRunning && !isTurnActive) {
      if (interruptRequestedRef.current) {
        interruptRequestedRef.current = false;
      } else if (queuedUserMessages.length > 0) {
        void sendNextQueuedIfIdle();
      }
    }

    previousRunningState.current = isTurnActive;
  }, [isTurnActive, queuedUserMessages.length, sendNextQueuedIfIdle]);

  useEffect(() => {
    if (!threadId || !composerControls) {
      return;
    }

    const draft = takeHandoffDraft(threadId);
    if (!draft) {
      return;
    }

    const existing = composerControls.getDraft().trim();
    const next = existing ? `${existing}\n\n${draft}` : draft;
    composerControls.setDraft(next);
    composerControls.focus();
    handleScrollToBottom();
  }, [composerControls, handleScrollToBottom, threadId]);

  return (
    <>
      <div className="flex flex-1 flex-col h-full overflow-hidden relative">
        <ConversationPaneHeader />

        <div className="flex-1 min-h-0 flex flex-col overflow-hidden relative">
          <ConversationTranscriptSection
            ref={transcriptHandleRef}
            conversationId={conversationId}
            expandedTurns={expandedTurns}
            onToggleTurn={toggleTurn}
            onConversationForked={onConversationForked}
            onScrollToBottom={handleScrollToBottom}
          />

          <div className="shrink-0 bg-background px-4 pb-4 space-y-3">
            <StatusIndicator
              conversationId={conversationId}
              running={handoffStatus.running}
              startedAt={handoffStatus.startedAt}
              header={handoffStatus.header}
              onInterrupt={handleInterrupt}
            />
            <ConversationCommentFeedbackFooter
              comments={pendingComments}
              onInsertFeedback={handleInsertMessageCommentsFeedback}
            />
            <ComposerBar
              workspacePath={workspacePath}
              conversationId={conversationId}
              isTurnActive={isTurnActive}
              interruptPending={interruptPending}
              stopButtonId="interrupt-conversation-button"
              onInterrupt={handleInterrupt}
              onScrollToBottom={handleScrollToBottom}
              onComposerReady={(controls) => {
                setComposerControls(controls);
              }}
              onHandoffComplete={handleHandoffComplete}
              onHandoffStatusChange={handleHandoffStatusChange}
            />
          </div>
        </div>
      </div>

      <ConversationDevCommandMenu
        open={isCommandMenuOpen}
        onOpenChange={setIsCommandMenuOpen}
        actions={devActions}
      />

      <ConversationReviewOverlay
        conversationId={conversationId}
        open={isReviewOpen}
        hasHistory={hasReviewHistory}
        onClose={() => {
          setIsReviewOpen(false);
          setReviewFocusFilePath(null);
        }}
        workspacePath={workspacePath}
        onRequestFeedback={handleReviewFeedback}
        focusFilePath={reviewFocusFilePath}
        onFocusFilePathConsumed={() => setReviewFocusFilePath(null)}
      />
    </>
  );
}

export function ConversationPane(props: ConversationPaneProps) {
  const { conversationId, workspacePath } = props;

  return (
    <MessageCommentProvider
      conversationId={conversationId}
      workspacePath={workspacePath}
    >
      <MessageCommentDraftProvider>
        <ConversationPaneContent {...props} />
      </MessageCommentDraftProvider>
    </MessageCommentProvider>
  );
}
