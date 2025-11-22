import { PanelLeftCloseIcon, PanelRightOpenIcon } from 'lucide-react';
import { useMemo } from 'react';
import { SidebarTrigger, useSidebar } from '~/components/ui/sidebar';
import { dispatchOpenReviewOverlayEvent } from '~/conversation/events';
import { useConversationHasTurnDiffHistory } from '~/conversation/store/hooks';
import { formatWorkspaceLabel } from '~/lib/workspaces';

type WorkspaceTopBarProps = {
  workspacePath: string;
  activeConversationId?: string | null;
};

const TRAFFIC_LIGHT_OFFSET = '72px';

export function WorkspaceTopBar({
  workspacePath,
  activeConversationId,
}: WorkspaceTopBarProps) {
  const { open } = useSidebar();
  const hasReviewHistory = useConversationHasTurnDiffHistory(
    activeConversationId ?? ''
  );
  const workspaceName = useMemo(
    () => formatWorkspaceLabel(workspacePath),
    [workspacePath]
  );

  return (
    <div
      className="flex h-[var(--workspace-topbar-height)] shrink-0 items-center gap-3 border-b border-border/60 bg-card px-4"
      style={{ paddingLeft: TRAFFIC_LIGHT_OFFSET }}
      data-tauri-drag-region="true"
    >
      <div
        className="flex w-full items-center gap-3 -translate-y-[1px]"
        data-tauri-drag-region="true"
      >
        <div className="flex items-center gap-3">
          <SidebarTrigger
            className="text-muted-foreground hover:text-foreground"
            data-tauri-drag-region="false"
            aria-label="Toggle sidebar"
          >
            <span
              className={
                open
                  ? 'bg-accent/60 text-foreground rounded-md p-1'
                  : 'text-muted-foreground'
              }
            >
              {open ? (
                <PanelLeftCloseIcon className="h-4 w-4" />
              ) : (
                <PanelRightOpenIcon className="h-4 w-4" />
              )}
            </span>
          </SidebarTrigger>
          <div
            className="min-w-0 text-sm font-semibold text-foreground truncate"
            data-tauri-drag-region="true"
          >
            {workspaceName}
          </div>
        </div>

        <div className="flex flex-1 justify-end">
          {activeConversationId ? (
            <button
              type="button"
              className={`flex items-center gap-2 rounded-md px-3 py-1.5 text-xs transition ${
                hasReviewHistory
                  ? 'font-semibold text-foreground hover:bg-accent/60'
                  : 'text-muted-foreground hover:text-muted-foreground cursor-default'
              }`}
              onClick={() => {
                if (activeConversationId) {
                  dispatchOpenReviewOverlayEvent(activeConversationId);
                }
              }}
              disabled={!hasReviewHistory}
              data-tauri-drag-region="false"
            >
              Review changes
            </button>
          ) : null}
        </div>
      </div>
    </div>
  );
}
