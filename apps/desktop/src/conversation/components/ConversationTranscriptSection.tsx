import {
  forwardRef,
  useDeferredValue,
  useImperativeHandle,
  useRef,
} from 'react';
import { Button } from '~/components/ui/button';
import { Skeleton } from '~/components/ui/skeleton';

import { useAutoscroll } from '../hooks/useAutoscroll';
import {
  useConversationLoadState,
  useConversationTranscriptTurns,
  useConversationTurnCounter,
} from '../store/hooks';
import { TranscriptList } from './TranscriptList';

export type ConversationTranscriptHandle = {
  scrollToBottom: () => void;
  scrollToBottomAndMark: () => void;
};

export type ConversationTranscriptSectionProps = {
  conversationId: string;
  loadConversation: (
    conversationId: string,
    options?: { force?: boolean }
  ) => Promise<void>;
  expandedTurns: Record<string, boolean>;
  onToggleTurn: (turnId: string) => void;
  onAtBottomChange?: (atBottom: boolean) => void;
  onScrollToBottom: () => void;
};

export const ConversationTranscriptSection = forwardRef<
  ConversationTranscriptHandle,
  ConversationTranscriptSectionProps
>(
  (
    {
      conversationId,
      loadConversation,
      expandedTurns,
      onToggleTurn,
      onAtBottomChange,
      onScrollToBottom,
    },
    ref
  ) => {
    const scrollContainerRef = useRef<HTMLDivElement | null>(null);
    const bottomAnchorRef = useRef<HTMLDivElement | null>(null);
    const transcriptContentRef = useRef<HTMLDivElement | null>(null);
    const { isLoading, error } = useConversationLoadState(conversationId);
    const { turns, turnOrder } = useConversationTranscriptTurns(conversationId);
    const turnCounter = useConversationTurnCounter(conversationId);
    const deferredTurnOrder = useDeferredValue(turnOrder);
    const deferredTurns = useDeferredValue(turns);
    const countCells = (order: string[], lookup: typeof turns) =>
      order.reduce((sum, turnId) => {
        const turn = lookup[turnId];
        return sum + (turn?.cells.length ?? 0);
      }, 0);

    const hasTranscript = countCells(turnOrder, turns) > 0;
    const lastVisibleCellEventKey = (() => {
      for (let idx = deferredTurnOrder.length - 1; idx >= 0; idx -= 1) {
        const turn = deferredTurns[deferredTurnOrder[idx]];
        if (turn && turn.cells.length > 0) {
          const lastCell = turn.cells[turn.cells.length - 1];
          const lastEventId =
            lastCell.eventIds[lastCell.eventIds.length - 1] ?? lastCell.id;
          return `${lastCell.id}:${lastEventId}`;
        }
      }
      return 'none';
    })();

    const { scrollToBottom, scrollToBottomAndMark, isPinnedToBottom } =
      useAutoscroll({
        scrollContainerRef,
        bottomAnchorRef,
        transcriptContentRef,
        isLoading,
        hasTranscript,
        lastVisibleCellEventKey,
        turnCounter,
        deferredCellsLength: countCells(deferredTurnOrder, deferredTurns),
        onAtBottomChange,
        resetKey: conversationId,
      });

    useImperativeHandle(
      ref,
      () => ({
        scrollToBottom,
        scrollToBottomAndMark,
      }),
      [scrollToBottom, scrollToBottomAndMark]
    );

    const content = (() => {
      if (isLoading) {
        return (
          <div className="px-6 pt-4">
            <LoadingState />
          </div>
        );
      }
      if (error) {
        return (
          <div className="px-6 pt-4 space-y-3">
            <p className="text-sm text-destructive">
              Failed to load conversation: {error.message}
            </p>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => {
                void loadConversation(conversationId, { force: true });
              }}
            >
              Retry
            </Button>
          </div>
        );
      }
      if (hasTranscript) {
        return (
          <TranscriptList
            turns={deferredTurns}
            turnOrder={deferredTurnOrder}
            expandedTurns={expandedTurns}
            onToggleTurn={onToggleTurn}
            bottomAnchorRef={bottomAnchorRef}
            contentRef={transcriptContentRef}
          />
        );
      }
      return (
        <div className="px-6 pt-4">
          <p className="text-sm text-muted-foreground">
            Start chatting with Codex to see messages here.
          </p>
        </div>
      );
    })();

    return (
      <div className="flex-1 min-h-0 relative">
        <div
          ref={scrollContainerRef}
          className="h-full overflow-auto"
          style={{ scrollbarGutter: 'stable' }}
          data-conversation-transcript
        >
          {content}
        </div>

        {!isPinnedToBottom && hasTranscript ? (
          <div className="pointer-events-none absolute inset-x-0 bottom-4 flex justify-center">
            <Button
              type="button"
              size="sm"
              variant="ghost"
              className="rounded-full border border-border/60 bg-background px-4 shadow-lg pointer-events-auto"
              onClick={onScrollToBottom}
            >
              Scroll to latest
            </Button>
          </div>
        ) : null}
      </div>
    );
  }
);
ConversationTranscriptSection.displayName = 'ConversationTranscriptSection';

const LoadingState = () => (
  <div className="px-6 space-y-4">
    <div className="space-y-2">
      <Skeleton className="h-4 w-24" />
      <Skeleton className="h-20 w-full" />
    </div>
    <div className="space-y-2">
      <Skeleton className="h-4 w-32" />
      <Skeleton className="h-32 w-full" />
    </div>
    <div className="space-y-2">
      <Skeleton className="h-4 w-24" />
      <Skeleton className="h-20 w-full" />
    </div>
  </div>
);
