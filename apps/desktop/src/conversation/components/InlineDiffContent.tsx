import { useCallback, useMemo } from 'react';
import { Button } from '~/components/ui/button';
import { DraftCommentProvider } from '~/review/DraftCommentContext';
import { useTurnReview } from '~/review/TurnReviewContext';
import { groupCommentsByLine, parseUnifiedDiff } from '~/review/diff';

import { InlineFileDiffSection } from './InlineFileDiffSection';

export type InlineDiffContentProps = {
  workspacePath: string;
  turnNumber: number;
  onRequestFeedback?: (prompt: string) => void;
  onClose?: () => void;
};

export function InlineDiffContent({
  workspacePath,
  turnNumber,
  onRequestFeedback,
  onClose,
}: InlineDiffContentProps) {
  const { comments, selectedDiff, removeComment } = useTurnReview();

  const parsedDiff = useMemo(() => {
    const raw = selectedDiff?.unifiedDiff ?? '';
    if (!raw.trim()) {
      return null;
    }
    return parseUnifiedDiff(raw);
  }, [selectedDiff]);

  const diffFiles = parsedDiff?.files ?? [];

  const commentsByLine = useMemo(
    () => groupCommentsByLine(comments),
    [comments]
  );

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
    return `Here is my review of turn ${turnNumber}:\n${segments.join('\n')}\n\nPlease address each comment before continuing.`;
  }, [comments, turnNumber]);

  const handleGiveFeedback = () => {
    const prompt = buildFeedbackPrompt();
    if (prompt) {
      onRequestFeedback?.(prompt);
    }
    onClose?.();
  };

  const commentCount = comments.length;
  const canGiveFeedback = commentCount > 0;

  if (diffFiles.length === 0) {
    return (
      <div className="px-3 py-4 text-xs text-muted-foreground">
        No changes to review.
      </div>
    );
  }

  return (
    <DraftCommentProvider>
      <div className="space-y-3 py-3">
        {/* Header */}
        <div className="flex items-center justify-between gap-2 px-1">
          <div className="text-xs text-muted-foreground">
            {commentCount > 0 ? (
              <span>
                {commentCount} comment{commentCount === 1 ? '' : 's'}
              </span>
            ) : (
              <span>Click on a line to add a comment</span>
            )}
          </div>
          <div className="flex items-center gap-2">
            <Button
              type="button"
              size="sm"
              variant="default"
              className="h-6 text-xs"
              disabled={!canGiveFeedback}
              onClick={handleGiveFeedback}
            >
              Give Feedback
            </Button>
            {onClose && (
              <Button
                type="button"
                size="sm"
                variant="ghost"
                className="h-6 text-xs"
                onClick={onClose}
              >
                Close
              </Button>
            )}
          </div>
        </div>

        {/* File diffs */}
        <div className="space-y-2">
          {diffFiles.map((file) => (
            <InlineFileDiffSection
              key={file.id}
              workspacePath={workspacePath}
              file={file}
              commentsByLine={commentsByLine}
              onDeleteComment={removeComment}
            />
          ))}
        </div>
      </div>
    </DraftCommentProvider>
  );
}
