import type {
  ParsedTurnDiffFile,
  ParsedTurnDiffLine,
  TurnReviewComment,
} from './types';

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
