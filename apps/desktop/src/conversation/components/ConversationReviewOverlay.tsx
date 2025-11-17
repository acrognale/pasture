import { Suspense, lazy, useEffect } from 'react';
import { Dialog, DialogContent } from '~/components/ui/dialog';
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
};

export function ConversationReviewOverlay({
  conversationId,
  workspacePath,
  open,
  hasHistory,
  onClose,
  onRequestFeedback,
}: ConversationReviewOverlayProps) {
  const latestDiff = useConversationLatestTurnDiff(conversationId);
  const history = useConversationTurnDiffHistory(conversationId);

  useEffect(() => {
    if (!hasHistory && open) {
      onClose();
    }
  }, [hasHistory, open, onClose]);

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent
        className="max-w-[95vw]! w-[95vw]! h-[95vh]! max-h-[95vh]! p-0! gap-0! overflow-hidden flex! flex-col! antialiased"
        showCloseButton={false}
      >
        <Suspense
          fallback={
            <div className="flex items-center justify-center w-full h-full">
              <div className="space-y-4 w-full max-w-2xl p-6">
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
            />
          </TurnReviewProvider>
        </Suspense>
      </DialogContent>
    </Dialog>
  );
}
