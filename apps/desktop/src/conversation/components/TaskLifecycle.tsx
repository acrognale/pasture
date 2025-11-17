import type { TranscriptTaskCell } from '~/conversation/transcript/types';
import { formatElapsedCompact } from '~/lib/time';

import { Cell } from './Cell';

type TaskLifecycleProps = {
  cell: TranscriptTaskCell;
  index: number;
  timestamp: string;
};

export function TaskLifecycle({ cell }: TaskLifecycleProps) {
  const isStarted = cell.status === 'started';

  const statusText = (() => {
    if (isStarted) {
      return 'Task started';
    }
    if (cell.startedAt) {
      const startTime = new Date(cell.startedAt).getTime();
      const endTime = new Date(cell.timestamp).getTime();
      const elapsedSeconds = Math.floor((endTime - startTime) / 1000);
      return `Worked for ${formatElapsedCompact(elapsedSeconds)}`;
    }
    return 'Task complete';
  })();

  const showExtendedInfo = !isStarted && !cell.startedAt;

  return (
    <Cell className="py-1 mt-[-16px]">
      <div className="space-y-1">
        <div className="text-muted-foreground text-xs">{statusText}</div>
        {showExtendedInfo ? (
          <>
            {cell.modelContextWindow ? (
              <div className="text-muted-foreground text-xs">
                context window: {cell.modelContextWindow}
              </div>
            ) : null}
            {cell.lastAgentMessage ? (
              <div className="text-muted-foreground whitespace-pre-wrap leading-transcript text-xs">
                {cell.lastAgentMessage}
              </div>
            ) : null}
          </>
        ) : null}
      </div>
    </Cell>
  );
}
