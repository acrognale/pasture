import { useMemo, useState } from 'react';

import { cn, splitLines } from '../lib/utils';
import type { TranscriptExecCommandCell } from '../types';
import { Cell } from './Cell';

type ExecutionResultProps = {
  cell: TranscriptExecCommandCell;
};

const OUTPUT_MAX_LINES = 5;

const stageOutputLines = (lines: string[]): string[] => lines;

const truncateLinesMiddle = (lines: string[], maxLines: number): string[] => {
  if (lines.length <= maxLines) {
    return lines;
  }
  const half = Math.floor(maxLines / 2);
  const omitted = lines.length - maxLines + 1;
  return [
    ...lines.slice(0, half),
    `… +${omitted} lines`,
    ...lines.slice(lines.length - half),
  ];
};

const OutputSection = ({
  output,
  colorClass,
}: {
  output: string;
  colorClass: string;
}) => {
  const lines = useMemo(() => {
    const rawLines = splitLines(output);
    const staged = stageOutputLines(rawLines);
    return truncateLinesMiddle(staged, OUTPUT_MAX_LINES);
  }, [output]);

  return (
    <>
      {lines.map((line, index) => (
        <div
          key={`${colorClass}-${index}-${line}`}
          className={
            line.startsWith('… +') ? 'text-muted-foreground' : colorClass
          }
        >
          {line.length > 0 ? line : ' '}
        </div>
      ))}
    </>
  );
};

export function ExecutionResult({ cell }: ExecutionResultProps) {
  const status = cell.status;
  const hasStdout = (cell.stdout ?? '').trim().length > 0;
  const hasStderr = (cell.stderr ?? '').trim().length > 0;
  const aggregatedOutput = cell.aggregatedOutput ?? '';
  const showAggregated = aggregatedOutput.trim().length > 0;

  const commandText = cell.command.length
    ? cell.command.join(' ')
    : '(command pending)';

  const exitCode = cell.exitCode ?? 'n/a';
  const exitCodeClass =
    exitCode !== 'n/a' && exitCode !== 0
      ? 'text-error-foreground'
      : 'text-muted-foreground';

  const hasOutput = showAggregated || hasStdout || hasStderr;
  const [isOpen, setIsOpen] = useState(true);

  return (
    <Cell>
      <div className="rounded-transcript border border-border/60 bg-card/60">
        <div className="flex items-start gap-1.5 px-1.5 py-1">
          <div className="min-w-0 flex-1 space-y-0.5">
            <div className="text-transcript-base text-foreground font-mono">
              $ {commandText}
            </div>
          </div>
          <div className="flex items-center gap-1 pl-1">
            {status !== 'running' ? (
              <div className={`text-xs shrink-0 ${exitCodeClass}`}>
                exit {exitCode}
              </div>
            ) : null}
            {hasOutput ? (
              <button
                type="button"
                className={cn(
                  'inline-flex size-4 items-center justify-center rounded-sm border border-transparent text-xs text-foreground/80 transition-colors',
                  'hover:bg-foreground/5 hover:text-foreground'
                )}
                aria-label={isOpen ? 'Hide output' : 'Show output'}
                aria-expanded={isOpen}
                onClick={() => setIsOpen((open) => !open)}
              >
                <svg viewBox="0 0 24 24" className="size-3">
                  <path
                    fill="none"
                    stroke="currentColor"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth="2"
                    d={
                      isOpen
                        ? 'm7 20 5-5 5 5M7 4l5 5 5-5'
                        : 'M7 10l5-5 5 5M7 14l5 5 5-5'
                    }
                  />
                </svg>
              </button>
            ) : null}
          </div>
        </div>
        {hasOutput && isOpen ? (
          <div className="border-t border-border/60 bg-background/40">
            <div className="overflow-x-auto whitespace-pre text-xs font-mono leading-transcript-code px-1.5 py-1.5">
              {showAggregated ? (
                <OutputSection
                  output={aggregatedOutput}
                  colorClass="text-muted-foreground"
                />
              ) : null}
              {!showAggregated && hasStdout ? (
                <OutputSection
                  output={cell.stdout ?? ''}
                  colorClass="text-muted-foreground"
                />
              ) : null}
              {!showAggregated && hasStderr ? (
                <OutputSection
                  output={cell.stderr ?? ''}
                  colorClass="text-error-foreground"
                />
              ) : null}
            </div>
          </div>
        ) : null}
      </div>
    </Cell>
  );
}
