import { ApprovalActions } from '~/approvals/components/ApprovalActions';
import { useApprovals } from '~/approvals/hooks/useApprovals';
import { useRespondToApproval } from '~/approvals/hooks/useRespondToApproval';
import type { TranscriptExecApprovalCell } from '~/conversation/transcript/types';

import { Cell } from './Cell';
import { CellIcon } from './CellIcon';

type ExecutionApprovalProps = {
  cell: TranscriptExecApprovalCell;
};

export function ExecutionApproval({ cell }: ExecutionApprovalProps) {
  const approvals = useApprovals();
  const respondToApproval = useRespondToApproval();

  const isCurrentApprovalActive =
    approvals.activeRequest !== null &&
    approvals.activeRequest.kind === 'exec' &&
    approvals.activeRequest.turnId === cell.id;

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
          isActive={isCurrentApprovalActive}
          queueSize={approvals.queueSize}
          isPending={respondToApproval.isPending}
          onApprove={() => {
            const request = approvals.activeRequest;
            if (!request) return;
            respondToApproval.mutate({ request, decision: 'approve' });
          }}
          onApproveForSession={() => {
            const request = approvals.activeRequest;
            if (!request) return;
            respondToApproval.mutate({
              request,
              decision: 'approve_for_session',
            });
          }}
          onReject={() => {
            const request = approvals.activeRequest;
            if (!request) return;
            respondToApproval.mutate({ request, decision: 'abort' });
          }}
        />
      </div>
    </Cell>
  );
}
