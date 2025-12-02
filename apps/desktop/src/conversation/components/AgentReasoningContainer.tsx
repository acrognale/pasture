import { AgentReasoning } from '@pasture/transcript-ui';
import { useStreamingText } from '~/conversation/hooks/useStreamingText';
import type { TranscriptAgentReasoningCell } from '~/conversation/transcript/types';
import { formatTimestampClock } from '~/lib/time';

type AgentReasoningContainerProps = {
  cell: TranscriptAgentReasoningCell;
};

export function AgentReasoningContainer({
  cell,
}: AgentReasoningContainerProps) {
  const text = cell.text ?? '';
  const timestamp = formatTimestampClock(cell.timestamp);
  const animatedText = useStreamingText(text, {
    enabled: cell.streaming,
  });

  return (
    <AgentReasoning
      cell={cell}
      timestamp={timestamp}
      displayText={animatedText}
    />
  );
}
