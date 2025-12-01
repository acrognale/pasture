import type {
  SharedTranscriptCell,
  SharedTranscriptTurnStatus,
} from '@/types/sharedTranscript';

type TranscriptCellsProps = {
  cell: SharedTranscriptCell;
  turnStatus?: SharedTranscriptTurnStatus;
};

const bubbleBase =
  'rounded-xl px-4 py-3 shadow-sm border border-slate-200 bg-white text-slate-900';
const agentBubble =
  'bg-slate-900 text-white border-slate-800 shadow-md shadow-slate-900/20';
const metaText = 'text-xs text-slate-500';

export function TranscriptCells({ cell, turnStatus }: TranscriptCellsProps) {
  const timestamp =
    cell.timestamp && !Number.isNaN(Date.parse(cell.timestamp))
      ? new Date(cell.timestamp).toLocaleString()
      : null;

  const renderHeading = (label: string) => (
    <div className="text-xs font-semibold uppercase tracking-wide text-slate-500">
      {label}
    </div>
  );

  switch (cell.kind) {
    case 'user-message':
      return (
        <div className="flex flex-col gap-2 items-start">
          {renderHeading('User')}
          <div className={bubbleBase}>
            <p className="text-sm leading-relaxed whitespace-pre-wrap">
              {cell.message}
            </p>
          </div>
          <Meta timestamp={timestamp} turnStatus={turnStatus} />
        </div>
      );

    case 'agent-message':
      return (
        <div className="flex flex-col gap-2 items-end">
          {renderHeading('Pasture')}
          <div className={`${bubbleBase} ${agentBubble}`}>
            <p className="text-sm leading-relaxed whitespace-pre-wrap">
              {cell.message}
            </p>
          </div>
          <Meta align="end" timestamp={timestamp} turnStatus={turnStatus} />
        </div>
      );

    case 'agent-reasoning':
      return (
        <div className="flex flex-col gap-1">
          {renderHeading('Reasoning')}
          <div className="rounded-lg border border-dashed border-slate-300 bg-slate-50 px-4 py-3">
            <pre className="whitespace-pre-wrap text-sm leading-relaxed text-slate-700">
              {cell.text}
            </pre>
          </div>
          <Meta timestamp={timestamp} turnStatus={turnStatus} />
        </div>
      );

    case 'status':
      return (
        <div className="flex flex-col gap-1">
          {renderHeading('Status')}
          <div className="text-sm text-slate-600 whitespace-pre-wrap">
            {cell.summary ?? cell.message ?? cell.kind}
          </div>
          <Meta timestamp={timestamp} turnStatus={turnStatus} />
        </div>
      );

    case 'error':
      return (
        <div className="flex flex-col gap-1">
          {renderHeading('Error')}
          <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800 whitespace-pre-wrap">
            {cell.message ?? 'An error occurred'}
          </div>
          <Meta timestamp={timestamp} turnStatus={turnStatus} />
        </div>
      );

    default:
      return (
        <div className="flex flex-col gap-1">
          {renderHeading(cell.kind)}
          <pre className="rounded-lg border border-slate-200 bg-slate-50 px-4 py-3 text-xs text-slate-700 overflow-x-auto whitespace-pre-wrap">
            {JSON.stringify(cell, null, 2)}
          </pre>
          <Meta timestamp={timestamp} turnStatus={turnStatus} />
        </div>
      );
  }
}

function Meta({
  timestamp,
  turnStatus,
  align = 'start',
}: {
  timestamp: string | null;
  turnStatus?: SharedTranscriptTurnStatus;
  align?: 'start' | 'end';
}) {
  if (!timestamp && !turnStatus) {
    return null;
  }
  return (
    <div className={`${metaText} ${align === 'end' ? 'text-right' : ''}`}>
      <span>
        {timestamp ?? ''} {turnStatus ? `• ${turnStatus}` : ''}
      </span>
    </div>
  );
}
