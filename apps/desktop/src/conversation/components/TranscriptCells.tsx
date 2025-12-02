import {
  Cell,
  CellIcon,
  Errors,
  ExecutionResult,
  ExplorationCell,
  PlanUpdate,
  StatusEvents,
  TaskLifecycle,
  safeStringify,
} from '@pasture/transcript-ui';
import { memo } from 'react';
import type { TranscriptCell } from '~/conversation/transcript/types';
import { formatTimestampClock } from '~/lib/time';

import { AgentMessageContainer } from './AgentMessageContainer';
import { AgentReasoningContainer } from './AgentReasoningContainer';
import { ExecutionApprovalContainer } from './ExecutionApprovalContainer';
import { PatchesContainer } from './PatchesContainer';
import { Tools } from './Tools';
import { UserMessageContainer } from './UserMessageContainer';

type TranscriptCellsProps = {
  cell: TranscriptCell;
  conversationId: string;
  nthUserMessage?: number;
  onConversationForked?: (conversationId: string) => void;
};

const TranscriptCellsComponent = ({
  cell,
  conversationId,
  nthUserMessage,
  onConversationForked,
}: TranscriptCellsProps) => {
  const timestamp = formatTimestampClock(cell.timestamp);

  switch (cell.kind) {
    case 'session-configured':
      return <div />;
    case 'user-message':
      return (
        <UserMessageContainer
          cell={cell}
          conversationId={conversationId}
          nthUserMessage={nthUserMessage}
          onConversationForked={onConversationForked}
        />
      );
    case 'agent-message':
      return <AgentMessageContainer cell={cell} />;
    case 'agent-reasoning':
      return cell.visible ? <AgentReasoningContainer cell={cell} /> : null;
    case 'task':
      return <TaskLifecycle cell={cell} timestamp={timestamp} />;
    case 'exec-approval':
      return <ExecutionApprovalContainer cell={cell} />;
    case 'exec':
      return cell.exploration ? (
        <ExplorationCell cell={cell} timestamp={timestamp} />
      ) : (
        <ExecutionResult cell={cell} timestamp={timestamp} />
      );
    case 'tool':
      return <Tools cell={cell} timestamp={timestamp} />;
    case 'patch':
    case 'patch-approval':
      return <PatchesContainer cell={cell} />;
    case 'plan':
      return <PlanUpdate cell={cell} timestamp={timestamp} />;
    case 'status':
      return <StatusEvents cell={cell} timestamp={timestamp} />;
    case 'error':
      return <Errors cell={cell} timestamp={timestamp} />;
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
) => prev.cell === next.cell;

export const TranscriptCells = memo(TranscriptCellsComponent, areCellsEqual);
