import type { BackgroundEventEvent } from '~/codex.gen/BackgroundEventEvent';
import type { TokenCountEvent } from '~/codex.gen/TokenCountEvent';
import type { TurnAbortedEvent } from '~/codex.gen/TurnAbortedEvent';
import type { TranscriptStatusCell } from '~/conversation/transcript/types';

import { Cell } from './Cell';
import { CellIcon } from './CellIcon';

type StatusEventsProps = {
  cell: TranscriptStatusCell;
  timestamp: string;
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
  const usage = (cell.data as TokenCountEvent | undefined)?.info
    ?.total_token_usage;

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
  const payload = cell.data as TurnAbortedEvent | undefined;
  return (
    <div className="space-y-1">
      <div className="text-muted-foreground">
        {payload?.reason ?? cell.summary}
      </div>
    </div>
  );
};

const BackgroundContent = ({ cell }: { cell: TranscriptStatusCell }) => {
  const payload = cell.data as BackgroundEventEvent | undefined;
  return (
    <div className="space-y-1">
      <div className="text-muted-foreground">
        {payload?.message ?? cell.summary}
      </div>
    </div>
  );
};
