import { cn } from '~/lib/utils';

export type StatusBadgeStatus = 'running' | 'succeeded' | 'failed' | 'pending';

type StatusBadgeProps = {
  status: StatusBadgeStatus;
  label?: string;
  className?: string;
};

const statusStyles: Record<StatusBadgeStatus, string> = {
  running: 'bg-info text-info-foreground border-info',
  succeeded: 'bg-success text-success-foreground border-success',
  failed: 'bg-error text-error-foreground border-error',
  pending: 'bg-muted text-muted-foreground border-muted-foreground/20',
};

const defaultLabels: Record<StatusBadgeStatus, string> = {
  running: 'Running',
  succeeded: 'Succeeded',
  failed: 'Failed',
  pending: 'Pending',
};

export function StatusBadge({ status, label, className }: StatusBadgeProps) {
  const resolvedLabel = label ?? defaultLabels[status];

  return (
    <span
      className={cn(
        'inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium border',
        statusStyles[status],
        className
      )}
    >
      {resolvedLabel}
    </span>
  );
}
