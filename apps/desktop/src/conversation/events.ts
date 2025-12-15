export const OPEN_REVIEW_OVERLAY_EVENT = 'conversation.openReviewOverlay';
export const OPEN_REVIEW_MAP_OVERLAY_EVENT = 'conversation.openReviewMapOverlay';

export type OpenReviewOverlayDetail = {
  conversationId: string;
  fileDisplayPath?: string;
};

export type OpenReviewMapOverlayDetail = {
  conversationId: string;
};

export function dispatchOpenReviewOverlayEvent(
  conversationId: string,
  fileDisplayPath?: string
) {
  if (typeof window === 'undefined') {
    return;
  }

  window.dispatchEvent(
    new CustomEvent<OpenReviewOverlayDetail>(OPEN_REVIEW_OVERLAY_EVENT, {
      detail: { conversationId, fileDisplayPath },
    })
  );
}

export function dispatchOpenReviewMapOverlayEvent(conversationId: string) {
  if (typeof window === 'undefined') {
    return;
  }

  window.dispatchEvent(
    new CustomEvent<OpenReviewMapOverlayDetail>(OPEN_REVIEW_MAP_OVERLAY_EVENT, {
      detail: { conversationId },
    })
  );
}
