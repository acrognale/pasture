import { Cell, CellIcon, safeStringify } from '@pasture/transcript-ui';
import type { TranscriptToolCell } from '@pasture/transcript-ui';

type GrepFilesToolCallProps = {
  cell: TranscriptToolCell & { toolType: 'grep-files' };
};

const iconStatus = (status: TranscriptToolCell['status']) => {
  if (status === 'succeeded') return 'success';
  if (status === 'failed') return 'failure';
  return 'running';
};

export function GrepFilesToolCall({ cell }: GrepFilesToolCallProps) {
  const renderedResult =
    cell.result == null
      ? null
      : typeof cell.result === 'string'
        ? cell.result
        : safeStringify(cell.result);

  return (
    <Cell icon={<CellIcon status={iconStatus(cell.status)} />}>
      <div className="space-y-1.5">
        <div className="text-foreground font-medium">Grep files</div>
        {cell.path ? (
          <div className="text-xs text-muted-foreground break-all">
            {cell.path}
          </div>
        ) : null}
        {cell.query ? (
          <div className="text-xs text-muted-foreground">{cell.query}</div>
        ) : null}
        {cell.status !== 'running' && renderedResult ? (
          <pre className="text-xs text-muted-foreground overflow-x-auto leading-transcript whitespace-pre-wrap">
            {renderedResult}
          </pre>
        ) : null}
      </div>
    </Cell>
  );
}
