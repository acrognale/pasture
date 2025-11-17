import type { TranscriptCell } from './types';

export type CollapsedTurnView = {
  type: 'collapsed-turn';
  turnId: string;
  userIndex: number;
  finalAgentIndex: number;
  hiddenIndices: number[];
};

export type TranscriptRenderable =
  | { type: 'cell'; index: number }
  | CollapsedTurnView;

// Stable key: avoid including streaming event ids so Framer Motion doesn't remount cells mid-stream.
const formatCellIdentifier = (cell: TranscriptCell) => cell.id;

const createTurnId = (
  userCell: TranscriptCell,
  agentCell: TranscriptCell,
  userIndex: number,
  agentIndex: number
) =>
  [
    'turn',
    userIndex,
    agentIndex,
    formatCellIdentifier(userCell),
    formatCellIdentifier(agentCell),
  ].join('::');

const isCollapsibleCandidate = (
  cells: ReadonlyArray<TranscriptCell>,
  index: number
) => cells[index]?.kind === 'user-message';

const isFinalCell = (cell: TranscriptCell) => {
  if (cell.kind === 'agent-message') {
    return true;
  }
  if (cell.kind === 'status' && cell.statusType === 'turn-aborted') {
    return true;
  }
  return false;
};

export const buildTranscriptView = (
  cells: ReadonlyArray<TranscriptCell>
): TranscriptRenderable[] => {
  const result: TranscriptRenderable[] = [];
  let index = 0;

  while (index < cells.length) {
    if (!isCollapsibleCandidate(cells, index)) {
      result.push({ type: 'cell', index });
      index += 1;
      continue;
    }

    const userIndex = index;
    const hidden: number[] = [];
    const renderableHidden: number[] = [];
    let finalAgentIndex: number | null = null;

    index += 1;
    while (index < cells.length) {
      const candidate = cells[index];

      if (!candidate) {
        break;
      }

      if (candidate.kind === 'user-message') {
        break;
      }

      if (isFinalCell(candidate)) {
        finalAgentIndex = index;
        index += 1;
        break;
      }

      hidden.push(index);
      if (candidate.kind !== 'agent-reasoning' || candidate.visible !== false) {
        renderableHidden.push(index);
      }
      index += 1;
    }

    if (finalAgentIndex != null && renderableHidden.length > 0) {
      const userCell = cells[userIndex];
      const agentCell = cells[finalAgentIndex];
      if (userCell && agentCell) {
        result.push({ type: 'cell', index: userIndex });
        result.push({
          type: 'collapsed-turn',
          turnId: createTurnId(userCell, agentCell, userIndex, finalAgentIndex),
          userIndex,
          hiddenIndices: renderableHidden,
          finalAgentIndex,
        });
      }
      continue;
    }

    // No collapse possible; emit the user cell, any hidden cells, and the agent cell individually.
    result.push({ type: 'cell', index: userIndex });
    hidden.forEach((hiddenIndex) =>
      result.push({ type: 'cell', index: hiddenIndex })
    );
    if (finalAgentIndex != null) {
      result.push({ type: 'cell', index: finalAgentIndex });
    }
  }

  return result;
};
