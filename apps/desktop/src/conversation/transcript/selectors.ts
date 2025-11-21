import { makeKey } from './indices';
import type { CellLocation } from './indices';
import type {
  TranscriptCell,
  TranscriptExecCommandCell,
  TranscriptPatchCell,
  TranscriptState,
  TranscriptTaskCell,
  TranscriptToolCell,
} from './types';

type IndexedCell<K extends TranscriptCell['kind']> = {
  cell: Extract<TranscriptCell, { kind: K }>;
  location: CellLocation;
};

const getCellAtLocation = (
  state: TranscriptState,
  location: CellLocation | undefined
): { cell: TranscriptCell; location: CellLocation } | null => {
  if (!location) {
    return null;
  }
  const turn = state.turns[location.turnId];
  if (!turn) {
    return null;
  }
  const cell = turn.cells[location.cellIndex];
  if (!cell) {
    return null;
  }
  return { cell, location };
};

const fallbackFind = <K extends TranscriptCell['kind']>(
  state: TranscriptState,
  predicate: (
    cell: TranscriptCell
  ) => cell is Extract<TranscriptCell, { kind: K }>
): IndexedCell<K> | null => {
  for (let t = state.turnOrder.length - 1; t >= 0; t -= 1) {
    const turnId = state.turnOrder[t];
    const turn = state.turns[turnId];
    if (!turn) {
      continue;
    }
    for (let index = turn.cells.length - 1; index >= 0; index -= 1) {
      const candidate = turn.cells[index];
      if (predicate(candidate)) {
        return { cell: candidate, location: { turnId, cellIndex: index } };
      }
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
  const location = state.indices.itemById[itemId];
  const indexed = getCellAtLocation(state, location);
  if (
    indexed &&
    (indexed.cell.kind === 'user-message' ||
      indexed.cell.kind === 'agent-message' ||
      indexed.cell.kind === 'agent-reasoning' ||
      indexed.cell.kind === 'tool')
  ) {
    return indexed as IndexedCell<
      'user-message' | 'agent-message' | 'agent-reasoning' | 'tool'
    >;
  }

  return fallbackFind(
    state,
    (
      candidate
    ): candidate is Extract<
      TranscriptCell,
      { kind: 'user-message' | 'agent-message' | 'agent-reasoning' | 'tool' }
    > => 'itemId' in candidate && candidate.itemId === itemId
  );
};

export const findExecCellByCallId = (
  state: TranscriptState,
  callId: string
): IndexedCell<'exec'> | null => {
  const indexed = getCellAtLocation(
    state,
    state.indices.execByCallId[callId]
  );
  if (indexed && indexed.cell.kind === 'exec') {
    return { cell: indexed.cell, location: indexed.location };
  }

  return fallbackFind(
    state,
    (candidate): candidate is TranscriptExecCommandCell =>
      candidate.kind === 'exec' && candidate.callId === callId
  );
};

export const findToolCellByCallId = (
  state: TranscriptState,
  toolType: TranscriptToolCell['toolType'],
  callId: string
): IndexedCell<'tool'> | null => {
  const indexed = getCellAtLocation(
    state,
    state.indices.toolByTypeAndCallId[makeKey(toolType, callId)]
  );
  if (
    indexed &&
    indexed.cell.kind === 'tool' &&
    indexed.cell.toolType === toolType
  ) {
    return { cell: indexed.cell, location: indexed.location };
  }

  return fallbackFind(
    state,
    (candidate): candidate is TranscriptToolCell =>
      candidate.kind === 'tool' &&
      candidate.toolType === toolType &&
      candidate.callId === callId
  );
};

export const findPatchCellByCallId = (
  state: TranscriptState,
  callId: string
): IndexedCell<'patch'> | null => {
  const indexed = getCellAtLocation(
    state,
    state.indices.patchByCallId[callId]
  );
  if (indexed && indexed.cell.kind === 'patch') {
    return { cell: indexed.cell, location: indexed.location };
  }

  return fallbackFind(
    state,
    (candidate): candidate is TranscriptPatchCell =>
      candidate.kind === 'patch' && candidate.callId === callId
  );
};

export const lastCell = (state: TranscriptState): TranscriptCell | undefined => {
  for (let t = state.turnOrder.length - 1; t >= 0; t -= 1) {
    const turn = state.turns[state.turnOrder[t]];
    if (!turn || !turn.cells.length) {
      continue;
    }
    return turn.cells[turn.cells.length - 1];
  }
  return undefined;
};

export const findUnclaimedCell = <K extends TranscriptCell['kind']>(
  state: TranscriptState,
  kind: K
): IndexedCell<K> | null =>
  fallbackFind(
    state,
    (candidate): candidate is Extract<TranscriptCell, { kind: K }> =>
      candidate.kind === kind &&
      'itemId' in candidate &&
      (candidate.itemId === null || candidate.itemId === undefined)
  );

export const findLatestTaskCell = (
  state: TranscriptState,
  turnId?: string
): IndexedCell<'task'> | null => {
  if (turnId) {
    const turn = state.turns[turnId];
    if (turn) {
      for (let index = turn.cells.length - 1; index >= 0; index -= 1) {
        const candidate = turn.cells[index];
        if (candidate.kind === 'task') {
          return { cell: candidate, location: { turnId, cellIndex: index } };
        }
      }
    }
  }

  return fallbackFind(
    state,
    (candidate): candidate is TranscriptTaskCell => candidate.kind === 'task'
  );
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
