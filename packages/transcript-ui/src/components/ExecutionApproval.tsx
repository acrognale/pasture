import type { TranscriptExecApprovalCell } from '../types';
import { ApprovalActions } from './ApprovalActions';
import { Cell } from './Cell';
import { CellIcon } from './CellIcon';

type ExecutionApprovalProps = {
  cell: TranscriptExecApprovalCell;
  /** Whether this approval is currently active */
  isApprovalActive?: boolean;
  /** Number of approvals in the queue */
  queueSize?: number;
  /** Whether a response is pending */
  isPending?: boolean;
  /** Callback when user approves */
  onApprove?: () => void;
  /** Callback when user approves for session */
  onApproveForSession?: () => void;
  /** Callback when user rejects */
  onReject?: () => void;
};

export function ExecutionApproval({
  cell,
  isApprovalActive = false,
  queueSize = 0,
  isPending = false,
  onApprove,
  onApproveForSession,
  onReject,
}: ExecutionApprovalProps) {
  const commandText = cell.command.length
    ? cell.command.join(' ')
    : '(command pending)';

  return (
    <Cell icon={<CellIcon status="warning" />}>
      <div className="space-y-2">
        <div className="text-foreground">$ {commandText}</div>
        {cell.cwd ? (
          <div className="text-xs text-muted-foreground pl-2">
            cwd: {cell.cwd}
          </div>
        ) : null}
        {cell.reason ? (
          <div className="text-warning-foreground whitespace-pre-wrap leading-transcript">
            {cell.reason}
          </div>
        ) : null}
        <ApprovalActions
          decision={cell.decision}
          approvalType="exec"
          isActive={isApprovalActive}
          queueSize={queueSize}
          isPending={isPending}
          onApprove={onApprove ?? (() => {})}
          onApproveForSession={onApproveForSession ?? (() => {})}
          onReject={onReject ?? (() => {})}
        />
      </div>
    </Cell>
  );
}
