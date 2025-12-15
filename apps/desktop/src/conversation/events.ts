export const OPEN_REVIEW_OVERLAY_EVENT = 'conversation.openReviewOverlay';
export const OPEN_REVIEW_MAP_OVERLAY_EVENT = 'conversation.openReviewMapOverlay';

export type ReviewOverlayLineRange = {
  start: number;
  end: number;
};

export type OpenReviewOverlayDetail = {
  conversationId: string;
  fileDisplayPath?: string;
  lineRange?: ReviewOverlayLineRange;
};

export type OpenReviewMapOverlayDetail = {
  conversationId: string;
};

export function dispatchOpenReviewOverlayEvent(
  conversationId: string,
  fileDisplayPath?: string,
  lineRange?: ReviewOverlayLineRange
) {
  if (typeof window === 'undefined') {
    return;
  }

  window.dispatchEvent(
    new CustomEvent<OpenReviewOverlayDetail>(OPEN_REVIEW_OVERLAY_EVENT, {
      detail: { conversationId, fileDisplayPath, lineRange },
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
