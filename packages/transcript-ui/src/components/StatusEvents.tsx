import type { TranscriptStatusCell } from '../types';
import { Cell } from './Cell';
import { CellIcon } from './CellIcon';

type StatusEventsProps = {
  cell: TranscriptStatusCell;
  timestamp?: string;
};

/**
 * Token usage information from a token count event
 */
type TokenUsage = {
  input_tokens: number;
  output_tokens: number;
  total_tokens: number;
};

/**
 * Extract token usage from cell data if available
 */
const getTokenUsage = (data: unknown): TokenUsage | null => {
  if (!data || typeof data !== 'object') {
    return null;
  }
  const info = (data as { info?: { total_token_usage?: TokenUsage } }).info;
  return info?.total_token_usage ?? null;
};

/**
 * Extract reason from turn aborted event data
 */
const getTurnAbortedReason = (data: unknown): string | null => {
  if (!data || typeof data !== 'object') {
    return null;
  }
  return (data as { reason?: string }).reason ?? null;
};

/**
 * Extract message from background event data
 */
const getBackgroundMessage = (data: unknown): string | null => {
  if (!data || typeof data !== 'object') {
    return null;
  }
  return (data as { message?: string }).message ?? null;
};

export function StatusEvents({ cell }: StatusEventsProps) {
  const iconStatus = cell.statusType === 'turn-aborted' ? 'warning' : 'info';

  return (
    <Cell icon={<CellIcon status={iconStatus} />}>
      {cell.statusType === 'token-count' ? (
        <TokenCountContent cell={cell} />
      ) : cell.statusType === 'turn-aborted' ? (
        <TurnAbortedContent cell={cell} />
      ) : (
        <BackgroundContent cell={cell} />
      )}
    </Cell>
  );
}

const TokenCountContent = ({ cell }: { cell: TranscriptStatusCell }) => {
  const usage = getTokenUsage(cell.data);

  if (!usage) {
    return <div className="text-muted-foreground">{cell.summary}</div>;
  }

  return (
    <div className="space-y-0.5 text-sm">
      <div className="text-info-foreground">
        prompt: {usage.input_tokens.toLocaleString()}
      </div>
      <div className="text-info-foreground">
        completion: {usage.output_tokens.toLocaleString()}
      </div>
      <div className="text-info-foreground font-semibold">
        total: {usage.total_tokens.toLocaleString()}
      </div>
    </div>
  );
};

const TurnAbortedContent = ({ cell }: { cell: TranscriptStatusCell }) => {
  const reason = getTurnAbortedReason(cell.data);
  return (
    <div className="space-y-1">
      <div className="text-muted-foreground">{reason ?? cell.summary}</div>
    </div>
  );
};

const BackgroundContent = ({ cell }: { cell: TranscriptStatusCell }) => {
  const message = getBackgroundMessage(cell.data);
  return (
    <div className="space-y-1">
      <div className="text-muted-foreground">{message ?? cell.summary}</div>
    </div>
  );
};

