import { makeKey } from './indices';
import type { CellLocation } from './indices';
import type {
  TranscriptCell,
  TranscriptState,
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

export const getItemCell = (
  state: TranscriptState,
  itemId: string
): IndexedCell<
  'user-message' | 'agent-message' | 'agent-reasoning' | 'tool'
> | null => {
  const location = state.indices.itemById[itemId];
  if (!location) {
    return null;
  }
  const indexed = getCellAtLocation(state, location);
  if (!indexed) {
    return null;
  }
  if (
    indexed.cell.kind === 'user-message' ||
    indexed.cell.kind === 'agent-message' ||
    indexed.cell.kind === 'agent-reasoning' ||
    indexed.cell.kind === 'tool'
  ) {
    return {
      cell: indexed.cell,
      location: indexed.location,
    } as IndexedCell<
      'user-message' | 'agent-message' | 'agent-reasoning' | 'tool'
    >;
  }

  return null;
};

export const findExecCellByCallId = (
  state: TranscriptState,
  callId: string
): IndexedCell<'exec'> | null => {
  const location = state.indices.execByCallId[callId];
  if (!location) {
    return null;
  }
  const indexed = getCellAtLocation(state, location);
  if (indexed && indexed.cell.kind === 'exec') {
    return { cell: indexed.cell, location: indexed.location };
  }

  return null;
};

export const findToolCellByCallId = (
  state: TranscriptState,
  toolType: TranscriptToolCell['toolType'],
  callId: string
): IndexedCell<'tool'> | null => {
  const location = state.indices.toolByTypeAndCallId[makeKey(toolType, callId)];
  if (!location) {
    return null;
  }
  const indexed = getCellAtLocation(state, location);
  if (
    indexed &&
    indexed.cell.kind === 'tool' &&
    indexed.cell.toolType === toolType
  ) {
    return { cell: indexed.cell, location: indexed.location };
  }

  return null;
};

export const findPatchCellByCallId = (
  state: TranscriptState,
  callId: string
): IndexedCell<'patch'> | null => {
  const location = state.indices.patchByCallId[callId];
  if (!location) {
    return null;
  }
  const indexed = getCellAtLocation(state, location);
  if (indexed && indexed.cell.kind === 'patch') {
    return { cell: indexed.cell, location: indexed.location };
  }

  return null;
};

export const lastCell = (state: TranscriptState): TranscriptCell | undefined => {
  const turnId = state.turnOrder[state.turnOrder.length - 1];
  const turn = turnId ? state.turns[turnId] : undefined;
  if (!turn || !turn.cells.length) {
    return undefined;
  }
  return turn.cells[turn.cells.length - 1];
};

export const findUnclaimedCell = <K extends TranscriptCell['kind']>(
  state: TranscriptState,
  kind: K
): IndexedCell<K> | null => {
  for (let t = state.turnOrder.length - 1; t >= 0; t -= 1) {
    const turnId = state.turnOrder[t];
    const turn = state.turns[turnId];
    if (!turn) {
      continue;
    }
    for (let index = turn.cells.length - 1; index >= 0; index -= 1) {
      const candidate = turn.cells[index];
      if (
        candidate.kind === kind &&
        'itemId' in candidate &&
        (candidate.itemId === null || candidate.itemId === undefined)
      ) {
        return {
          cell: candidate as Extract<TranscriptCell, { kind: K }>,
          location: { turnId, cellIndex: index },
        };
      }
    }
  }

  return null;
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
