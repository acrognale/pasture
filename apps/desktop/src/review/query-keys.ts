import type { GetTurnDiffRangeParams } from '~/codex.gen';

export const turnReviewKeys = {
  snapshots: (conversationId: string) =>
    ['turnReview', 'snapshots', conversationId] as const,
  diffRange: (params: GetTurnDiffRangeParams) =>
    [
      'turnReview',
      'diffRange',
      params.conversationId,
      params.baseEventId,
      params.targetEventId,
    ] as const,
};
