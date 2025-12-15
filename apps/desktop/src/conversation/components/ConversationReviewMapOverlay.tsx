import { useEffect } from 'react';

import { useConversationReviewMap } from '../store/hooks';
import { ReviewMapOverlay } from '~/review-map/ReviewMapOverlay';

export type ConversationReviewMapOverlayProps = {
  conversationId: string;
  workspacePath: string;
  open: boolean;
  onClose: () => void;
  selectedStepId: string | null;
  onSelectStepId: (stepId: string | null) => void;
};

export function ConversationReviewMapOverlay({
  conversationId,
  workspacePath,
  open,
  onClose,
  selectedStepId,
  onSelectStepId,
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
      onClose={onClose}
      conversationId={conversationId}
      workspacePath={workspacePath}
      status={reviewMap.status}
      output={reviewMap.output}
      selectedStepId={selectedStepId}
      onSelectStepId={onSelectStepId}
    />
  );
}
