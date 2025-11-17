import {
  forwardRef,
  useDeferredValue,
  useImperativeHandle,
  useMemo,
  useRef,
} from 'react';
import { Button } from '~/components/ui/button';
import { Skeleton } from '~/components/ui/skeleton';
import { buildTranscriptView } from '~/conversation/transcript/view';

import { useAutoscroll } from '../hooks/useAutoscroll';
import {
  useConversationLoadState,
  useConversationTranscriptCells,
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
    const cells = useConversationTranscriptCells(conversationId);
    const turnCounter = useConversationTurnCounter(conversationId);
    const deferredCells = useDeferredValue(cells);
    const entries = useMemo(() => {
      return buildTranscriptView(deferredCells);
    }, [deferredCells]);
    const hasTranscript = cells.length > 0;
    const lastVisibleCellEventKey = useMemo(() => {
      if (!deferredCells.length) {
        return 'none';
      }
      const lastCell = deferredCells[deferredCells.length - 1];
      const lastEventId =
        lastCell.eventIds[lastCell.eventIds.length - 1] ?? lastCell.id;
      return `${lastCell.id}:${lastEventId}`;
    }, [deferredCells]);

    const { scrollToBottom, scrollToBottomAndMark, isPinnedToBottom } =
      useAutoscroll({
        scrollContainerRef,
        bottomAnchorRef,
        transcriptContentRef,
        isLoading,
        hasTranscript,
        lastVisibleCellEventKey,
        turnCounter,
        deferredCellsLength: deferredCells.length,
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
            cells={deferredCells}
            entries={entries}
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
