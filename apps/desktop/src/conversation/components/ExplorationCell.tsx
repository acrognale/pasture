import type {
  TranscriptExecCommandCell,
  TranscriptExplorationCall,
} from '~/conversation/transcript/types';

import { Cell } from './Cell';
import { CellIcon } from './CellIcon';

type ExplorationCellProps = {
  cell: TranscriptExecCommandCell;
  index: number;
  timestamp?: string;
};

const describeExplorationCall = (call: TranscriptExplorationCall): string[] => {
  const statusSuffix =
    call.status === 'running'
      ? ' (running)'
      : call.status === 'failed'
        ? ' (failed)'
        : '';

  if (call.parsed.length === 0) {
    const commandText = call.command.length
      ? call.command.join(' ')
      : '(command pending)';
    return [`Run ${commandText}${statusSuffix}`];
  }

  const allReads = call.parsed.every((entry) => entry.type === 'read');
  if (allReads) {
    const uniqueNames = Array.from(
      new Set(
        call.parsed
          .filter((entry) => entry.type === 'read')
          .map((entry) => entry.name)
      )
    );
    const label = uniqueNames.length > 0 ? uniqueNames.join(', ') : '(unknown)';
    return [`Read ${label}${statusSuffix}`];
  }

  const lines: string[] = [];
  call.parsed.forEach((entry, index) => {
    let text: string;
    switch (entry.type) {
      case 'read':
        text = `Read ${entry.name}`;
        break;
      case 'list_files':
        text = `List ${entry.path ?? entry.cmd}`;
        break;
      case 'search': {
        const query = entry.query ?? entry.cmd;
        const suffixPath = entry.path ? ` in ${entry.path}` : '';
        text = `Search ${query}${suffixPath}`;
        break;
      }
      default:
        text = `Run ${entry.cmd}`;
        break;
    }

    if (index === 0 && statusSuffix) {
      text += statusSuffix;
    }
    lines.push(text);
  });

  return lines;
};

export function ExplorationCell({ cell }: ExplorationCellProps) {
  const calls = cell.exploration?.calls ?? [];
  const iconStatus = calls.some((call) => call.status === 'running')
    ? 'running'
    : 'explore';

  if (calls.length === 0) {
    return (
      <Cell icon={<CellIcon status="explore" />}>
        <div className="text-transcript-base text-muted-foreground">
          Exploring
        </div>
      </Cell>
    );
  }

  return (
    <Cell icon={<CellIcon status={iconStatus} />}>
      <div className="space-y-1">
        {calls.map((call) => {
          const descriptions = describeExplorationCall(call);
          return descriptions.map((desc, index) => (
            <div
              key={`${call.callId}-${index}`}
              className={
                index === 0
                  ? 'text-transcript-base text-foreground'
                  : 'text-transcript-base text-muted-foreground pl-2'
              }
            >
              {desc}
            </div>
          ));
        })}
      </div>
    </Cell>
  );
}
