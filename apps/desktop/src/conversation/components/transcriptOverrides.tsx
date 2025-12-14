import {
  Cell,
  CellIcon,
  type TranscriptAgentMessageCell,
  type TranscriptGenericCell,
  type TranscriptHandoffCell,
  type TranscriptToolCell,
  type TranscriptViewOverrides,
  safeStringify,
} from '@pasture/transcript-ui';

import { AgentMessage } from './AgentMessage';
import { ExecutionApprovalContainer } from './ExecutionApprovalContainer';
import { HandoffCell } from './HandoffCell';
import { PatchesContainer } from './PatchesContainer';
import { Tools } from './Tools';
import { UserMessageContainer } from './UserMessageContainer';
import { GrepFilesToolCall } from './tools/GrepFilesToolCall';
import { ListDirToolCall } from './tools/ListDirToolCall';
import { ReadFileToolCall } from './tools/ReadFileToolCall';

type CreateTranscriptOverridesOptions = {
  conversationId: string;
  onConversationForked?: (conversationId: string) => void;
};

const renderGenericCell = (cell: TranscriptGenericCell) => (
  <Cell icon={<CellIcon status="info" />}>
    <div className="space-y-1">
      <pre className="text-muted-foreground overflow-x-auto whitespace-pre-wrap leading-transcript">
        {safeStringify(cell.payload)}
      </pre>
    </div>
  </Cell>
);

const renderToolCell = (cell: TranscriptToolCell) => {
  switch (cell.toolType) {
    case 'read-file':
      return (
        <ReadFileToolCall
          cell={cell as TranscriptToolCell & { toolType: 'read-file' }}
        />
      );
    case 'list-dir':
      return (
        <ListDirToolCall
          cell={cell as TranscriptToolCell & { toolType: 'list-dir' }}
        />
      );
    case 'grep-files':
      return (
        <GrepFilesToolCall
          cell={cell as TranscriptToolCell & { toolType: 'grep-files' }}
        />
      );
    default:
      return <Tools cell={cell} />;
  }
};

export const createTranscriptOverrides = ({
  conversationId,
  onConversationForked,
}: CreateTranscriptOverridesOptions): TranscriptViewOverrides => ({
  'user-message': ({ cell, context }) => (
    <UserMessageContainer
      cell={cell}
      conversationId={conversationId}
      nthUserMessage={context.nthUserMessage}
      onConversationForked={onConversationForked}
    />
  ),
  'agent-message': ({ cell }) => (
    <AgentMessage
      cell={cell as TranscriptAgentMessageCell}
      conversationId={conversationId}
    />
  ),
  'exec-approval': ({ cell }) => <ExecutionApprovalContainer cell={cell} />,
  patch: ({ cell }) => <PatchesContainer cell={cell} />,
  'patch-approval': ({ cell }) => <PatchesContainer cell={cell} />,
  tool: ({ cell }) => renderToolCell(cell),
  generic: ({ cell }) => renderGenericCell(cell),
  handoff: ({ cell }) => <HandoffCell cell={cell as TranscriptHandoffCell} />,
});
