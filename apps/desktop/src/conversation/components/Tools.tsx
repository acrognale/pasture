import { Cell, CellIcon, ImagePreview } from '@pasture/transcript-ui';
import type { TranscriptToolCell } from '@pasture/transcript-ui';
import { SearchIcon } from 'lucide-react';

type ToolsProps = {
  cell: TranscriptToolCell;
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
