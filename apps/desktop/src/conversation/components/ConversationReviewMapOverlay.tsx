import { useEffect } from 'react';

import { useConversationReviewMap } from '../store/hooks';
import { ReviewMapOverlay } from '~/review-map/ReviewMapOverlay';

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
    <ReviewMapOverlay
      open={open}
      onClose={onClose}
      conversationId={conversationId}
      status={reviewMap.status}
      output={reviewMap.output}
    />
  );
}
