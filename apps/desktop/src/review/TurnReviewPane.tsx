import type { GetRepoDiffParams } from '@pasture/protocol';
import type { ParsedTurnDiffFile } from './types';
import type { ReactNode } from 'react';
import { useCallback, useMemo } from 'react';

import { useTurnReview } from './TurnReviewContext';
import { RangeSelectorSection } from './components/RangeSelectorSection';
import { TurnReviewHeader } from './components/TurnReviewHeader';
import { EMPTY_REVIEW_COMMENTS, useReviewComments } from './commentsStore';
import { makeRepoReviewKey, makeTurnReviewKey } from './reviewKeys';
import {
  RepoReviewFilesSection,
  TurnReviewFilesSection,
} from './components/ReviewFilesSection';

type TurnReviewPaneProps = {
  workspacePath: string;
  onRequestFeedback?: (prompt: string) => void;
  disabled?: boolean;
  onClose?: () => void;
  focusFilePath?: string | null;
  onFocusFilePathConsumed?: () => void;
  rangeSelector?: ReactNode;
  emptyStateMessage?: string;
  headerTitle?: string;
  headerSubtitle?: string | null;
  mode?: 'turn' | 'repo';
  repoParams?: GetRepoDiffParams;
  onOpenFile?: (request:
    | {
        mode: 'turn';
        reviewKey: string;
        file: ParsedTurnDiffFile;
        baseEventId: string | null;
        targetEventId: string;
        commentableLines: number[];
      }
    | {
        mode: 'repo';
        reviewKey: string;
        file: ParsedTurnDiffFile;
        repoParams: GetRepoDiffParams;
        commentableLines: number[];
      }) => void;
};

export function TurnReviewPane({
  workspacePath,
  onRequestFeedback,
  disabled,
  onClose,
  focusFilePath,
  onFocusFilePathConsumed,
  rangeSelector = <RangeSelectorSection />,
  emptyStateMessage,
  headerTitle,
  headerSubtitle,
  mode = 'turn',
  repoParams,
  onOpenFile,
}: TurnReviewPaneProps) {
  const { conversationId, history, baseTurnId, targetTurnId, selectedDiff } =
    useTurnReview();

  const historyById = useMemo(() => {
    const map = new Map<string, (typeof history)[number]>();
    for (const entry of history) {
      map.set(entry.eventId, entry);
    }
    return map;
  }, [history]);

  const baseSnapshotEventId = baseTurnId
    ? (historyById.get(baseTurnId)?.turnId ?? baseTurnId)
    : null;
  const targetSnapshotEventId = targetTurnId
    ? (historyById.get(targetTurnId)?.turnId ?? targetTurnId)
    : null;

  const reviewKey =
    mode === 'repo' && repoParams
      ? makeRepoReviewKey(repoParams)
      : conversationId && targetSnapshotEventId
        ? makeTurnReviewKey({
            conversationId,
            baseEventId: baseSnapshotEventId,
            targetEventId: targetSnapshotEventId,
          })
        : null;

  const comments = useReviewComments((state) =>
    reviewKey
      ? (state.commentsByReviewKey[reviewKey] ?? EMPTY_REVIEW_COMMENTS)
      : EMPTY_REVIEW_COMMENTS
  );
  const commentCount = comments.length;

  const buildFeedbackPrompt = useCallback((): string | null => {
    if (!reviewKey || !comments.length) {
      return null;
    }
    const segments = comments.map((comment) => {
      return `- ${comment.filePath} (line ${comment.lineNumber}): ${comment.text}`;
    });
    const turnLabel = selectedDiff
      ? `turn ${selectedDiff.turnNumber}`
      : 'this turn';
    return `Here is my consolidated review of ${turnLabel}:\n${segments.join('\n')}\n\nPlease address each comment before continuing.`;
  }, [comments, reviewKey, selectedDiff]);

  const canBuildFeedback = commentCount > 0;
  const turnNumber = selectedDiff?.turnNumber;
  const showPane = Boolean(reviewKey);

  return (
    <div className="flex h-full w-full flex-col bg-background text-foreground text-transcript-code leading-transcript-code">
      <div className="border-b border-border/60 px-6 py-4">
        <TurnReviewHeader
          showPane={showPane}
          commentCount={commentCount}
          turnNumber={turnNumber}
          title={headerTitle}
          subtitle={headerSubtitle}
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
      {mode === 'repo' && repoParams ? (
        <RepoReviewFilesSection
          workspacePath={workspacePath}
          repoParams={repoParams}
          focusFilePath={focusFilePath}
          onFocusFilePathConsumed={onFocusFilePathConsumed}
          emptyStateMessage={emptyStateMessage}
          onOpenFile={(request) =>
            onOpenFile?.({
              mode: 'repo',
              ...request,
            })
          }
        />
      ) : (
        <TurnReviewFilesSection
          workspacePath={workspacePath}
          focusFilePath={focusFilePath}
          onFocusFilePathConsumed={onFocusFilePathConsumed}
          emptyStateMessage={emptyStateMessage}
          onOpenFile={(request) =>
            onOpenFile?.({
              mode: 'turn',
              ...request,
            })
          }
        />
      )}
    </div>
  );
}
