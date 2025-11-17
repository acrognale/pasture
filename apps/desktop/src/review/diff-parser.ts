import type {
  DiffRange,
  ParsedTurnDiff,
  ParsedTurnDiffFile,
  ParsedTurnDiffHunk,
  ParsedTurnDiffLine,
} from './types';

const normalizeInput = (input: string): string => input.replace(/\r\n/g, '\n');

const HUNK_HEADER_PATTERN =
  /@@\s*-([0-9]+)(?:,([0-9]+))?\s+\+([0-9]+)(?:,([0-9]+))?\s*@@/;

const parseRange = (
  startRaw: string | undefined,
  lengthRaw: string | undefined
): DiffRange | null => {
  if (!startRaw) {
    return null;
  }

  const start = parseInt(startRaw, 10);
  const length = lengthRaw ? parseInt(lengthRaw, 10) : 1;

  if (Number.isNaN(start) || Number.isNaN(length)) {
    return null;
  }

  return { start, length };
};

const deriveDisplayPath = (oldPath: string | null, newPath: string | null) => {
  if (newPath && newPath !== '/dev/null') {
    return newPath;
  }
  if (oldPath && oldPath !== '/dev/null') {
    return oldPath;
  }
  return 'Unknown path';
};

const normalizePath = (input: string | undefined): string | null => {
  if (!input || input === '/dev/null') {
    return null;
  }
  return input.replace(/^[ab]\//, '');
};

export const parseUnifiedDiff = (input: string): ParsedTurnDiff => {
  const files: ParsedTurnDiffFile[] = [];
  if (!input.trim()) {
    return { files };
  }

  const lines = normalizeInput(input).split('\n');

  let currentFile: ParsedTurnDiffFile | null = null;
  let currentHunk: ParsedTurnDiffHunk | null = null;
  let oldLineNumber = 0;
  let newLineNumber = 0;
  let fileCounter = 0;
  let hunkCounter = 0;
  let lineCounter = 0;

  const startFile = (oldPath: string | null, newPath: string | null) => {
    const file: ParsedTurnDiffFile = {
      id: `file-${fileCounter}`,
      oldPath,
      newPath,
      displayPath: deriveDisplayPath(oldPath, newPath),
      hunks: [],
    };
    files.push(file);
    currentFile = file;
    currentHunk = null;
    fileCounter += 1;
    hunkCounter = 0;
    oldLineNumber = 0;
    newLineNumber = 0;
  };

  const ensureFile = (): ParsedTurnDiffFile => {
    if (!currentFile) {
      startFile(null, null);
    }
    return currentFile!;
  };

  const startHunk = (
    header: string,
    oldRange: DiffRange | null,
    newRange: DiffRange | null
  ) => {
    const file = ensureFile();
    const hunk: ParsedTurnDiffHunk = {
      id: `${file.id}-h${hunkCounter}`,
      header,
      oldRange,
      newRange,
      lines: [],
    };
    file.hunks.push(hunk);
    currentHunk = hunk;
    hunkCounter += 1;
    oldLineNumber = (oldRange?.start ?? 1) - 1;
    newLineNumber = (newRange?.start ?? 1) - 1;
  };

  const ensureHunk = (): ParsedTurnDiffHunk => {
    if (currentHunk) {
      return currentHunk;
    }
    const file = ensureFile();
    const hunk: ParsedTurnDiffHunk = {
      id: `${file.id}-h${hunkCounter}`,
      header: '',
      oldRange: null,
      newRange: null,
      lines: [],
    };
    file.hunks.push(hunk);
    currentHunk = hunk;
    hunkCounter += 1;
    return hunk;
  };

  const pushLine = (kind: ParsedTurnDiffLine['kind'], payload: string) => {
    const hunk = ensureHunk();
    const line: ParsedTurnDiffLine = {
      id: `${hunk.id}-l${lineCounter}`,
      kind,
      text: payload,
      oldNumber: null,
      newNumber: null,
      prefix:
        kind === 'addition'
          ? '+'
          : kind === 'removal'
            ? '-'
            : kind === 'context'
              ? ' '
              : '',
    };

    if (kind === 'addition') {
      newLineNumber += 1;
      line.newNumber = newLineNumber;
    } else if (kind === 'removal') {
      oldLineNumber += 1;
      line.oldNumber = oldLineNumber;
    } else if (kind === 'context') {
      oldLineNumber += 1;
      newLineNumber += 1;
      line.oldNumber = oldLineNumber;
      line.newNumber = newLineNumber;
    }

    lineCounter += 1;
    hunk.lines.push(line);
  };

  for (const rawLine of lines) {
    if (!rawLine.trim() && !currentHunk) {
      continue;
    }

    if (rawLine.startsWith('diff --git')) {
      const parts = rawLine.split(' ');
      const oldPath = normalizePath(parts[2]);
      const newPath = normalizePath(parts[3]);
      startFile(oldPath, newPath);
      continue;
    }

    if (rawLine.startsWith('--- ')) {
      const file = ensureFile();
      file.oldPath = normalizePath(rawLine.slice(4));
      file.displayPath = deriveDisplayPath(file.oldPath, file.newPath);
      continue;
    }

    if (rawLine.startsWith('+++ ')) {
      const file = ensureFile();
      file.newPath = normalizePath(rawLine.slice(4));
      file.displayPath = deriveDisplayPath(file.oldPath, file.newPath);
      continue;
    }

    if (rawLine.startsWith('@@')) {
      const match = rawLine.match(HUNK_HEADER_PATTERN);
      const oldRange = parseRange(match?.[1], match?.[2]);
      const newRange = parseRange(match?.[3], match?.[4]);
      startHunk(rawLine, oldRange, newRange);
      continue;
    }

    if (rawLine.startsWith('+') && !rawLine.startsWith('+++')) {
      pushLine('addition', rawLine.slice(1));
      continue;
    }

    if (rawLine.startsWith('-') && !rawLine.startsWith('---')) {
      pushLine('removal', rawLine.slice(1));
      continue;
    }

    if (rawLine.startsWith(' ')) {
      pushLine('context', rawLine.slice(1));
      continue;
    }

    const hunk = ensureHunk();
    hunk.lines.push({
      id: `${hunk.id}-l${lineCounter}`,
      kind: 'metadata',
      text: rawLine,
      oldNumber: null,
      newNumber: null,
      prefix: '',
    });
    lineCounter += 1;
  }

  return { files };
};
