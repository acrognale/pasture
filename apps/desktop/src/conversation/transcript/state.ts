import type { TranscriptState } from '@pasture/transcript-ui';

/**
 * Create initial transcript state.
 */
export const createInitialTranscriptState = (): TranscriptState => ({
  turns: {},
  turnOrder: [],
  latestReasoningHeader: null,
  pendingReasoningText: null,
  shouldBreakExecGroup: false,
  openUserMessageCell: null,
  openAgentMessageCell: null,
  reasoningSummaryFormat: 'none',
  latestTurnDiff: null,
  turnDiffHistory: [],
  activeTurnId: null,
});
