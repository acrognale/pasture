import type { GetRepoDiffParams } from '@pasture/protocol';
import { Suspense, lazy } from 'react';
import { Skeleton } from '~/components/ui/skeleton';
import { dispatchOpenRepoReviewOverlayEvent } from '~/conversation/events';

const RepoReviewPane = lazy(() =>
  import('~/review/RepoReviewPane').then((m) => ({ default: m.RepoReviewPane }))
);

export type RepoReviewOverlayProps = {
  workspacePath: string;
  conversationId: string;
  open: boolean;
  params: GetRepoDiffParams;
  onClose: () => void;
  onRequestFeedback: (prompt: string) => void;
  focusFilePath?: string | null;
  onFocusFilePathConsumed?: () => void;
};

export function RepoReviewOverlay({
  workspacePath,
  conversationId,
  open,
  params,
  onClose,
  onRequestFeedback,
  focusFilePath,
  onFocusFilePathConsumed,
}: RepoReviewOverlayProps) {
  if (!open) {
    return null;
  }

  return (
    <Suspense
      fallback={
        <div className="flex h-full w-full items-center justify-center">
          <div className="w-full max-w-2xl space-y-4 p-6">
            <Skeleton className="h-8 w-48" />
            <Skeleton className="h-64 w-full" />
            <Skeleton className="h-64 w-full" />
          </div>
        </div>
      }
    >
      <RepoReviewPane
        workspacePath={workspacePath}
        params={params}
        onParamsChange={(nextParams) => {
          dispatchOpenRepoReviewOverlayEvent(conversationId, {
            workspacePath: nextParams.workspacePath,
            baseRef: nextParams.baseRef,
            targetRef: nextParams.targetRef,
            includeWorktree: nextParams.includeWorktree,
          });
        }}
        onRequestFeedback={onRequestFeedback}
        onClose={onClose}
        focusFilePath={focusFilePath}
        onFocusFilePathConsumed={onFocusFilePathConsumed}
      />
    </Suspense>
  );
}
