import type { GetRepoDiffParams } from '@pasture/protocol';
import type { TranscriptTurnDiff } from '@pasture/transcript-ui';
import type { ComponentProps } from 'react';
import { useMemo } from 'react';

import { TurnReviewProvider } from './TurnReviewContext';
import { TurnReviewPane } from './TurnReviewPane';
import { useRepoDiff } from './queries';
import { makeRepoConversationId } from './reviewKeys';

type RepoReviewPaneProps = {
  workspacePath: string;
  params: GetRepoDiffParams;
  onRequestFeedback?: (prompt: string) => void;
  onClose?: () => void;
  focusFilePath?: string | null;
  onFocusFilePathConsumed?: () => void;
  headerSubtitle?: string | null;
  onOpenFile?: ComponentProps<typeof TurnReviewPane>['onOpenFile'];
  onOpenComments?: ComponentProps<typeof TurnReviewPane>['onOpenComments'];
  onReviewKeyChange?: ComponentProps<
    typeof TurnReviewPane
  >['onReviewKeyChange'];
};

export function RepoReviewPane({
  workspacePath,
  params,
  onRequestFeedback,
  onClose,
  focusFilePath,
  onFocusFilePathConsumed,
  headerSubtitle,
  onOpenFile,
  onOpenComments,
  onReviewKeyChange,
}: RepoReviewPaneProps) {
  const { rawDiff, query } = useRepoDiff(params);

  const reviewId = useMemo(() => makeRepoConversationId(params), [params]);
  const emptyStateMessage = useMemo(() => {
    if (query.isPending) {
      return 'Loading changes…';
    }
    if (query.error instanceof Error) {
      return `Couldn't load changes: ${query.error.message}`;
    }
    if (params.includeWorktree && params.baseRef === 'HEAD') {
      return 'Working tree is clean.';
    }
    return 'No changes found for this range.';
  }, [params.baseRef, params.includeWorktree, query.error, query.isPending]);

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
        emptyStateMessage={emptyStateMessage}
        headerSubtitle={headerSubtitle}
        mode="repo"
        repoParams={params}
        onOpenFile={onOpenFile}
        onOpenComments={onOpenComments}
        onReviewKeyChange={onReviewKeyChange}
      />
    </TurnReviewProvider>
  );
}
