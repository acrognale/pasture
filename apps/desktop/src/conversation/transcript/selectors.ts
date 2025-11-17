import { makeKey } from './indices';
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
  index: number;
};

const isValidIndex = (value: unknown): value is number =>
  typeof value === 'number' && Number.isInteger(value) && value >= 0;

const fallbackFind = <K extends TranscriptCell['kind']>(
  state: TranscriptState,
  predicate: (
    cell: TranscriptCell
  ) => cell is Extract<TranscriptCell, { kind: K }>
): IndexedCell<K> | null => {
  for (let index = state.cells.length - 1; index >= 0; index -= 1) {
    const candidate = state.cells[index];
    if (predicate(candidate)) {
      return { cell: candidate, index };
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
  const index = state.indices.itemById[itemId];
  if (isValidIndex(index)) {
    const cell = state.cells[index];
    if (cell) {
      return {
        cell: cell as Extract<
          TranscriptCell,
          {
            kind: 'user-message' | 'agent-message' | 'agent-reasoning' | 'tool';
          }
        >,
        index,
      };
    }
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
  const index = state.indices.execByCallId[callId];
  if (isValidIndex(index)) {
    const cell = state.cells[index];
    if (cell && cell.kind === 'exec') {
      return { cell, index };
    }
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
  const index = state.indices.toolByTypeAndCallId[makeKey(toolType, callId)];
  if (isValidIndex(index)) {
    const cell = state.cells[index];
    if (cell && cell.kind === 'tool' && cell.toolType === toolType) {
      return { cell, index };
    }
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
  const index = state.indices.patchByCallId[callId];
  if (isValidIndex(index)) {
    const cell = state.cells[index];
    if (cell && cell.kind === 'patch') {
      return { cell, index };
    }
  }

  return fallbackFind(
    state,
    (candidate): candidate is TranscriptPatchCell =>
      candidate.kind === 'patch' && candidate.callId === callId
  );
};

export const lastCell = (
  state: TranscriptState
): TranscriptCell | undefined => {
  const { cells } = state;
  return cells.length ? cells[cells.length - 1] : undefined;
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
  state: TranscriptState
): IndexedCell<'task'> | null =>
  fallbackFind(
    state,
    (candidate): candidate is TranscriptTaskCell => candidate.kind === 'task'
  );

export const findExplorationAnchor = (
  state: TranscriptState
): IndexedCell<'exec'> | null => {
  for (let index = state.cells.length - 1; index >= 0; index -= 1) {
    const cell = state.cells[index];

    if (cell.kind === 'agent-reasoning' && cell.visible === false) {
      continue;
    }

    if (cell.kind === 'exec' && cell.exploration) {
      return { cell, index };
    }

    break;
  }

  return null;
};
