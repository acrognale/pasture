import {
  startTransition,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { toast } from 'sonner';
import { Button } from '~/components/ui/button';
import {
  ComposerBar,
  type ComposerBarControls,
} from '~/composer/components/ComposerBar';
import { useNamedShortcut } from '~/keyboard/hooks';
import { copyToClipboard } from '~/lib/utils';
import { useWorkspaceConversationStores } from '~/workspace';

import { ConversationDevCommandMenu } from './components/ConversationDevCommandMenu';
import { ConversationPaneHeader } from './components/ConversationPaneHeader';
import { ConversationReviewOverlay } from './components/ConversationReviewOverlay';
import {
  type ConversationTranscriptHandle,
  ConversationTranscriptSection,
} from './components/ConversationTranscriptSection';
import { StatusIndicator } from './components/StatusIndicator';
import { useInterruptConversation } from './hooks/useInterruptConversation';
import { useReplay } from './replay';
import {
  useConversationHasTurnDiffHistory,
  useConversationIsRunning,
} from './store/hooks';

type ConversationPaneProps = {
  workspacePath: string;
  conversationId: string;
};

export function ConversationPane({
  workspacePath,
  conversationId,
}: ConversationPaneProps) {
  const { loadConversation, getConversationStore } =
    useWorkspaceConversationStores();
  const { interruptConversation, isPending: interruptPending } =
    useInterruptConversation(conversationId);
  const [expandedTurnsByConversation, setExpandedTurnsByConversation] =
    useState<Record<string, Record<string, boolean>>>({});
  const transcriptHandleRef = useRef<ConversationTranscriptHandle | null>(null);
  const [composerControls, setComposerControls] =
    useState<ComposerBarControls | null>(null);
  const [isReviewOpen, setIsReviewOpen] = useState(false);
  const [isCommandMenuOpen, setIsCommandMenuOpen] = useState(false);
  const expandedTurns = expandedTurnsByConversation[conversationId] ?? {};
  const isTurnActive = useConversationIsRunning(conversationId);
  const hasReviewHistory = useConversationHasTurnDiffHistory(conversationId);
  const reviewButtonDisabled = !hasReviewHistory;
  const { isReplaying, startReplay, stopReplay } = useReplay({
    conversationId,
  });

  useEffect(() => {
    if (conversationId) {
      void loadConversation(conversationId);
    }
  }, [conversationId, loadConversation]);

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
    void interruptConversation();
    return true;
  }, [interruptConversation, isTurnActive]);

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

  return (
    <>
      <div className="flex flex-1 flex-col h-full overflow-hidden relative">
        <ConversationPaneHeader
          workspacePath={workspacePath}
          actions={
            <Button
              type="button"
              size="sm"
              variant="outline"
              data-tauri-drag-region="false"
              disabled={reviewButtonDisabled}
              onClick={() => {
                if (!reviewButtonDisabled) {
                  startTransition(() => {
                    setIsReviewOpen(true);
                  });
                }
              }}
            >
              Review changes
            </Button>
          }
        />

        <div className="flex-1 min-h-0 flex flex-col overflow-hidden relative">
          <ConversationTranscriptSection
            key={conversationId}
            ref={transcriptHandleRef}
            conversationId={conversationId}
            loadConversation={loadConversation}
            expandedTurns={expandedTurns}
            onToggleTurn={toggleTurn}
            onScrollToBottom={handleScrollToBottom}
          />

          <div className="shrink-0 bg-background px-4 pb-4 space-y-3">
            <StatusIndicator
              conversationId={conversationId}
              onInterrupt={() => {
                void interruptConversation();
              }}
            />
            <ComposerBar
              workspacePath={workspacePath}
              conversationId={conversationId}
              isTurnActive={isTurnActive}
              interruptPending={interruptPending}
              stopButtonId="interrupt-conversation-button"
              onInterrupt={() => {
                void interruptConversation();
              }}
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
