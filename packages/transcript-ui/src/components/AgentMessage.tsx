import type { TranscriptAgentMessageCell } from '../types';
import { Cell } from './Cell';
import { CopyButton } from './CopyButton';
import { Markdown } from './Markdown';

type AgentMessageProps = {
  cell: TranscriptAgentMessageCell;
  displayText?: string;
};

export function AgentMessage({ cell }: AgentMessageProps) {
  return (
    <Cell className="group">
      <div>
        <Markdown streaming={cell.streaming}>{cell.message}</Markdown>
      </div>
      {cell.message && (
        <div className="flex justify-end mt-0.5">
          <CopyButton
            content={cell.message}
            label="Copy as markdown"
            showToast={true}
            className="opacity-100"
          />
        </div>
      )}
    </Cell>
  );
}
