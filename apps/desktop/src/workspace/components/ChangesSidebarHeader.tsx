import { ChevronLeft, ChevronRight } from 'lucide-react';
import { dispatchOpenReviewOverlayEvent } from '~/conversation/events';

type ChangesSidebarHeaderProps = {
  conversationId: string | null;
  hasReviewHistory: boolean;
  fileCount: number;
  isCollapsed: boolean;
  onToggleCollapse: () => void;
};

export function ChangesSidebarHeader({
  conversationId,
  hasReviewHistory,
  fileCount,
  isCollapsed,
  onToggleCollapse,
}: ChangesSidebarHeaderProps) {
  return (
    <div className="flex items-center gap-2 px-4 py-3 text-xs border-b border-border/60">
      <button
        type="button"
        className="shrink-0 rounded-md p-1 text-muted-foreground transition-colors hover:bg-muted/50 hover:text-foreground"
        onClick={onToggleCollapse}
        aria-label={isCollapsed ? 'Expand sidebar' : 'Collapse sidebar'}
      >
        {isCollapsed ? (
          <ChevronLeft className="h-4 w-4" />
        ) : (
          <ChevronRight className="h-4 w-4" />
        )}
      </button>
      {!isCollapsed ? (
        <>
          <span className="flex items-center gap-2 font-semibold uppercase tracking-wide text-muted-foreground">
            <span>Changes</span>
            <span className="rounded-full bg-muted px-2 py-0.5 text-[10px] font-semibold text-muted-foreground">
              {fileCount}
            </span>
          </span>
          {conversationId && hasReviewHistory ? (
            <button
              type="button"
              className="ml-auto text-xs font-medium text-blue-500 hover:text-blue-600 transition-colors normal-case tracking-normal"
              onClick={() => {
                if (conversationId) {
                  dispatchOpenReviewOverlayEvent(conversationId);
                }
              }}
            >
              Review
            </button>
          ) : null}
        </>
      ) : null}
    </div>
  );
}
