import { formatTimestampClock } from '@pasture/transcript-ui';
import {
  AgentMessage,
  AgentReasoning,
  Errors,
  ExecutionApproval,
  ExecutionResult,
  ExplorationCell,
  Patches,
  PlanUpdate,
  StatusEvents,
  TaskLifecycle,
  type TranscriptCell,
  type TranscriptPatchApprovalCell,
  type TranscriptPatchCell,
} from '@pasture/transcript-ui';

// Minimal renderer for the web view. This mirrors the desktop mapping but keeps
// side-effects (approvals, retries, etc.) out of the web transcript share view.
export function renderTranscriptCell(cell: TranscriptCell) {
  const timestamp = cell.timestamp ? formatTimestampClock(cell.timestamp) : undefined;

  switch (cell.kind) {
    case 'user-message':
      // Web share: show the text only; no actions
      return (
        <AgentMessage
          cell={{
            ...cell,
            kind: 'agent-message',
            message: cell.message,
            streaming: false,
          }}
          timestamp={timestamp}
        />
      );
    case 'agent-message':
      return <AgentMessage cell={cell} timestamp={timestamp} />;
    case 'agent-reasoning':
      return cell.visible ? (
        <AgentReasoning cell={cell} timestamp={timestamp} />
      ) : null;
    case 'task':
      return <TaskLifecycle cell={cell} timestamp={timestamp} />;
    case 'exec-approval':
      return <ExecutionApproval cell={cell} />;
    case 'exec':
      return cell.exploration ? (
        <ExplorationCell cell={cell} timestamp={timestamp} />
      ) : (
        <ExecutionResult cell={cell} timestamp={timestamp} />
      );
    case 'tool':
      // Tools are rendered as generic exec results for now
      return (
        <ExecutionResult
          cell={{
            ...cell,
            command: cell.query ? [cell.query] : [],
            stdout: typeof cell.result === 'string' ? cell.result : JSON.stringify(cell.result, null, 2),
            stderr: '',
            aggregatedOutput: '',
          } as any}
          timestamp={timestamp}
        />
      );
    case 'patch':
    case 'patch-approval':
      return <Patches cell={cell as TranscriptPatchCell | TranscriptPatchApprovalCell} />;
    case 'plan':
      return <PlanUpdate cell={cell} timestamp={timestamp} />;
    case 'status':
      return <StatusEvents cell={cell} timestamp={timestamp} />;
    case 'error':
      return <Errors cell={cell} timestamp={timestamp} />;
    case 'generic':
      return <ExecutionResult cell={{ ...cell, command: [], stdout: '', stderr: '', aggregatedOutput: '' } as any} timestamp={timestamp} />;
    default:
      return null;
  }
}
