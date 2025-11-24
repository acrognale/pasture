import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { toast } from 'sonner';
import {
  ComposerBar,
  type ComposerBarControls,
} from '~/composer/components/ComposerBar';
import { useNamedShortcut } from '~/keyboard/hooks';
import { copyToClipboard } from '~/lib/utils';
import { useWorkspaceActions } from '~/workspace';

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
  onConversationForked?: (conversationId: string) => void;
};

export function ConversationPane({
  workspacePath,
  conversationId,
  onConversationForked,
}: ConversationPaneProps) {
  const { loadConversation, getConversationStore } = useWorkspaceActions();
  const { interruptConversation, isPending: interruptPending } =
    useInterruptConversation(conversationId);
  const [expandedTurnsByConversation, setExpandedTurnsByConversation] =
    useState<Record<string, Record<string, boolean>>>({});
  const transcriptHandleRef = useRef<ConversationTranscriptHandle | null>(null);
  const [composerControls, setComposerControls] =
    useState<ComposerBarControls | null>(null);
  const interruptRequestedRef = useRef(false);
  const [isReviewOpen, setIsReviewOpen] = useState(false);
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

  const handleInterrupt = useCallback(() => {
    const queuedText = queuedUserMessages.join('\n');
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
    [handleCopyEventsJsonl, isReplaying, startReplay, stopReplay]
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

  useEffect(() => {
    if (typeof window === 'undefined') {
      return;
    }

    const handleOpenReview = (event: CustomEvent<OpenReviewOverlayDetail>) => {
      if (event.detail.conversationId !== conversationId) {
        return;
      }
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

  return (
    <>
      <div className="flex flex-1 flex-col h-full overflow-hidden relative">
        <ConversationPaneHeader />

        <div className="flex-1 min-h-0 flex flex-col overflow-hidden relative">
          <ConversationTranscriptSection
            ref={transcriptHandleRef}
            conversationId={conversationId}
            loadConversation={loadConversation}
            expandedTurns={expandedTurns}
            onToggleTurn={toggleTurn}
            onConversationForked={onConversationForked}
            onScrollToBottom={handleScrollToBottom}
          />

          <div className="shrink-0 bg-background px-4 pb-4 space-y-3">
            <StatusIndicator
              conversationId={conversationId}
              onInterrupt={handleInterrupt}
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
        onClose={() => setIsReviewOpen(false)}
        workspacePath={workspacePath}
        onRequestFeedback={handleReviewFeedback}
      />
    </>
  );
}
