import { cn } from '~/lib/utils';

export type DiffModeToggleProps = {
  label: string;
  active: boolean;
  onClick: () => void;
};

export function DiffModeToggle({
  label,
  active,
  onClick,
}: DiffModeToggleProps) {
  return (
    <button
      type="button"
      className={cn(
        'rounded-md px-3 py-1 text-xs font-medium transition-colors',
        active
          ? 'bg-background text-foreground shadow-sm'
          : 'text-muted-foreground hover:text-foreground'
      )}
      onClick={onClick}
    >
      {label}
    </button>
  );
}
