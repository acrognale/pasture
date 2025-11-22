import type { ReactNode } from 'react';

type ConversationPaneHeaderProps = {
  actions?: ReactNode;
};

export const ConversationPaneHeader = ({
  actions,
}: ConversationPaneHeaderProps) => {
  if (!actions) {
    return null;
  }

  return (
    <div
      className="h-12 shrink-0 border-b border-border/60 bg-background"
      data-tauri-drag-region="true"
    >
      <div
        className="flex h-full items-center justify-end px-6"
        data-tauri-drag-region="true"
      >
        <div className="flex items-center gap-2" data-tauri-drag-region="false">
          {actions}
        </div>
      </div>
    </div>
  );
};
