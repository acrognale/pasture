import { cn } from '../lib/utils';
import type { TranscriptToolCell } from '../types';
import { Cell } from './Cell';
import { Markdown } from './Markdown';

type ReadThreadResultProps = {
  cell: TranscriptToolCell;
};

const StatusBadge = ({ status }: { status: TranscriptToolCell['status'] }) => {
  const isSuccess = status === 'succeeded';
  const isRunning = status === 'running';
  const color = isRunning
    ? 'text-info-foreground'
    : isSuccess
      ? 'text-success-foreground'
      : 'text-error-foreground';
  const label = isRunning ? 'Running' : isSuccess ? 'Succeeded' : 'Failed';

  return (
    <span
      className={cn(
        'inline-flex items-center gap-1 rounded-full bg-card/70 px-2 py-0.5 text-xs font-medium',
        color
      )}
    >
      <span
        className={cn(
          'inline-block size-1.5 rounded-full',
          isRunning
            ? 'bg-info-foreground'
            : isSuccess
              ? 'bg-success-foreground'
              : 'bg-error-foreground'
        )}
      />
      {label}
    </span>
  );
};

export function ReadThreadResult({ cell }: ReadThreadResultProps) {
  const summary =
    typeof cell.result === 'string'
      ? cell.result
      : cell.result
        ? JSON.stringify(cell.result, null, 2)
        : '';

  const instructions =
    typeof cell.query === 'string' ? cell.query.trim() : undefined;
  const threadRef =
    typeof cell.path === 'string' && cell.path.trim().length > 0
      ? cell.path
      : null;

  return (
    <Cell>
      <div className="rounded-transcript border border-border/60 bg-card/60">
        <div className="flex items-start gap-1.5 px-1.5 py-1">
          <div className="min-w-0 flex-1 space-y-0.5">
            <div className="inline-flex min-w-0 items-center gap-1 text-transcript-base text-foreground">
              <span className="font-semibold">Read Thread</span>
              {threadRef ? (
                <span className="text-xs text-muted-foreground">
                  ({threadRef})
                </span>
              ) : null}
            </div>
            {instructions ? (
              <div className="text-xs text-muted-foreground line-clamp-2">
                {instructions}
              </div>
            ) : null}
          </div>
          <div className="flex items-center">
            <StatusBadge status={cell.status} />
          </div>
        </div>

        {summary ? (
          <div className="border-t border-border/60 bg-background/40 px-1.5 py-1.5">
            <Markdown className="prose prose-invert max-w-none text-transcript-base text-foreground prose-p:my-1 prose-ul:my-1 prose-li:my-0.5 prose-pre:bg-muted/40">
              {summary}
            </Markdown>
          </div>
        ) : (
          <div className="border-t border-border/60 bg-background/40 px-1.5 py-1.5">
            <div className="text-xs text-muted-foreground">
              No summary returned.
            </div>
          </div>
        )}
      </div>
    </Cell>
  );
}
