import { AgentMessage } from '@pasture/transcript-ui';
import { useStreamingText } from '~/conversation/hooks/useStreamingText';
import type { TranscriptAgentMessageCell } from '~/conversation/transcript/types';
import { formatTimestampClock } from '~/lib/time';

type AgentMessageContainerProps = {
  cell: TranscriptAgentMessageCell;
};

export function AgentMessageContainer({ cell }: AgentMessageContainerProps) {
  const message = cell.message ?? '';
  const timestamp = formatTimestampClock(cell.timestamp);
  const animatedMessage = useStreamingText(message, {
    enabled: cell.streaming,
  });

  return (
    <AgentMessage
      cell={cell}
      timestamp={timestamp}
      displayText={animatedMessage}
    />
  );
}
