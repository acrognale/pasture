export type ParsedTurnDiff = {
  files: ParsedTurnDiffFile[];
};

export type ParsedTurnDiffFile = {
  id: string;
  oldPath: string | null;
  newPath: string | null;
  displayPath: string;
  hunks: ParsedTurnDiffHunk[];
};

export type ParsedTurnDiffHunk = {
  id: string;
  header: string;
  oldRange: DiffRange | null;
  newRange: DiffRange | null;
  lines: ParsedTurnDiffLine[];
};

export type DiffRange = {
  start: number;
  length: number;
};

export type ParsedTurnDiffLine = {
  id: string;
  kind: 'context' | 'addition' | 'removal' | 'metadata';
  text: string;
  oldNumber: number | null;
  newNumber: number | null;
  prefix: string;
};

export type TurnReviewComment = {
  id: string;
  fileId: string;
  hunkId: string;
  lineId: string;
  filePath: string;
  lineKind: ParsedTurnDiffLine['kind'];
  oldLineNumber: number | null;
  newLineNumber: number | null;
  text: string;
  createdAt: string;
};

export type TurnReviewCommentInput = {
  lineId: string;
  text: string;
};
