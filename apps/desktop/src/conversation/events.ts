export const OPEN_REVIEW_OVERLAY_EVENT = 'conversation.openReviewOverlay';

export type ReviewOverlayMode = 'turn' | 'repo';

export type RepoReviewOverlayParams = {
  workspacePath: string;
  baseRef: string;
  targetRef?: string | null;
  includeWorktree: boolean;
};

export type OpenReviewOverlayDetail = {
  conversationId: string;
  fileDisplayPath?: string;
  mode?: ReviewOverlayMode;
  repo?: RepoReviewOverlayParams;
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
      detail: { conversationId, fileDisplayPath, mode: 'turn' },
    })
  );
}

export function dispatchOpenRepoReviewOverlayEvent(
  conversationId: string,
  params: RepoReviewOverlayParams,
  fileDisplayPath?: string
) {
  if (typeof window === 'undefined') {
    return;
  }

  window.dispatchEvent(
    new CustomEvent<OpenReviewOverlayDetail>(OPEN_REVIEW_OVERLAY_EVENT, {
      detail: { conversationId, fileDisplayPath, mode: 'repo', repo: params },
    })
  );
}
