import type { ComponentType } from 'react';
import type { PluggableList } from 'unified';

import type { TranscriptAgentMessageCell } from '../types';
import { Cell } from './Cell';
import { CopyButton } from './CopyButton';
import { Markdown, type MarkdownRendererProps } from './Markdown';

type AgentMessageProps = {
  cell: TranscriptAgentMessageCell;
  /**
   * Optional pre-rendered display text. If provided, this will be used
   * instead of the cell's message (skipping streaming animation).
   */
  displayText?: string;
  rehypePlugins?: PluggableList;
  renderer?: ComponentType<MarkdownRendererProps>;
};

export function AgentMessage({
  cell,
  displayText,
  rehypePlugins,
  renderer,
}: AgentMessageProps) {
  const message = cell.message ?? '';
  // Use displayText if provided, otherwise fall back to the raw message
  const textToDisplay = displayText ?? message;

  return (
    <Cell className="group">
      <div>
        {message ? (
          <Markdown
            streaming={cell.streaming && displayText === undefined}
            rehypePlugins={rehypePlugins}
            renderer={renderer}
          >
            {textToDisplay}
          </Markdown>
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
