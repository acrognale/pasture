import { Cell, CellIcon, ImagePreview } from '@pasture/transcript-ui';
import type { TranscriptToolCell } from '@pasture/transcript-ui';
import { SearchIcon } from 'lucide-react';
import { useState } from 'react';

type ToolsProps = {
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
      className={`inline-flex items-center gap-1 rounded-full bg-card/70 px-2 py-0.5 text-xs font-medium ${color}`}
    >
      <span
        className={`inline-block size-1.5 rounded-full ${
          isRunning
            ? 'bg-info-foreground'
            : isSuccess
              ? 'bg-success-foreground'
              : 'bg-error-foreground'
        }`}
      />
      {label}
    </span>
  );
};

const formatResult = (value: unknown) => {
  if (value == null) {
    return null;
  }

  if (typeof value === 'string') {
    return value;
  }

  if (typeof value === 'number' || typeof value === 'boolean') {
    return String(value);
  }

  try {
    return JSON.stringify(value, null, 2);
  } catch (error) {
    console.error('Failed to stringify tool result', error);
    return '[unserializable result]';
  }
};

export function Tools({ cell }: ToolsProps) {
  const [isThreadOpen, setIsThreadOpen] = useState(
    cell.toolType === 'read-thread'
  );

  const getIconStatus = () => {
    if (cell.status === 'succeeded') return 'success';
    if (cell.status === 'failed') return 'failure';
    return 'running';
  };

  if (cell.toolType === 'mcp') {
    return (
      <Cell icon={<CellIcon status={getIconStatus()} />}>
        <div className="space-y-1.5">
          <div className="text-muted-foreground">
            {cell.invocation
              ? `${cell.invocation.server}.${cell.invocation.tool}`
              : 'MCP tool call'}
          </div>
          {cell.status !== 'running' ? (
            <div className="text-muted-foreground">
              status: {cell.status}
              {cell.duration ? ` • ${cell.duration}` : ''}
            </div>
          ) : null}
          {cell.invocation?.arguments ? (
            <pre className="text-xs text-muted-foreground overflow-x-auto leading-transcript whitespace-pre-wrap">
              {formatResult(cell.invocation.arguments)}
            </pre>
          ) : null}
          {cell.result ? (
            <pre className="text-xs text-muted-foreground overflow-x-auto leading-transcript whitespace-pre-wrap">
              {formatResult(cell.result)}
            </pre>
          ) : null}
        </div>
      </Cell>
    );
  }

  if (cell.toolType === 'view-image') {
    return (
      <Cell icon={<CellIcon status={getIconStatus()} />}>
        {cell.path ? (
          <div className="space-y-1">
            <div className="text-xs text-muted-foreground">View image tool</div>
            <ImagePreview path={cell.path} alt="View image tool output" />
            <div className="text-xs text-muted-foreground truncate max-w-[260px]">
              {cell.path}
            </div>
          </div>
        ) : (
          <div className="text-muted-foreground text-xs">
            (unknown image path)
          </div>
        )}
      </Cell>
    );
  }

  if (cell.toolType === 'web-search') {
    return (
      <Cell icon={<SearchIcon className="size-4 mb-0.5" />}>
        <div className="space-y-1.5">
          <div className="text-muted-foreground italic">
            Searching the web for "{cell.query}"{' '}
            {cell.status === 'running' ? '...' : '(done)'}
          </div>
        </div>
      </Cell>
    );
  }

  if (cell.toolType === 'read-thread') {
    const instructions =
      typeof cell.query === 'string' ? cell.query.trim() : undefined;
    const threadRef =
      typeof cell.path === 'string' && cell.path.trim().length > 0
        ? cell.path
        : null;
    const summary = formatResult(cell.result);
    const hasSummary = summary != null && summary.length > 0;

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
            <div className="flex items-center gap-1 pl-1">
              <StatusBadge status={cell.status} />
              {hasSummary ? (
                <button
                  type="button"
                  className="inline-flex size-4 items-center justify-center rounded-sm border border-transparent text-xs text-foreground/80 transition-colors hover:bg-foreground/5 hover:text-foreground"
                  aria-label={isThreadOpen ? 'Hide details' : 'Show details'}
                  aria-expanded={isThreadOpen}
                  onClick={() => setIsThreadOpen((open) => !open)}
                >
                  <svg viewBox="0 0 24 24" className="size-3">
                    <path
                      fill="none"
                      stroke="currentColor"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth="2"
                      d={
                        isThreadOpen
                          ? 'm7 20 5-5 5 5M7 4l5 5 5-5'
                          : 'M7 10l5-5 5 5M7 14l5 5 5-5'
                      }
                    />
                  </svg>
                </button>
              ) : null}
            </div>
          </div>

          {hasSummary && isThreadOpen ? (
            <div className="border-t border-border/60 bg-background/40 px-1.5 py-1.5">
              <pre className="text-xs text-foreground overflow-x-auto leading-transcript whitespace-pre-wrap">
                {summary}
              </pre>
            </div>
          ) : null}
          {!hasSummary && isThreadOpen ? (
            <div className="border-t border-border/60 bg-background/40 px-1.5 py-1.5">
              <div className="text-xs text-muted-foreground">
                No summary returned.
              </div>
            </div>
          ) : null}
        </div>
      </Cell>
    );
  }

  return (
    <Cell icon={<CellIcon status={getIconStatus()} />}>
      <div className="space-y-1.5">
        {cell.query ? (
          <div className="text-muted-foreground">query: "{cell.query}"</div>
        ) : null}
        {cell.status !== 'running' && cell.result ? (
          <pre className="text-xs text-muted-foreground overflow-x-auto leading-transcript whitespace-pre-wrap">
            {formatResult(cell.result)}
          </pre>
        ) : null}
      </div>
    </Cell>
  );
}
