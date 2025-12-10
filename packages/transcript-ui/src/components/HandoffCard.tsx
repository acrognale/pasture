import type { TranscriptHandoffCell } from '../types';
import { Cell } from './Cell';

type HandoffCardProps = {
  cell: TranscriptHandoffCell;
};

export function HandoffCard({ cell }: HandoffCardProps) {
  const { title, goal, preview } = cell;

  const summary = goal && goal.trim().length > 0 ? goal : (preview ?? '');

  return (
    <Cell>
      <div className="rounded-transcript border border-border/60 bg-card/60 px-1.5 py-1.5 space-y-1">
        <div className="text-xs font-semibold text-muted-foreground">
          Handoff to new thread
        </div>
        {title ? (
          <div className="text-sm font-medium text-foreground truncate">
            {title}
          </div>
        ) : null}
        {summary ? (
          <div className="text-xs text-muted-foreground whitespace-pre-wrap leading-transcript">
            {summary}
          </div>
        ) : null}
      </div>
    </Cell>
  );
}
