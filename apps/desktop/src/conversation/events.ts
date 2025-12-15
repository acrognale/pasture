export const OPEN_REVIEW_OVERLAY_EVENT = 'conversation.openReviewOverlay';
export const OPEN_REVIEW_MAP_OVERLAY_EVENT = 'conversation.openReviewMapOverlay';

export type ReviewOverlayLineRange = {
  start: number;
  end: number;
};

export type ReviewOverlayMode = 'turn' | 'repo';

export type RepoReviewOverlayParams = {
  workspacePath: string;
  baseRef: string;
  targetRef: string | null;
  includeWorktree: boolean;
};

export type OpenReviewOverlayDetail = {
  conversationId: string;
  fileDisplayPath?: string;
  lineRange?: ReviewOverlayLineRange;
  mode?: ReviewOverlayMode;
  repo?: RepoReviewOverlayParams;
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
      detail: { conversationId, fileDisplayPath, lineRange, mode: 'turn' },
    })
  );
}

export function dispatchOpenRepoReviewOverlayEvent(
  conversationId: string,
  params: RepoReviewOverlayParams,
  fileDisplayPath?: string,
  lineRange?: ReviewOverlayLineRange
) {
  if (typeof window === 'undefined') {
    return;
  }

  window.dispatchEvent(
    new CustomEvent<OpenReviewOverlayDetail>(OPEN_REVIEW_OVERLAY_EVENT, {
      detail: {
        conversationId,
        fileDisplayPath,
        lineRange,
        mode: 'repo',
        repo: params,
      },
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
