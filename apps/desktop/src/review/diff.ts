import type { BundledLanguage } from 'shiki';

import type {
  DiffRange,
  ParsedTurnDiff,
  ParsedTurnDiffFile,
  ParsedTurnDiffHunk,
  ParsedTurnDiffLine,
  TurnReviewComment,
} from './types';

// Language detection

const EXTENSION_TO_LANGUAGE: Record<string, BundledLanguage> = {
  ts: 'typescript',
  tsx: 'tsx',
  js: 'javascript',
  jsx: 'jsx',
  mjs: 'javascript',
  cjs: 'javascript',
  mts: 'typescript',
  cts: 'typescript',
  json: 'json',
  jsonc: 'jsonc',
  css: 'css',
  scss: 'scss',
  less: 'less',
  html: 'html',
  htm: 'html',
  vue: 'vue',
  svelte: 'svelte',
  py: 'python',
  rs: 'rust',
  go: 'go',
  java: 'java',
  kt: 'kotlin',
  swift: 'swift',
  c: 'c',
  cpp: 'cpp',
  h: 'c',
  hpp: 'cpp',
  cs: 'csharp',
  rb: 'ruby',
  php: 'php',
  sh: 'bash',
  bash: 'bash',
  zsh: 'bash',
  fish: 'fish',
  sql: 'sql',
  md: 'markdown',
  mdx: 'mdx',
  yaml: 'yaml',
  yml: 'yaml',
  toml: 'toml',
  xml: 'xml',
  svg: 'xml',
  graphql: 'graphql',
  gql: 'graphql',
  dockerfile: 'dockerfile',
  makefile: 'makefile',
  lua: 'lua',
  r: 'r',
  scala: 'scala',
  clj: 'clojure',
  ex: 'elixir',
  exs: 'elixir',
  erl: 'erlang',
  hs: 'haskell',
  ml: 'ocaml',
  nim: 'nim',
  zig: 'zig',
  v: 'v',
  d: 'd',
  groovy: 'groovy',
  gradle: 'groovy',
  tf: 'hcl',
  hcl: 'hcl',
  prisma: 'prisma',
  astro: 'astro',
};

const FILENAME_TO_LANGUAGE: Record<string, BundledLanguage> = {
  Dockerfile: 'dockerfile',
  Makefile: 'makefile',
  Gemfile: 'ruby',
  Rakefile: 'ruby',
  Vagrantfile: 'ruby',
  Podfile: 'ruby',
  Fastfile: 'ruby',
  Brewfile: 'ruby',
  Procfile: 'yaml',
  '.editorconfig': 'ini',
  'package.json': 'json',
  'tsconfig.json': 'jsonc',
  'jsconfig.json': 'jsonc',
};

export const detectLanguage = (filePath: string): string => {
  const filename = filePath.split('/').pop() ?? '';

  if (FILENAME_TO_LANGUAGE[filename]) {
    return FILENAME_TO_LANGUAGE[filename];
  }

  const ext = filename.split('.').pop()?.toLowerCase();
  if (ext && EXTENSION_TO_LANGUAGE[ext]) {
    return EXTENSION_TO_LANGUAGE[ext];
  }

  return 'text';
};

// Diff parsing

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
    const displayPath = deriveDisplayPath(oldPath, newPath);
    const file: ParsedTurnDiffFile = {
      id: `file-${fileCounter}`,
      oldPath,
      newPath,
      displayPath,
      hunks: [],
      language: detectLanguage(displayPath),
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
      file.language = detectLanguage(file.displayPath);
      continue;
    }

    if (rawLine.startsWith('+++ ')) {
      const file = ensureFile();
      file.newPath = normalizePath(rawLine.slice(4));
      file.displayPath = deriveDisplayPath(file.oldPath, file.newPath);
      file.language = detectLanguage(file.displayPath);
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

// Diff utilities

export const formatTurnLabel = (entry: { turnNumber: number }): string =>
  `Turn ${entry.turnNumber}`;

export const formatTurnTimestamp = (value: string): string => {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return '';
  }

  return new Intl.DateTimeFormat(undefined, {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).format(date);
};

export const buildFileDiffStats = (
  files: ParsedTurnDiffFile[]
): Map<string, { added: number; removed: number }> => {
  const stats = new Map<string, { added: number; removed: number }>();
  for (const file of files) {
    let added = 0;
    let removed = 0;
    for (const hunk of file.hunks) {
      for (const line of hunk.lines) {
        if (line.kind === 'addition') {
          added += 1;
        } else if (line.kind === 'removal') {
          removed += 1;
        }
      }
    }
    stats.set(file.id, { added, removed });
  }
  return stats;
};

export const groupCommentsByLine = (
  comments: readonly TurnReviewComment[]
): Map<string, TurnReviewComment[]> => {
  const grouped = new Map<string, TurnReviewComment[]>();
  for (const comment of comments) {
    const existing = grouped.get(comment.lineId);
    if (existing) {
      grouped.set(comment.lineId, [...existing, comment]);
    } else {
      grouped.set(comment.lineId, [comment]);
    }
  }
  return grouped;
};

export const groupCommentsByFile = (
  comments: readonly TurnReviewComment[]
): Map<string, number> => {
  const counts = new Map<string, number>();
  for (const comment of comments) {
    counts.set(comment.fileId, (counts.get(comment.fileId) ?? 0) + 1);
  }
  return counts;
};

export type SplitDiffRow = {
  id: string;
  left: ParsedTurnDiffLine | null;
  right: ParsedTurnDiffLine | null;
};

export const buildSplitDiffRows = (
  lines: ParsedTurnDiffLine[]
): SplitDiffRow[] => {
  const rows: SplitDiffRow[] = [];
  let index = 0;

  while (index < lines.length) {
    const line = lines[index];

    if (line.kind === 'metadata') {
      index += 1;
      continue;
    }

    if (line.kind === 'context') {
      rows.push({
        id: line.id,
        left: line,
        right: line,
      });
      index += 1;
      continue;
    }

    if (line.kind === 'removal' || line.kind === 'addition') {
      const removals: ParsedTurnDiffLine[] = [];
      const additions: ParsedTurnDiffLine[] = [];

      while (index < lines.length && lines[index].kind === 'removal') {
        removals.push(lines[index]);
        index += 1;
      }

      while (index < lines.length && lines[index].kind === 'addition') {
        additions.push(lines[index]);
        index += 1;
      }

      const maxLen = Math.max(removals.length, additions.length);
      for (let offset = 0; offset < maxLen; offset += 1) {
        const leftLine = removals[offset] ?? null;
        const rightLine = additions[offset] ?? null;
        const idSource =
          leftLine?.id ?? rightLine?.id ?? `split-${rows.length}`;
        const rowId =
          leftLine && rightLine ? `${leftLine.id}:${rightLine.id}` : idSource;

        rows.push({
          id: rowId,
          left: leftLine,
          right: rightLine,
        });
      }
      continue;
    }

    rows.push({
      id: line.id,
      left: line,
      right: null,
    });
    index += 1;
  }

  return rows;
};

export const getDiffLineTheme = (kind: ParsedTurnDiffLine['kind']): string => {
  switch (kind) {
    case 'addition':
      return 'bg-emerald-50 text-emerald-800';
    case 'removal':
      return 'bg-rose-50 text-rose-800';
    case 'metadata':
      return 'bg-muted text-muted-foreground';
    default:
      return 'bg-background text-foreground';
  }
};

export const getDiffLineDisplayText = (line: ParsedTurnDiffLine): string => {
  if (line.kind === 'metadata') {
    return line.text;
  }
  return line.prefix ? `${line.prefix}${line.text}` : line.text;
};
