import type { ReactNode } from 'react';
import { useCallback, useEffect, useRef, useState } from 'react';

import { useTurnReview } from './TurnReviewContext';
import { DiffContentSection } from './components/DiffContentSection';
import type { DiffViewMode } from './components/FileDiffSection';
import { RangeSelectorSection } from './components/RangeSelectorSection';
import { TurnReviewHeader } from './components/TurnReviewHeader';

type TurnReviewPaneProps = {
  workspacePath: string;
  onRequestFeedback?: (prompt: string) => void;
  disabled?: boolean;
  onClose?: () => void;
  focusFilePath?: string | null;
  focusLineRange?: { start: number; end: number } | null;
  focusRequestId?: number;
  rangeSelector?: ReactNode;
  emptyStateMessage?: string;
};

const MIN_SPLIT_WIDTH = 900;

export function TurnReviewPane({
  workspacePath,
  onRequestFeedback,
  disabled,
  onClose,
  focusFilePath,
  focusLineRange,
  focusRequestId,
  rangeSelector = <RangeSelectorSection />,
  emptyStateMessage,
}: TurnReviewPaneProps) {
  const { comments, selectedDiff } = useTurnReview();
  const commentCount = comments.length;

  const containerRef = useRef<HTMLDivElement | null>(null);
  const [viewMode, setViewMode] = useState<DiffViewMode>('split');
  const [userSetViewMode, setUserSetViewMode] = useState(false);

  // Auto-toggle view mode based on pane width (unless user manually set it)
  useEffect(() => {
    if (userSetViewMode) {
      return;
    }

    const node = containerRef.current;
    if (!node || typeof ResizeObserver === 'undefined') {
      return;
    }

    const observer = new ResizeObserver((entries) => {
      const entry = entries[0];
      if (!entry) {
        return;
      }
      const width = entry.contentRect.width;
      if (!width) {
        return;
      }
      const shouldBeUnified = width < MIN_SPLIT_WIDTH;
      const nextMode: DiffViewMode = shouldBeUnified ? 'unified' : 'split';
      setViewMode((current) => (userSetViewMode ? current : nextMode));
    });

    observer.observe(node);

    return () => {
      observer.disconnect();
    };
  }, [userSetViewMode]);

  const handleViewModeChange = (mode: DiffViewMode) => {
    setViewMode(mode);
    setUserSetViewMode(true);
  };

  const buildFeedbackPrompt = useCallback((): string | null => {
    if (!comments.length) {
      return null;
    }
    const segments = comments.map((comment) => {
      const lineLabel = (() => {
        if (comment.newLineNumber != null) {
          return `line ${comment.newLineNumber}`;
        }
        if (comment.oldLineNumber != null) {
          return `removed line ${comment.oldLineNumber}`;
        }
        return 'unspecified line';
      })();
      const snippet =
        comment.lineKind !== 'metadata' && comment.lineText.trim().length
          ? `\n    Context: ${comment.linePrefix}${comment.lineText}`
          : '';
      return `- ${comment.filePath} (${lineLabel}): ${comment.text}${snippet}`;
    });
    const turnLabel = selectedDiff
      ? `turn ${selectedDiff.turnNumber}`
      : 'this turn';
    return `Here is my consolidated review of ${turnLabel}:\n${segments.join('\n')}\n\nPlease address each comment before continuing.`;
  }, [comments, selectedDiff]);

  const canBuildFeedback = commentCount > 0;
  const turnNumber = selectedDiff?.turnNumber;

  return (
    <div
      ref={containerRef}
      className="flex h-full w-full flex-col bg-background text-foreground text-transcript-code leading-transcript-code"
    >
      <div className="border-b border-border/60 px-6 py-4">
        <TurnReviewHeader
          showPane={true}
          commentCount={commentCount}
          turnNumber={turnNumber}
          viewMode={viewMode}
          onViewModeChange={handleViewModeChange}
          canBuildFeedback={canBuildFeedback}
          disabled={disabled}
          onGiveFeedback={() => {
            const prompt = buildFeedbackPrompt();
            if (prompt) {
              onRequestFeedback?.(prompt);
            }
            onClose?.();
          }}
          onClose={onClose}
          rangeSelector={rangeSelector}
        />
      </div>
      <DiffContentSection
        workspacePath={workspacePath}
        viewMode={viewMode}
        focusFilePath={focusFilePath}
        focusLineRange={focusLineRange}
        focusRequestId={focusRequestId}
        emptyStateMessage={emptyStateMessage}
      />
    </div>
  );
}
