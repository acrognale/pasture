import type { TranscriptExecApprovalCell } from '../types';
import { ApprovalActions } from './ApprovalActions';
import { Cell } from './Cell';

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
    <Cell>
      <div className="space-y-2">
        <div className="text-warning-foreground whitespace-pre-wrap leading-transcript">
          {cell.reason ?? 'The agent wants to execute a command.'}
        </div>
        <div className="rounded-transcript border border-border/60 bg-card/60">
          <div className="px-1.5 py-1 space-y-0.5">
            <div className="text-transcript-base text-foreground font-mono">
              $ {commandText}
            </div>
            {cell.cwd ? (
              <div className="text-xs text-muted-foreground">
                cwd: {cell.cwd}
              </div>
            ) : null}
          </div>
        </div>
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
