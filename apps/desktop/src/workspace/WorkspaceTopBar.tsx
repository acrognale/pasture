import { PanelLeftCloseIcon, PanelRightOpenIcon } from 'lucide-react';
import { useMemo } from 'react';
import { SidebarTrigger, useSidebar } from '~/components/ui/sidebar';
import { formatWorkspaceLabel } from '~/lib/workspaces';

type WorkspaceTopBarProps = {
  workspacePath: string;
  activeConversationId?: string | null;
  hasActiveThread?: boolean;
};

const TRAFFIC_LIGHT_OFFSET = '72px';

export function WorkspaceTopBar({ workspacePath }: WorkspaceTopBarProps) {
  const { open } = useSidebar();
  const workspaceName = useMemo(
    () => formatWorkspaceLabel(workspacePath),
    [workspacePath]
  );

  return (
    <div
      className="flex h-[var(--workspace-topbar-height)] shrink-0 items-center gap-3 border-b border-border/60 bg-card px-4"
      style={{ paddingLeft: TRAFFIC_LIGHT_OFFSET }}
    >
      <div
        className="flex w-full items-center gap-3 -translate-y-[1px]"
        data-tauri-drag-region="true"
      >
        <div className="flex items-center gap-3">
          <SidebarTrigger
            className="text-muted-foreground hover:text-foreground"
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
          <div className="min-w-0 text-sm font-semibold text-foreground truncate flex-1">
            {workspaceName}
          </div>
        </div>
      </div>
    </div>
  );
}
