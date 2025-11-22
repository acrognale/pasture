export const OPEN_REVIEW_OVERLAY_EVENT = 'conversation.openReviewOverlay';

export type OpenReviewOverlayDetail = {
  conversationId: string;
};

export function dispatchOpenReviewOverlayEvent(conversationId: string) {
  if (typeof window === 'undefined') {
    return;
  }

  window.dispatchEvent(
    new CustomEvent<OpenReviewOverlayDetail>(OPEN_REVIEW_OVERLAY_EVENT, {
      detail: { conversationId },
    })
  );
}
