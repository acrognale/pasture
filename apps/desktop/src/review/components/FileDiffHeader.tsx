import { cn } from '~/lib/utils';

export type FileDiffHeaderProps = {
  filePath: string;
  isCollapsed: boolean;
  onToggleCollapse: () => void;
};

export function FileDiffHeader({
  filePath,
  isCollapsed,
  onToggleCollapse,
}: FileDiffHeaderProps) {
  return (
    <button
      type="button"
      className="flex w-full items-center gap-2 bg-muted/40 px-4 py-2 text-left text-xs font-semibold text-muted-foreground transition-colors hover:bg-muted/60"
      onClick={onToggleCollapse}
    >
      <svg
        className={cn(
          'h-3 w-3 flex-shrink-0 transition-transform',
          isCollapsed ? '-rotate-90' : ''
        )}
        fill="none"
        stroke="currentColor"
        viewBox="0 0 24 24"
      >
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth="2"
          d="M19 9l-7 7-7-7"
        />
      </svg>
      <span>{filePath}</span>
    </button>
  );
}
