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
import { Button } from '~/components/ui/button';

import { AgentMessage } from './AgentMessage';
import { ExecutionApprovalContainer } from './ExecutionApprovalContainer';
import { HandoffCell } from './HandoffCell';
import { PatchesContainer } from './PatchesContainer';
import { Tools } from './Tools';
import { UserMessageContainer } from './UserMessageContainer';
import { dispatchOpenReviewMapOverlayEvent } from '../events';

type CreateTranscriptOverridesOptions = {
  conversationId: string;
  onConversationForked?: (conversationId: string) => void;
};

const renderExitedReviewMapCell = (
  cell: TranscriptGenericCell,
  conversationId: string
) => {
  const hasOutput = cell.payload?.hasOutput === true;
  const title = typeof cell.payload?.title === 'string' ? cell.payload.title : '';
  const summary =
    typeof cell.payload?.summary === 'string' ? cell.payload.summary : '';

  return (
    <Cell icon={<CellIcon status={hasOutput ? 'success' : 'warning'} />}>
      <div className="rounded-md border border-border/60 bg-card p-3 space-y-2">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="text-sm font-semibold text-foreground truncate">
              {hasOutput ? 'Review map ready' : 'Review map finished without output'}
            </div>
            {title.trim() ? (
              <div className="mt-1 text-sm text-muted-foreground truncate">
                {title}
              </div>
            ) : null}
          </div>
          <Button
            type="button"
            size="sm"
            variant="secondary"
            disabled={!hasOutput}
            onClick={() => dispatchOpenReviewMapOverlayEvent(conversationId)}
          >
            Open
          </Button>
        </div>

        {summary.trim() ? (
          <div className="text-sm text-foreground whitespace-pre-wrap">
            {summary}
          </div>
        ) : null}
      </div>
    </Cell>
  );
};

const renderGenericCell = (cell: TranscriptGenericCell, conversationId: string) => {
  if (cell.eventType === 'exited_review_map_mode') {
    return renderExitedReviewMapCell(cell, conversationId);
  }
  return (
    <Cell icon={<CellIcon status="info" />}>
      <div className="space-y-1">
        <pre className="text-muted-foreground overflow-x-auto whitespace-pre-wrap leading-transcript">
          {safeStringify(cell.payload)}
        </pre>
      </div>
    </Cell>
  );
};

const renderToolCell = (cell: TranscriptToolCell) => <Tools cell={cell} />;

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
  generic: ({ cell }) => renderGenericCell(cell, conversationId),
  handoff: ({ cell }) => <HandoffCell cell={cell as TranscriptHandoffCell} />,
});
