import { cn } from '../lib/utils';

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

const buttonBase =
  'inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-md text-sm font-medium transition-colors outline-none focus-visible:border-ring focus-visible:ring-ring/50 focus-visible:ring-[3px] disabled:pointer-events-none disabled:opacity-50 h-8 px-3';

const buttonVariants = {
  default: 'bg-primary text-primary-foreground hover:bg-primary/90',
  outline:
    'border border-input bg-background shadow-xs hover:bg-accent hover:text-accent-foreground',
  destructive:
    'bg-destructive text-destructive-foreground hover:bg-destructive/90 focus-visible:ring-destructive/20',
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
        <button
          type="button"
          className={cn(buttonBase, buttonVariants.default)}
          disabled={isPending}
          onClick={onApprove}
        >
          {messages.approveLabel}
        </button>
        {approvalType === 'exec' && onApproveForSession ? (
          <button
            type="button"
            className={cn(buttonBase, buttonVariants.outline)}
            disabled={isPending}
            onClick={onApproveForSession}
          >
            Approve for session
          </button>
        ) : null}
        <button
          type="button"
          className={cn(buttonBase, buttonVariants.destructive)}
          disabled={isPending}
          onClick={onReject}
        >
          Reject
        </button>
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
