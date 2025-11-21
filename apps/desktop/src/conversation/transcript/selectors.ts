import type {
  CellLocation,
  TranscriptCell,
  TranscriptState,
  TranscriptToolCell,
} from './types';

type IndexedCell<K extends TranscriptCell['kind']> = {
  cell: Extract<TranscriptCell, { kind: K }>;
  location: CellLocation;
};

const findCellInTurn = (
  state: TranscriptState,
  turnId: string,
  predicate: (cell: TranscriptCell) => boolean
): { cell: TranscriptCell; location: CellLocation } | null => {
  const turn = state.turns[turnId];
  if (!turn) {
    return null;
  }

  for (let i = turn.cells.length - 1; i >= 0; i -= 1) {
    const cell = turn.cells[i];
    if (predicate(cell)) {
      return { cell, location: { turnId, cellIndex: i } };
    }
  }

  return null;
};

export const getItemCell = (
  state: TranscriptState,
  itemId: string
): IndexedCell<
  'user-message' | 'agent-message' | 'agent-reasoning' | 'tool'
> | null => {
  const kinds: TranscriptCell['kind'][] = [
    'user-message',
    'agent-message',
    'agent-reasoning',
    'tool',
  ];

  for (let t = state.turnOrder.length - 1; t >= 0; t -= 1) {
    const turnId = state.turnOrder[t];
    const turn = state.turns[turnId];
    if (!turn) {
      continue;
    }
    for (let index = turn.cells.length - 1; index >= 0; index -= 1) {
      const candidate = turn.cells[index];
      if (
        kinds.includes(candidate.kind) &&
        'itemId' in candidate &&
        candidate.itemId === itemId
      ) {
        return {
          cell: candidate as Extract<
            TranscriptCell,
            { kind: 'user-message' | 'agent-message' | 'agent-reasoning' | 'tool' }
          >,
          location: { turnId, cellIndex: index },
        };
      }
    }
  }

  return null;
};

export const findExecCellByCallId = (
  state: TranscriptState,
  turnId: string,
  callId: string
): IndexedCell<'exec'> | null => {
  const result = findCellInTurn(
    state,
    turnId,
    (cell) => cell.kind === 'exec' && cell.callId === callId
  );
  return result
    ? (result as { cell: Extract<TranscriptCell, { kind: 'exec' }>; location: CellLocation })
    : null;
};

export const findToolCellByCallId = (
  state: TranscriptState,
  turnId: string,
  toolType: TranscriptToolCell['toolType'],
  callId: string
): IndexedCell<'tool'> | null => {
  const result = findCellInTurn(
    state,
    turnId,
    (cell) =>
      cell.kind === 'tool' &&
      cell.toolType === toolType &&
      cell.callId === callId
  );
  return result
    ? (result as { cell: Extract<TranscriptCell, { kind: 'tool' }>; location: CellLocation })
    : null;
};

export const findPatchCellByCallId = (
  state: TranscriptState,
  turnId: string,
  callId: string
): IndexedCell<'patch'> | null => {
  const result = findCellInTurn(
    state,
    turnId,
    (cell) => cell.kind === 'patch' && cell.callId === callId
  );
  return result
    ? (result as { cell: Extract<TranscriptCell, { kind: 'patch' }>; location: CellLocation })
    : null;
};

export const findLatestTaskCell = (
  state: TranscriptState,
  turnId?: string
): IndexedCell<'task'> | null => {
  const turnIds = turnId ? [turnId] : state.turnOrder;
  for (let t = turnIds.length - 1; t >= 0; t -= 1) {
    const currentTurnId = turnIds[t];
    const turn = state.turns[currentTurnId];
    if (!turn) {
      continue;
    }
    for (let index = turn.cells.length - 1; index >= 0; index -= 1) {
      const candidate = turn.cells[index];
      if (candidate.kind === 'task') {
        return {
          cell: candidate,
          location: { turnId: currentTurnId, cellIndex: index },
        };
      }
    }
  }

  return null;
};

export const findExplorationAnchor = (
  state: TranscriptState,
  turnId: string
): IndexedCell<'exec'> | null => {
  const turn = state.turns[turnId];
  if (!turn) {
    return null;
  }

  for (let index = turn.cells.length - 1; index >= 0; index -= 1) {
    const cell = turn.cells[index];

    if (cell.kind === 'agent-reasoning' && cell.visible === false) {
      continue;
    }

    if (cell.kind === 'exec' && cell.exploration) {
      return { cell, location: { turnId, cellIndex: index } };
    }

    break;
  }

  return null;
};
