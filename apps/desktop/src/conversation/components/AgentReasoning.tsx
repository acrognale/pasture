import { useStreamingText } from '~/conversation/hooks/useStreamingText';
import type { TranscriptAgentReasoningCell } from '~/conversation/transcript/types';

import { Cell } from './Cell';
import { Markdown } from './Markdown';

type AgentReasoningProps = {
  cell: TranscriptAgentReasoningCell;
  index: number;
  timestamp: string;
};

export function AgentReasoning({ cell }: AgentReasoningProps) {
  const text = cell.text ?? '';
  const animatedText = useStreamingText(text, {
    enabled: cell.streaming,
  });

  return (
    <Cell>
      <div className="text-muted-foreground italic">
        {text ? (
          <Markdown className="text-muted-foreground italic">
            {animatedText}
          </Markdown>
        ) : (
          <div className="text-muted-foreground"> </div>
        )}
      </div>
    </Cell>
  );
}
