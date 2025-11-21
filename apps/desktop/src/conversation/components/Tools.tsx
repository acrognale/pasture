import type { TranscriptToolCell } from '~/conversation/transcript/types';

import { Cell } from './Cell';
import { CellIcon } from './CellIcon';

type ToolsProps = {
  cell: TranscriptToolCell;
  timestamp: string;
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
        <div className="space-y-1">
          <div className="text-muted-foreground">
            {cell.path ?? '(unknown path)'}
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
