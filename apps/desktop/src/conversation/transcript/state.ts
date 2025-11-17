import { emptyIndices } from './indices';
import type { TranscriptState } from './types';

/**
 * Create initial transcript state.
 */
export const createInitialTranscriptState = (): TranscriptState => ({
  cells: [],
  latestReasoningHeader: null,
  pendingReasoningText: null,
  pendingTaskStartedAt: null,
  shouldBreakExecGroup: false,
  openUserMessageCellIndex: null,
  openAgentMessageCellIndex: null,
  reasoningSummaryFormat: 'none',
  indices: emptyIndices(),
  latestTurnDiff: null,
  turnDiffHistory: [],
  turnCounter: 0,
  activeTurnNumber: null,
});
