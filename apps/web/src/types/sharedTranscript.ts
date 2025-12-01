export type SharedTranscriptTurnStatus = 'active' | 'completed' | 'aborted';

export type SharedTranscriptCell = {
  id: string;
  timestamp?: string;
  kind: string;
  message?: string;
  text?: string;
  summary?: string;
  statusType?: string;
  severity?: string;
  [key: string]: any;
};

export type SharedTranscriptTurn = {
  id: string;
  cells: SharedTranscriptCell[];
  status?: SharedTranscriptTurnStatus;
  startedAt?: string | null;
  completedAt?: string | null;
};

export type SharedTranscriptState = {
  turns: Record<string, SharedTranscriptTurn>;
  turnOrder: string[];
};
