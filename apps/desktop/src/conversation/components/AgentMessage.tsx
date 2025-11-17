import { useStreamingText } from '~/conversation/hooks/useStreamingText';
import type { TranscriptAgentMessageCell } from '~/conversation/transcript/types';

import { Cell } from './Cell';
import { CopyButton } from './CopyButton';
import { Markdown } from './Markdown';

type AgentMessageProps = {
  cell: TranscriptAgentMessageCell;
  index: number;
  timestamp: string;
};

export function AgentMessage({ cell }: AgentMessageProps) {
  const message = cell.message ?? '';
  const animatedMessage = useStreamingText(message, {
    enabled: cell.streaming,
  });

  return (
    <Cell className="group">
      <div>
        {message ? (
          <Markdown streaming={cell.streaming}>{animatedMessage}</Markdown>
        ) : (
          <div className="text-muted-foreground"> </div>
        )}
      </div>
      {message && (
        <div className="flex justify-end mt-0.5">
          <CopyButton
            content={message}
            label="Copy as markdown"
            showToast={true}
            className="opacity-100"
          />
        </div>
      )}
    </Cell>
  );
}
