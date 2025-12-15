import { Suspense, lazy, useEffect } from 'react';
import { Skeleton } from '~/components/ui/skeleton';

import {
  useConversationLatestTurnDiff,
  useConversationTurnDiffHistory,
} from '../store/hooks';

const TurnReviewPane = lazy(() =>
  import('~/review/TurnReviewPane').then((m) => ({ default: m.TurnReviewPane }))
);
const TurnReviewProvider = lazy(() =>
  import('~/review/TurnReviewContext').then((m) => ({
    default: m.TurnReviewProvider,
  }))
);

export type ConversationReviewOverlayProps = {
  conversationId: string;
  workspacePath: string;
  open: boolean;
  hasHistory: boolean;
  onClose: () => void;
  onRequestFeedback: (prompt: string) => void;
  focusFilePath?: string | null;
  onFocusFilePathConsumed?: () => void;
};

export function ConversationReviewOverlay({
  conversationId,
  workspacePath,
  open,
  hasHistory,
  onClose,
  onRequestFeedback,
  focusFilePath,
  onFocusFilePathConsumed,
}: ConversationReviewOverlayProps) {
  const latestDiff = useConversationLatestTurnDiff(conversationId);
  const history = useConversationTurnDiffHistory(conversationId);
  const effectiveHasHistory = hasHistory && history.length > 0;

  useEffect(() => {
    if (!effectiveHasHistory && open) {
      onClose();
    }
  }, [effectiveHasHistory, open, onClose]);

  return (
    <>
      {open && effectiveHasHistory ? (
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
          <TurnReviewProvider
            conversationId={conversationId}
            latestDiff={latestDiff}
            history={history}
          >
            <TurnReviewPane
              workspacePath={workspacePath}
              onRequestFeedback={onRequestFeedback}
              onClose={onClose}
              focusFilePath={focusFilePath}
              onFocusFilePathConsumed={onFocusFilePathConsumed}
            />
          </TurnReviewProvider>
        </Suspense>
      ) : null}
    </>
  );
}
