import { AgentReasoning } from '@pasture/transcript-ui';
import { useStreamingText } from '~/conversation/hooks/useStreamingText';
import type { TranscriptAgentReasoningCell } from '@pasture/transcript-ui';

type AgentReasoningContainerProps = {
  cell: TranscriptAgentReasoningCell;
};

export function AgentReasoningContainer({
  cell,
}: AgentReasoningContainerProps) {
  const text = cell.text ?? '';
  const animatedText = useStreamingText(text, {
    enabled: cell.streaming,
  });

  return <AgentReasoning cell={cell} displayText={animatedText} />;
}
