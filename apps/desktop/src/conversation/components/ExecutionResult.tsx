import { useMemo } from 'react';
import type { TranscriptExecCommandCell } from '~/conversation/transcript/types';

import { splitLines } from '../transcript-utils';
import { Cell } from './Cell';
import { CellIcon } from './CellIcon';

type ExecutionResultProps = {
  cell: TranscriptExecCommandCell;
  timestamp?: string;
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
    <pre className="text-xs overflow-x-auto leading-transcript whitespace-pre-wrap">
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
    </pre>
  );
};

export function ExecutionResult({ cell }: ExecutionResultProps) {
  const status = cell.status;
  const hasStdout = cell.stdout.trim().length > 0;
  const hasStderr = cell.stderr.trim().length > 0;
  const showAggregated =
    cell.streaming &&
    cell.aggregatedOutput.trim().length > 0 &&
    !hasStdout &&
    !hasStderr;

  const commandText = cell.command.length
    ? cell.command.join(' ')
    : '(command pending)';

  const getIconStatus = () => {
    if (status === 'succeeded') return 'success';
    if (status === 'failed') return 'failure';
    return 'running';
  };

  const exitCode = cell.exitCode ?? 'n/a';
  const exitCodeClass =
    exitCode !== 'n/a' && exitCode !== 0
      ? 'text-error-foreground'
      : 'text-muted-foreground';

  return (
    <Cell icon={<CellIcon status={getIconStatus()} />}>
      <div className="space-y-1.5">
        <div className="text-muted-foreground whitespace-pre-wrap">
          $ {commandText}
        </div>
        {showAggregated ? (
          <OutputSection
            output={cell.aggregatedOutput}
            colorClass="text-muted-foreground"
          />
        ) : null}
        {hasStdout ? (
          <OutputSection
            output={cell.stdout}
            colorClass="text-muted-foreground"
          />
        ) : null}
        {hasStderr ? (
          <OutputSection
            output={cell.stderr}
            colorClass="text-error-foreground"
          />
        ) : null}
        {status !== 'running' ? (
          <div className={`text-xs pl-2 ${exitCodeClass}`}>exit {exitCode}</div>
        ) : null}
      </div>
    </Cell>
  );
}
