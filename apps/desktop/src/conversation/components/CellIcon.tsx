import { cn } from '~/lib/utils';

export type CellIconStatus =
  | 'success'
  | 'failure'
  | 'warning'
  | 'info'
  | 'running'
  | 'pending'
  | 'in-progress'
  | 'user'
  | 'agent'
  | 'explore';

type CellIconProps = {
  status: CellIconStatus;
  className?: string;
};

const statusColorMap: Record<CellIconStatus, string> = {
  success: 'text-muted-foreground',
  failure: 'text-error-foreground',
  warning: 'text-warning-foreground',
  info: 'text-muted-foreground',
  running: 'text-muted-foreground',
  pending: 'text-muted-foreground/50',
  'in-progress': 'text-muted-foreground',
  user: 'text-muted-foreground',
  agent: 'text-muted-foreground',
  explore: 'text-muted-foreground',
};

const statusSymbolMap: Record<CellIconStatus, string> = {
  success: '✓',
  failure: '✗',
  warning: '⚠',
  info: '',
  running: '⋯',
  pending: '□',
  'in-progress': '◉',
  user: '',
  agent: '',
  explore: '',
};

const statusSizeMap: Partial<Record<CellIconStatus, string>> = {
  success: 'text-sm',
  failure: 'text-sm',
  warning: 'text-sm',
  info: 'text-sm',
  running: 'text-sm',
  pending: 'text-base',
  'in-progress': 'text-xs',
  explore: 'text-sm',
};

export function CellIcon({ status, className }: CellIconProps) {
  const colorClass = statusColorMap[status];
  const symbol = statusSymbolMap[status];
  const sizeClass = statusSizeMap[status] ?? 'text-sm';

  if (!symbol) {
    return null;
  }

  return (
    <span className={cn('leading-none', sizeClass, colorClass, className)}>
      {symbol}
    </span>
  );
}
