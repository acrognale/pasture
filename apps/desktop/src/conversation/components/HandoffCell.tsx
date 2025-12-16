import { Cell, type TranscriptHandoffCell } from '@pasture/transcript-ui';
import { ArrowRight } from 'lucide-react';
import { Button } from '~/components/ui/button';
import { getConversationHostId } from '~/panels/host-ids';
import { usePanelManagerStore } from '~/panels/PanelManagerProvider';
import { useWorkspace, useWorkspaceActions } from '~/workspace';

type HandoffCellProps = {
  cell: TranscriptHandoffCell;
};

export function HandoffCell({ cell }: HandoffCellProps) {
  const { workspacePath } = useWorkspace();
  const { loadThread } = useWorkspaceActions();
  const panelManagerStore = usePanelManagerStore();

  const hasDestination =
    Boolean(cell.targetThreadId) && Boolean(cell.targetConversationId);

  const summary =
    cell.goal && cell.goal.trim().length > 0 ? cell.goal : (cell.preview ?? '');

  const handleOpenThread = () => {
    if (!hasDestination || !cell.targetThreadId) {
      return;
    }

    void (async () => {
      const threadId = cell.targetThreadId!;
      const conversationId = await loadThread(threadId);
      if (!conversationId) return;
      const hostId = getConversationHostId(workspacePath);
      panelManagerStore.getState().actions.open(hostId, 'editor', 'conversation.thread', {
        workspacePath,
        conversationId,
        threadId,
      });
    })();
  };

  return (
    <Cell>
      <div className="rounded-transcript border border-transcript-border bg-card px-3 py-2.5 space-y-2 mb-4">
        <div className="flex items-center justify-between gap-3">
          <div className="min-w-0 space-y-1">
            <div className="text-xs font-semibold uppercase tracking-wide text-transcript-muted-foreground">
              Handoff to new thread
            </div>
            {cell.title ? (
              <div className="truncate text-sm font-medium text-foreground">
                {cell.title}
              </div>
            ) : null}
          </div>
          {hasDestination ? (
            <Button
              type="button"
              size="sm"
              variant="outline"
              className="shrink-0 gap-1.5"
              onClick={handleOpenThread}
            >
              Open thread
              <ArrowRight className="h-3.5 w-3.5" />
            </Button>
          ) : null}
        </div>
        {summary ? (
          <div className="text-xs text-muted-foreground whitespace-pre-wrap leading-transcript border-t border-transcript-border pt-2">
            {summary}
          </div>
        ) : null}
      </div>
    </Cell>
  );
}
