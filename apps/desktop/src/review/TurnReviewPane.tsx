import { useCallback, useEffect, useState } from 'react';

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
};

const getInitialViewMode = (): DiffViewMode => {
  if (typeof window === 'undefined') {
    return 'split';
  }
  return window.innerWidth < 1220 ? 'unified' : 'split';
};

export function TurnReviewPane({
  workspacePath,
  onRequestFeedback,
  disabled,
  onClose,
  focusFilePath,
}: TurnReviewPaneProps) {
  const { comments, selectedDiff } = useTurnReview();
  const commentCount = comments.length;

  const [viewMode, setViewMode] = useState<DiffViewMode>(getInitialViewMode);
  const [userSetViewMode, setUserSetViewMode] = useState(false);

  // Auto-toggle view mode on resize (unless user manually set it)
  useEffect(() => {
    if (userSetViewMode) {
      return;
    }

    const handleResize = () => {
      const shouldBeUnified = window.innerWidth < 1220;
      const newMode: DiffViewMode = shouldBeUnified ? 'unified' : 'split';
      if (newMode !== viewMode) {
        setViewMode(newMode);
      }
    };

    window.addEventListener('resize', handleResize);
    return () => {
      window.removeEventListener('resize', handleResize);
    };
  }, [userSetViewMode, viewMode]);

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
    <div className="flex h-full w-full flex-col bg-background text-foreground text-transcript-code leading-transcript-code">
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
        />
        <RangeSelectorSection />
      </div>
      <DiffContentSection
        workspacePath={workspacePath}
        viewMode={viewMode}
        focusFilePath={focusFilePath}
      />
    </div>
  );
}
