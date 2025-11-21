import type { TranscriptCell, TranscriptState } from './types';

export type TranscriptFlatEntry = {
  turnId: string;
  cellIndex: number;
  cell: TranscriptCell;
};

export const flattenTranscript = (
  transcript: TranscriptState
): TranscriptFlatEntry[] =>
  transcript.turnOrder.flatMap((turnId) => {
    const turn = transcript.turns[turnId];
    if (!turn) {
      return [];
    }
    return turn.cells.map((cell, cellIndex) => ({
      turnId,
      cellIndex,
      cell,
    }));
  });

export const countTranscriptCells = (transcript: TranscriptState): number =>
  transcript.turnOrder.reduce((total, turnId) => {
    const turn = transcript.turns[turnId];
    return total + (turn?.cells.length ?? 0);
  }, 0);
