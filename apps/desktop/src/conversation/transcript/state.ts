import type { TranscriptState } from './types';

/**
 * Create initial transcript state.
 */
export const createInitialTranscriptState = (): TranscriptState => ({
  turns: {},
  turnOrder: [],
  latestReasoningHeader: null,
  pendingReasoningText: null,
  pendingTaskStartedAt: null,
  shouldBreakExecGroup: false,
  openUserMessageCell: null,
  openAgentMessageCell: null,
  reasoningSummaryFormat: 'none',
  latestTurnDiff: null,
  turnDiffHistory: [],
  activeTurnId: null,
});
