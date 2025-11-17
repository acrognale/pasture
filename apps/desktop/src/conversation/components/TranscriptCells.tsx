import { memo } from 'react';
import type { TranscriptCell } from '~/conversation/transcript/types';
import { formatTimestampClock } from '~/lib/time';
import { safeStringify } from '~/lib/utils';

import { AgentMessage } from './AgentMessage';
import { AgentReasoning } from './AgentReasoning';
import { Cell } from './Cell';
import { CellIcon } from './CellIcon';
import { Errors } from './Errors';
import { ExecutionApproval } from './ExecutionApproval';
import { ExecutionResult } from './ExecutionResult';
import { ExplorationCell } from './ExplorationCell';
import { Patches } from './Patches';
import { PlanUpdate } from './PlanUpdate';
import { StatusEvents } from './StatusEvents';
import { TaskLifecycle } from './TaskLifecycle';
import { Tools } from './Tools';
import { UserMessage } from './UserMessage';

type TranscriptCellsProps = {
  cell: TranscriptCell;
  index: number;
};

const TranscriptCellsComponent = ({ cell, index }: TranscriptCellsProps) => {
  const timestamp = formatTimestampClock(cell.timestamp);

  switch (cell.kind) {
    case 'session-configured':
      return <div />;
    case 'user-message':
      return <UserMessage cell={cell} index={index} timestamp={timestamp} />;
    case 'agent-message':
      return <AgentMessage cell={cell} index={index} timestamp={timestamp} />;
    case 'agent-reasoning':
      return cell.visible ? (
        <AgentReasoning cell={cell} index={index} timestamp={timestamp} />
      ) : null;
    case 'task':
      return <TaskLifecycle cell={cell} index={index} timestamp={timestamp} />;
    case 'exec-approval':
      return <ExecutionApproval cell={cell} />;
    case 'exec':
      return cell.exploration ? (
        <ExplorationCell cell={cell} index={index} timestamp={timestamp} />
      ) : (
        <ExecutionResult cell={cell} index={index} timestamp={timestamp} />
      );
    case 'tool':
      return <Tools cell={cell} index={index} timestamp={timestamp} />;
    case 'patch':
    case 'patch-approval':
      return <Patches cell={cell} />;
    case 'plan':
      return <PlanUpdate cell={cell} index={index} timestamp={timestamp} />;
    case 'status':
      return <StatusEvents cell={cell} index={index} timestamp={timestamp} />;
    case 'error':
      return <Errors cell={cell} index={index} timestamp={timestamp} />;
    case 'generic':
      return (
        <Cell icon={<CellIcon status="info" />}>
          <div className="space-y-1">
            <pre className="text-muted-foreground overflow-x-auto whitespace-pre-wrap leading-transcript">
              {safeStringify(cell.payload)}
            </pre>
          </div>
        </Cell>
      );
    default: {
      const unknownCell = cell as TranscriptCell;
      return (
        <div className="text-xs text-muted-foreground font-mono">
          Unknown cell kind {unknownCell.kind}
        </div>
      );
    }
  }
};

const areCellsEqual = (
  prev: TranscriptCellsProps,
  next: TranscriptCellsProps
) => prev.index === next.index && prev.cell === next.cell;

export const TranscriptCells = memo(TranscriptCellsComponent, areCellsEqual);
