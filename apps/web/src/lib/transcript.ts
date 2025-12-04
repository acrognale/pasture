type SharedTranscript = {
  turns?: Record<string, { cells?: unknown[] }>;
  turnOrder?: string[];
};

type SessionConfiguredCell = {
  kind?: string;
  model?: string;
  reasoningEffort?: string | null;
};

const isSessionConfigured = (cell: unknown): cell is SessionConfiguredCell => {
  return Boolean(
    cell &&
      typeof cell === 'object' &&
      (cell as SessionConfiguredCell).kind === 'session-configured'
  );
};

const collectSessionConfiguredCells = (
  transcript: SharedTranscript | undefined | null
): SessionConfiguredCell[] => {
  if (!transcript?.turnOrder || !transcript.turns) {
    return [];
  }

  const cells: SessionConfiguredCell[] = [];

  for (const turnId of transcript.turnOrder) {
    const turn = transcript.turns?.[turnId];
    if (!turn?.cells) continue;

    for (const cell of turn.cells as unknown[]) {
      if (isSessionConfigured(cell)) {
        cells.push(cell);
      }
    }
  }

  return cells;
};

export const deriveModelFromTranscript = (
  transcript: SharedTranscript | undefined | null
): string | null => {
  const cells = collectSessionConfiguredCells(transcript);
  for (let i = cells.length - 1; i >= 0; i -= 1) {
    const model = cells[i]?.model;
    if (model && typeof model === 'string') {
      return model;
    }
  }
  return null;
};

export const deriveReasoningEffortFromTranscript = (
  transcript: SharedTranscript | undefined | null
): string | null => {
  const cells = collectSessionConfiguredCells(transcript);
  for (let i = cells.length - 1; i >= 0; i -= 1) {
    const effort = cells[i]?.reasoningEffort;
    if (effort && typeof effort === 'string') {
      return effort;
    }
  }
  return null;
};
