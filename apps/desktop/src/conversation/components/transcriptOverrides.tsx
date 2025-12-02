import {
  Cell,
  CellIcon,
  safeStringify,
  type TranscriptGenericCell,
  type TranscriptToolCell,
  type TranscriptViewOverrides,
} from '@pasture/transcript-ui';

import { AgentMessageContainer } from './AgentMessageContainer';
import { AgentReasoningContainer } from './AgentReasoningContainer';
import { ExecutionApprovalContainer } from './ExecutionApprovalContainer';
import { PatchesContainer } from './PatchesContainer';
import { Tools } from './Tools';
import { UserMessageContainer } from './UserMessageContainer';

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

const renderToolCell = (cell: TranscriptToolCell) => (
  <Tools cell={cell} timestamp={cell.timestamp} />
);

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
  'agent-message': ({ cell }) => <AgentMessageContainer cell={cell} />,
  'agent-reasoning': ({ cell }) =>
    cell.visible ? <AgentReasoningContainer cell={cell} /> : null,
  'exec-approval': ({ cell }) => <ExecutionApprovalContainer cell={cell} />,
  patch: ({ cell }) => <PatchesContainer cell={cell} />,
  'patch-approval': ({ cell }) => <PatchesContainer cell={cell} />,
  tool: ({ cell }) => renderToolCell(cell),
  generic: ({ cell }) => renderGenericCell(cell),
});
