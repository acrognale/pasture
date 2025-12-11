import { Patches } from '@pasture/transcript-ui';
import type {
  TranscriptPatchApprovalCell,
  TranscriptPatchCell,
} from '@pasture/transcript-ui';
import { Code2 } from 'lucide-react';
import { useState } from 'react';
import { useApprovals } from '~/approvals/hooks/useApprovals';
import { useRespondToApproval } from '~/approvals/hooks/useRespondToApproval';
import { cn } from '~/lib/utils';

import {
  useConversationTranscript,
  useConversationTurnDiffByNumber,
} from '../store/hooks';
import { InlineTurnDiff } from './InlineTurnDiff';

type PatchesContainerProps = {
  cell: TranscriptPatchCell | TranscriptPatchApprovalCell;
  conversationId?: string;
  workspacePath?: string;
  turnId?: string;
  onRequestFeedback?: (prompt: string) => void;
};

export function PatchesContainer({
  cell,
  conversationId,
  workspacePath,
  turnId,
  onRequestFeedback,
}: PatchesContainerProps) {
  const [isInlineExpanded, setIsInlineExpanded] = useState(false);

  const approvals = useApprovals();
  const respondToApproval = useRespondToApproval();

  // Get turnNumber from turnOrder
  const transcript = useConversationTranscript(conversationId ?? null);
  const turnNumber = turnId
    ? transcript?.turnOrder.indexOf(turnId) + 1
    : undefined;

  // Get the turn diff for this turn
  const turnDiff = useConversationTurnDiffByNumber(
    conversationId ?? null,
    turnNumber ?? 0
  );

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

  // Only show inline expansion for applied patches (not approvals)
  // and only when we have the necessary context
  const canShowInlineExpansion =
    cell.kind === 'patch' &&
    cell.status === 'succeeded' &&
    conversationId &&
    workspacePath &&
    turnId &&
    turnDiff?.unifiedDiff;

  return (
    <div>
      <Patches
        cell={cell}
        isApprovalActive={isApprovalActive}
        queueSize={approvals.queueSize}
        isPending={respondToApproval.isPending}
        onApprove={handleApprove}
        onReject={handleReject}
      />

      {canShowInlineExpansion && (
        <>
          <button
            type="button"
            className={cn(
              'mt-1.5 flex items-center gap-1.5 rounded-md px-2 py-1 text-xs transition-colors',
              'text-muted-foreground hover:bg-muted/50 hover:text-foreground',
              isInlineExpanded && 'bg-muted/40 text-foreground'
            )}
            onClick={() => setIsInlineExpanded((prev) => !prev)}
          >
            <Code2 className="h-3 w-3" />
            <span>{isInlineExpanded ? 'Hide review' : 'Review changes'}</span>
          </button>

          <InlineTurnDiff
            conversationId={conversationId}
            turnNumber={turnNumber!}
            workspacePath={workspacePath}
            unifiedDiff={turnDiff.unifiedDiff}
            isExpanded={isInlineExpanded}
            onRequestFeedback={onRequestFeedback}
            onClose={() => setIsInlineExpanded(false)}
          />
        </>
      )}
    </div>
  );
}
