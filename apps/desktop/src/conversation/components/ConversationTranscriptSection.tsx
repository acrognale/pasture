import {
  forwardRef,
  useEffect,
  useImperativeHandle,
  useRef,
  useState,
} from 'react';
import {
  TranscriptList,
  type TranscriptCell,
  type TranscriptTurn as SharedTranscriptTurn,
} from '@pasture/transcript-ui';
import { Button } from '~/components/ui/button';
import { Skeleton } from '~/components/ui/skeleton';

import { useAutoscroll } from '../hooks/useAutoscroll';
import {
  useConversationLoadState,
  useConversationTranscriptTurns,
} from '../store/hooks';
import { FloatingPlanPanel } from './FloatingPlanPanel';
import { TranscriptCells } from './TranscriptCells';

export type ConversationTranscriptHandle = {
  scrollToBottom: () => void;
  scrollToBottomAndMark: () => void;
};

export type ConversationTranscriptSectionProps = {
  conversationId: string;
  expandedTurns: Record<string, boolean>;
  onToggleTurn: (turnId: string) => void;
  onConversationForked?: (conversationId: string) => void;
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
      expandedTurns,
      onToggleTurn,
      onConversationForked,
      onAtBottomChange,
      onScrollToBottom,
    },
    ref
  ) => {
    const scrollContainerRef = useRef<HTMLDivElement | null>(null);
    const bottomAnchorRef = useRef<HTMLDivElement | null>(null);
    const transcriptContentRef = useRef<HTMLDivElement | null>(null);
    const previousConversationIdRef = useRef<string | null>(null);
    const { isLoading, error } = useConversationLoadState(conversationId);
    const { turns, turnOrder } = useConversationTranscriptTurns(conversationId);
    const countCells = (order: string[], lookup: typeof turns) =>
      order.reduce((sum, turnId) => {
        const turn = lookup[turnId];
        return sum + (turn?.cells.length ?? 0);
      }, 0);

    const hasTranscript = countCells(turnOrder, turns) > 0;
    const [shouldAnimateInitial, setShouldAnimateInitial] = useState(
      !isLoading && !hasTranscript
    );
    useEffect(() => {
      const initialValue = !isLoading && !hasTranscript;
      const previousConversationId = previousConversationIdRef.current;
      previousConversationIdRef.current = conversationId;
      setShouldAnimateInitial((current) => {
        if (previousConversationId !== conversationId) {
          return initialValue;
        }
        if (current) {
          return current;
        }
        return initialValue;
      });
    }, [conversationId, hasTranscript, isLoading]);
    const lastVisibleCellEventKey = (() => {
      for (let idx = turnOrder.length - 1; idx >= 0; idx -= 1) {
        const turn = turns[turnOrder[idx]];
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
        deferredCellsLength: countCells(turnOrder, turns),
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
          </div>
        );
      }
      if (hasTranscript) {
        return (
          <TranscriptList
            turns={turns as Record<string, SharedTranscriptTurn>}
            turnOrder={turnOrder}
            expandedTurns={expandedTurns}
            onToggleTurn={onToggleTurn}
            bottomAnchorRef={bottomAnchorRef}
            contentRef={transcriptContentRef}
            shouldAnimateInitial={shouldAnimateInitial}
            renderCell={(cell, { nthUserMessage }) => (
              <TranscriptCells
                cell={cell as TranscriptCell}
                conversationId={conversationId}
                nthUserMessage={nthUserMessage}
                onConversationForked={onConversationForked}
              />
            )}
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

        <FloatingPlanPanel conversationId={conversationId} />

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
