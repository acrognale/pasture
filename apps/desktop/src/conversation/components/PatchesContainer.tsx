import { Patches } from '@pasture/transcript-ui';
import type {
  TranscriptPatchApprovalCell,
  TranscriptPatchCell,
} from '@pasture/transcript-ui';
import { useApprovals } from '~/approvals/hooks/useApprovals';
import { useRespondToApproval } from '~/approvals/hooks/useRespondToApproval';

type PatchesContainerProps = {
  cell: TranscriptPatchCell | TranscriptPatchApprovalCell;
};

export function PatchesContainer({ cell }: PatchesContainerProps) {
  const approvals = useApprovals();
  const respondToApproval = useRespondToApproval();

  const isApprovalActive =
    cell.kind === 'patch-approval' &&
    approvals.activeRequest !== null &&
    approvals.activeRequest.kind === 'patch' &&
    approvals.activeRequest.eventId === cell.id;

  const handleApprove = () => {
    const request = approvals.activeRequest;
    if (!request) return;
    respondToApproval.mutate({ request, decision: 'approve' });
  };

  const handleReject = () => {
    const request = approvals.activeRequest;
    if (!request) return;
    respondToApproval.mutate({ request, decision: 'abort' });
  };

  return (
    <Patches
      cell={cell}
      isApprovalActive={isApprovalActive}
      queueSize={approvals.queueSize}
      isPending={respondToApproval.isPending}
      onApprove={handleApprove}
      onReject={handleReject}
    />
  );
}
