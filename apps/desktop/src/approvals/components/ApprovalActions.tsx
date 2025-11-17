import { Button } from '~/components/ui/button';

export type ApprovalDecision =
  | 'pending'
  | 'approved'
  | 'approved_for_session'
  | 'rejected';

export type ApprovalType = 'exec' | 'patch';

type ApprovalActionsProps = {
  decision: ApprovalDecision;
  approvalType: ApprovalType;
  isActive: boolean;
  queueSize: number;
  isPending: boolean;
  onApprove: () => void;
  onApproveForSession?: () => void;
  onReject: () => void;
};

const approvalMessages: Record<
  ApprovalType,
  {
    approveLabel: string;
    approvedLabel: string;
    approvedForSessionLabel?: string;
    rejectedLabel: string;
    approvedDescription: string;
    approvedForSessionDescription?: string;
  }
> = {
  exec: {
    approveLabel: 'Run command',
    approvedLabel: 'Command approved',
    approvedForSessionLabel: 'Command approved for this session',
    rejectedLabel: 'Command rejected',
    approvedDescription: 'Codex will continue with this command.',
    approvedForSessionDescription:
      'Future commands in this session can run without prompting.',
  },
  patch: {
    approveLabel: 'Apply edits',
    approvedLabel: 'Edits approved',
    rejectedLabel: 'Edit request rejected',
    approvedDescription: 'Codex will apply these changes.',
  },
};

export function ApprovalActions({
  decision,
  approvalType,
  isActive,
  queueSize,
  isPending,
  onApprove,
  onApproveForSession,
  onReject,
}: ApprovalActionsProps) {
  const messages = approvalMessages[approvalType];

  if (decision !== 'pending') {
    const status =
      decision === 'approved'
        ? {
            label: messages.approvedLabel,
            className: 'text-success-foreground',
            description: messages.approvedDescription,
          }
        : decision === 'approved_for_session'
          ? {
              label: messages.approvedForSessionLabel ?? messages.approvedLabel,
              className: 'text-success-foreground',
              description:
                messages.approvedForSessionDescription ??
                messages.approvedDescription,
            }
          : decision === 'rejected'
            ? {
                label: messages.rejectedLabel,
                className: 'text-error-foreground',
                description: null,
              }
            : null;

    return (
      <div className="flex flex-col gap-1 text-xs">
        <span className={status?.className}>{status?.label}</span>
        {status?.description && (
          <span className="text-muted-foreground">{status.description}</span>
        )}
      </div>
    );
  }

  if (isActive) {
    const remaining = Math.max(queueSize - 1, 0);
    return (
      <div className="flex flex-wrap items-center gap-2">
        <Button
          type="button"
          variant="default"
          size="sm"
          disabled={isPending}
          onClick={onApprove}
        >
          {messages.approveLabel}
        </Button>
        {approvalType === 'exec' && onApproveForSession ? (
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={isPending}
            onClick={onApproveForSession}
          >
            Approve for session
          </Button>
        ) : null}
        <Button
          type="button"
          variant="destructive"
          size="sm"
          disabled={isPending}
          onClick={onReject}
        >
          Reject
        </Button>
        {remaining > 0 ? (
          <span className="text-xs text-muted-foreground">
            {remaining} more queued
          </span>
        ) : null}
      </div>
    );
  }

  if (queueSize > 0) {
    return (
      <div className="text-xs text-muted-foreground">
        Resolve the earlier approval request to continue.
      </div>
    );
  }

  return (
    <div className="text-xs text-muted-foreground">
      Awaiting Codex response.
    </div>
  );
}
