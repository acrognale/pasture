import type { ReactNode } from 'react';
import {
  formatWorkspaceLabel,
  normalizeWorkspaceSlashes,
} from '~/lib/workspaces';

type ConversationPaneHeaderProps = {
  workspacePath: string;
  actions?: ReactNode;
};

export const ConversationPaneHeader = ({
  workspacePath,
  actions,
}: ConversationPaneHeaderProps) => {
  const workspaceTitle = formatWorkspaceLabel(workspacePath);
  const workspacePathDisplay = normalizeWorkspaceSlashes(workspacePath);

  return (
    <div
      className="h-[57px] shrink-0 border-b border-border/60 bg-background"
      data-tauri-drag-region="true"
    >
      <div
        className="flex h-full items-center justify-between px-6"
        data-tauri-drag-region="true"
      >
        <div className="min-w-0" data-tauri-drag-region="true">
          <p className="text-sm font-semibold text-foreground truncate">
            {workspaceTitle}
          </p>
          <p className="text-xs text-muted-foreground truncate">
            {workspacePathDisplay}
          </p>
        </div>
        {actions ? (
          <div className="flex gap-2" data-tauri-drag-region="false">
            {actions}
          </div>
        ) : null}
      </div>
    </div>
  );
};
