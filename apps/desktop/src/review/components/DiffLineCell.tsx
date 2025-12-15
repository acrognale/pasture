import { useMemo } from 'react';
import { cn } from '~/lib/utils';

import { getDiffLineTheme } from '../diff';
import type { ParsedTurnDiffLine } from '../types';
import type { HighlightedLine } from '../useFileHighlighting';
import { HighlightedCode } from './HighlightedCode';

export type DiffLineCellProps = {
  filePath?: string;
  line: ParsedTurnDiffLine | null;
  primaryLineNumber: number | null;
  secondaryLineNumber?: number | null;
  prefix?: string | null;
  text?: string | null;
  tokens?: HighlightedLine;
  allowComment: boolean;
  onOpenDraft: () => void;
  cellClass?: string;
  focusLineRange?: { start: number; end: number } | null;
  lineNumberKind?: 'old' | 'new' | 'both';
};

export function DiffLineCell({
  filePath,
  line,
  primaryLineNumber,
  secondaryLineNumber,
  prefix,
  text,
  tokens,
  allowComment,
  onOpenDraft,
  cellClass,
  focusLineRange,
  lineNumberKind = 'both',
}: DiffLineCellProps) {
  const hasSecondaryColumn = secondaryLineNumber !== undefined;
  const resolvedPrefix = prefix ?? line?.prefix ?? null;
  const resolvedText = (() => {
    if (text !== undefined) {
      return text ?? '\u00A0';
    }
    if (!line) {
      return '\u00A0';
    }
    return line.text || '\u00A0';
  })();

  const cellTheme = cellClass
    ? cellClass
    : line
      ? getDiffLineTheme(line.kind)
      : 'bg-muted text-muted-foreground';

  const ariaLabel = useMemo(() => {
    if (!line) {
      return resolvedText;
    }
    return resolvedPrefix ? `${resolvedPrefix} ${resolvedText}` : resolvedText;
  }, [line, resolvedPrefix, resolvedText]);

  const gridTemplate = cn(
    'grid items-start gap-x-2',
    hasSecondaryColumn
      ? 'grid-cols-[30px_30px_4px_minmax(0,1fr)]'
      : 'grid-cols-[30px_4px_minmax(0,1fr)]'
  );

  const isInRange = (value: number | null) => {
    if (!focusLineRange || value == null) {
      return false;
    }
    return value >= focusLineRange.start && value <= focusLineRange.end;
  };

  const isFocused =
    lineNumberKind === 'old'
      ? isInRange(primaryLineNumber)
      : lineNumberKind === 'new'
        ? isInRange(primaryLineNumber)
        : secondaryLineNumber !== undefined
          ? isInRange(secondaryLineNumber ?? null)
          : isInRange(primaryLineNumber);

  const handleOpen = () => {
    if (line) {
      onOpenDraft();
    }
  };

  return (
    <div
      className={gridTemplate}
      data-diff-line="true"
      data-diff-file-path={filePath}
      data-diff-old-line={
        lineNumberKind === 'old' || lineNumberKind === 'both'
          ? primaryLineNumber ?? undefined
          : lineNumberKind === 'new'
            ? undefined
            : undefined
      }
      data-diff-new-line={
        lineNumberKind === 'new'
          ? primaryLineNumber ?? undefined
          : lineNumberKind === 'both'
            ? secondaryLineNumber ?? undefined
            : undefined
      }
    >
      <div className="select-none text-right font-mono text-transcript-micro text-muted-foreground leading-[20px]">
        {primaryLineNumber ?? ''}
      </div>
      {hasSecondaryColumn ? (
        <div className="select-none text-right font-mono text-transcript-micro text-muted-foreground leading-[20px]">
          {secondaryLineNumber ?? ''}
        </div>
      ) : null}

      <div className="select-none font-mono text-transcript-code leading-[20px]">
        {resolvedPrefix ? (
          <span aria-hidden="true" className="pointer-events-none">
            {resolvedPrefix}
          </span>
        ) : null}
      </div>

      <div className="group relative">
        <pre
          className={cn(
            'm-0 max-w-full overflow-x-auto whitespace-pre-wrap break-words px-2 font-mono text-transcript-code leading-[20px] pl-3',
            cellTheme,
            isFocused ? 'bg-accent/25 ring-1 ring-primary/60' : ''
          )}
          style={{ userSelect: 'contain' }}
          aria-label={ariaLabel}
        >
          <HighlightedCode text={resolvedText} tokens={tokens} />
        </pre>

        {allowComment && line ? (
          <button
            type="button"
            className="absolute left-0 top-1/2 -translate-y-1/2 rounded-sm bg-blue-500 px-1.5 py-0.5 text-xs leading-none text-white opacity-0 transition-opacity hover:bg-blue-600 group-hover:opacity-100"
            onClick={handleOpen}
          >
            +
          </button>
        ) : null}
      </div>
    </div>
  );
}
