import type { GetRepoDiffParams } from '@pasture/protocol';
import type { TranscriptTurnDiff } from '@pasture/transcript-ui';
import { useMemo } from 'react';

import { TurnReviewProvider } from './TurnReviewContext';
import { TurnReviewPane } from './TurnReviewPane';
import { useRepoDiff } from './queries';

type RepoReviewPaneProps = {
  workspacePath: string;
  params: GetRepoDiffParams;
  onRequestFeedback?: (prompt: string) => void;
  onClose?: () => void;
  focusFilePath?: string | null;
  onFocusFilePathConsumed?: () => void;
};

function toReviewId(params: GetRepoDiffParams): string {
  const targetLabel = params.includeWorktree
    ? '__WORKTREE__'
    : (params.targetRef ?? '__TARGET__');
  return `repo:${params.workspacePath}::${params.baseRef}..${targetLabel}`;
}

export function RepoReviewPane({
  workspacePath,
  params,
  onRequestFeedback,
  onClose,
  focusFilePath,
  onFocusFilePathConsumed,
}: RepoReviewPaneProps) {
  const { rawDiff, query } = useRepoDiff(params);

  const reviewId = useMemo(() => toReviewId(params), [params]);

  const history = useMemo<TranscriptTurnDiff[]>(() => {
    const now = new Date().toISOString();
    return [
      {
        eventId: reviewId,
        timestamp: now,
        unifiedDiff: rawDiff ?? '',
        turnNumber: 1,
        turnId: reviewId,
      },
    ];
  }, [rawDiff, reviewId]);

  return (
    <TurnReviewProvider
      conversationId={reviewId}
      latestDiff={null}
      history={history}
    >
      <TurnReviewPane
        workspacePath={workspacePath}
        onRequestFeedback={onRequestFeedback}
        onClose={onClose}
        disabled={query.isPending}
        focusFilePath={focusFilePath}
        onFocusFilePathConsumed={onFocusFilePathConsumed}
        rangeSelector={null}
      />
    </TurnReviewProvider>
  );
}
