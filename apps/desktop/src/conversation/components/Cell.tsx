import type { ReactNode } from 'react';
import { cn } from '~/lib/utils';

const cellBase =
  'w-full px-1.5 py-2 font-transcript leading-transcript text-transcript-base text-foreground';

type CellProps = {
  icon?: ReactNode;
  className?: string;
  children?: ReactNode;
};

export function Cell({ icon, className, children }: CellProps) {
  return (
    <div className={cn(cellBase, 'flex gap-2 text-left', className)}>
      {/* Icon column - only render if icon provided */}
      {icon ? (
        <div className="w-5 shrink-0">
          <div className="mb-1 mt-1 flex h-3.5 w-3.5 items-center justify-center">
            {icon}
          </div>
        </div>
      ) : null}

      {/* Content column */}
      <div className="min-w-0 flex-1 pb-1.5">{children}</div>
    </div>
  );
}
