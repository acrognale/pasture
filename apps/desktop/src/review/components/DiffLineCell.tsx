import { useMemo } from 'react';
import { cn } from '~/lib/utils';

import { getDiffLineTheme } from '../diff-utils';
import type { ParsedTurnDiffLine } from '../types';

export type DiffLineCellProps = {
  line: ParsedTurnDiffLine | null;
  primaryLineNumber: number | null;
  secondaryLineNumber?: number | null;
  prefix?: string | null;
  text?: string | null;
  allowComment: boolean;
  onOpenDraft: (lineId: string) => void;
  cellClass?: string;
};

export function DiffLineCell({
  line,
  primaryLineNumber,
  secondaryLineNumber,
  prefix,
  text,
  allowComment,
  onOpenDraft,
  cellClass,
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

  const handleOpen = () => {
    if (line) {
      onOpenDraft(line.id);
    }
  };

  return (
    <div className={gridTemplate}>
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
            cellTheme
          )}
          style={{ userSelect: 'contain' }}
          aria-label={ariaLabel}
        >
          {resolvedText}
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
