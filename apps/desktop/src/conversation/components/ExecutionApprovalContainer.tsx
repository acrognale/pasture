import { ExecutionApproval } from '@pasture/transcript-ui';
import { useApprovals } from '~/approvals/hooks/useApprovals';
import { useRespondToApproval } from '~/approvals/hooks/useRespondToApproval';
import type { TranscriptExecApprovalCell } from '~/conversation/transcript/types';

type ExecutionApprovalContainerProps = {
  cell: TranscriptExecApprovalCell;
};

export function ExecutionApprovalContainer({
  cell,
}: ExecutionApprovalContainerProps) {
  const approvals = useApprovals();
  const respondToApproval = useRespondToApproval();

  const isApprovalActive =
    approvals.activeRequest !== null &&
    approvals.activeRequest.kind === 'exec' &&
    approvals.activeRequest.eventId === cell.id;

  const handleApprove = () => {
    const request = approvals.activeRequest;
    if (!request) return;
    respondToApproval.mutate({ request, decision: 'approve' });
  };

  const handleApproveForSession = () => {
    const request = approvals.activeRequest;
    if (!request) return;
    respondToApproval.mutate({ request, decision: 'approve_for_session' });
  };

  const handleReject = () => {
    const request = approvals.activeRequest;
    if (!request) return;
    respondToApproval.mutate({ request, decision: 'abort' });
  };

  return (
    <ExecutionApproval
      cell={cell}
      isApprovalActive={isApprovalActive}
      queueSize={approvals.queueSize}
      isPending={respondToApproval.isPending}
      onApprove={handleApprove}
      onApproveForSession={handleApproveForSession}
      onReject={handleReject}
    />
  );
}
