import type { TranscriptErrorCell } from '~/conversation/transcript/types';

import { Cell } from './Cell';
import { CellIcon } from './CellIcon';

type ErrorsProps = {
  cell: TranscriptErrorCell;
  timestamp: string;
};

export function Errors({ cell }: ErrorsProps) {
  const iconStatus = cell.severity === 'stream' ? 'warning' : 'failure';

  return (
    <Cell icon={<CellIcon status={iconStatus} />}>
      <div className="space-y-1">
        <div className="text-error-foreground whitespace-pre-wrap leading-transcript">
          {cell.message}
        </div>
      </div>
    </Cell>
  );
}
