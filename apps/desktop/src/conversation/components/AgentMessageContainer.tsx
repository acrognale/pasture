import { AgentMessage } from '@pasture/transcript-ui';
import { useStreamingText } from '~/conversation/hooks/useStreamingText';
import type { TranscriptAgentMessageCell } from '@pasture/transcript-ui';

type AgentMessageContainerProps = {
  cell: TranscriptAgentMessageCell;
};

export function AgentMessageContainer({ cell }: AgentMessageContainerProps) {
  const message = cell.message ?? '';
  const animatedMessage = useStreamingText(message, {
    enabled: cell.streaming,
  });

  return (
    <AgentMessage cell={cell} displayText={animatedMessage} />
  );
}
