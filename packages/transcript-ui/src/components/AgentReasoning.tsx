import type { TranscriptAgentReasoningCell } from '../types';
import { Cell } from './Cell';
import { Markdown, type MarkdownRendererProps } from './Markdown';
import type { PluggableList } from 'unified';
import type { ComponentType } from 'react';

type AgentReasoningProps = {
  cell: TranscriptAgentReasoningCell;
  /**
   * Optional pre-rendered display text. If provided, this will be used
   * instead of the cell's text (skipping streaming animation).
   */
  displayText?: string;
  rehypePlugins?: PluggableList;
  renderer?: ComponentType<MarkdownRendererProps>;
};

export function AgentReasoning({
  cell,
  displayText,
  rehypePlugins,
  renderer,
}: AgentReasoningProps) {
  const text = cell.text ?? '';
  // Use displayText if provided, otherwise fall back to the raw text
  const textToDisplay = displayText ?? text;

  return (
    <Cell>
      <div className="text-muted-foreground italic">
        {text ? (
          <Markdown
            className="text-muted-foreground italic"
            rehypePlugins={rehypePlugins}
            renderer={renderer}
          >
            {textToDisplay}
          </Markdown>
        ) : (
          <div className="text-muted-foreground"> </div>
        )}
      </div>
    </Cell>
  );
}
