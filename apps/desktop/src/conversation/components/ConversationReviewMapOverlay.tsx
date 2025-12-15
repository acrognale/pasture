import { Suspense, lazy, useEffect } from 'react';
import { Skeleton } from '~/components/ui/skeleton';

import { useConversationReviewMap } from '../store/hooks';

const ReviewMapOverlay = lazy(() =>
  import('~/review-map/ReviewMapOverlay').then((m) => ({
    default: m.ReviewMapOverlay,
  }))
);

export type ConversationReviewMapOverlayProps = {
  conversationId: string;
  open: boolean;
  onClose: () => void;
};

export function ConversationReviewMapOverlay({
  conversationId,
  open,
  onClose,
}: ConversationReviewMapOverlayProps) {
  const reviewMap = useConversationReviewMap(conversationId);

  useEffect(() => {
    if (!open) return;
    if (reviewMap.status === 'complete' && !reviewMap.output) {
      // If the map completed without output, auto-close on open to avoid an empty modal.
      onClose();
    }
  }, [onClose, open, reviewMap.output, reviewMap.status]);

  if (!open) {
    return null;
  }

  return (
    <Suspense
      fallback={
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-background/80 backdrop-blur-sm">
          <div className="w-full max-w-4xl space-y-4 p-6">
            <Skeleton className="h-8 w-64" />
            <Skeleton className="h-[60vh] w-full" />
          </div>
        </div>
      }
    >
      <ReviewMapOverlay
        open={open}
        onClose={onClose}
        status={reviewMap.status}
        output={reviewMap.output}
      />
    </Suspense>
  );
}

