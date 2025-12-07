import type { TranscriptAgentReasoningCell } from '../types';
import { Cell } from './Cell';
import { Markdown } from './Markdown';

type AgentReasoningProps = {
  cell: TranscriptAgentReasoningCell;
  displayText?: string;
};

export function AgentReasoning({ cell, displayText }: AgentReasoningProps) {
  const text = cell.text ?? '';
  const textToDisplay = displayText ?? text;

  return (
    <Cell>
      <div className="text-muted-foreground italic">
        <Markdown
          className="text-muted-foreground italic"
          streaming={cell.streaming}
        >
          {textToDisplay}
        </Markdown>
      </div>
    </Cell>
  );
}
