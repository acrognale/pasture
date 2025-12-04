import {
  Loader2Icon,
  PanelLeftCloseIcon,
  PanelRightOpenIcon,
  Share2,
} from 'lucide-react';
import { useMemo, useState } from 'react';
import { toast } from 'sonner';
import { Button } from '~/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '~/components/ui/dialog';
import { SidebarTrigger, useSidebar } from '~/components/ui/sidebar';
import { dispatchOpenReviewOverlayEvent } from '~/conversation/events';
import {
  useConversationHasTurnDiffHistory,
  useConversationTranscriptTurns,
} from '~/conversation/store/hooks';
import { copyToClipboard } from '~/lib/utils';
import { formatWorkspaceLabel } from '~/lib/workspaces';
import { useWorkspaceActions, useWorkspaceThreads } from '~/workspace';
import { useComposerConfig } from '~/composer/hooks/useComposerConfig';
import { createDefaultComposerConfig } from '~/composer/types';

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
  const { getThreadIdForConversation } = useWorkspaceActions();
  const { items: threads } = useWorkspaceThreads();
  const hasReviewHistory = useConversationHasTurnDiffHistory(
    activeConversationId ?? ''
  );
  const { turns, turnOrder } = useConversationTranscriptTurns(
    activeConversationId ?? ''
  );
  const [isSharing, setIsSharing] = useState(false);
  const [confirmShareOpen, setConfirmShareOpen] = useState(false);
  const workspaceName = useMemo(
    () => formatWorkspaceLabel(workspacePath),
    [workspacePath]
  );

  const activeThreadId = useMemo(() => {
    if (!activeConversationId) {
      return null;
    }
    return getThreadIdForConversation(activeConversationId);
  }, [activeConversationId, getThreadIdForConversation]);

  const shareTitle = useMemo(() => {
    if (activeThreadId) {
      const thread = threads.find((item) => item.threadId === activeThreadId);
      const normalizedTitle = thread?.title?.trim();
      if (normalizedTitle) {
        return normalizedTitle;
      }
      const normalizedPreview = thread?.preview?.trim();
      if (normalizedPreview) {
        return normalizedPreview;
      }
    }

    return workspaceName;
  }, [activeThreadId, threads, workspaceName]);

  const canShare =
    Boolean(activeConversationId) && turnOrder && turnOrder.length > 0;

  const { query: composerQuery } = useComposerConfig(
    workspacePath,
    activeConversationId
  );
  const composerConfig = composerQuery.data ?? createDefaultComposerConfig();

  const handleShare = async () => {
    if (!canShare) {
      return;
    }
    setIsSharing(true);
    try {
      const webBase =
        (import.meta.env.VITE_WEB_API_URL as string) ?? 'http://localhost:3001';
      const apiBase = webBase.replace(/\/$/, '');

      const response = await fetch(`${apiBase}/api/share`, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
        },
        body: JSON.stringify({
          title: shareTitle,
          model: composerConfig.model ?? undefined,
          reasoningEffort: composerConfig.reasoningEffort ?? undefined,
          transcript: { turns, turnOrder },
        }),
      });

      if (!response.ok) {
        throw new Error(`Share failed (${response.status})`);
      }
      const payload = (await response.json()) as { id: string; url: string };
      const absoluteUrl = payload.url.startsWith('http')
        ? payload.url
        : `${apiBase}${payload.url}`;

      const copied = await copyToClipboard(absoluteUrl);
      toast.success('Share link created', {
        description: copied ? 'Link copied to clipboard' : absoluteUrl,
      });
      if (!copied) {
        window.open(absoluteUrl, '_blank', 'noreferrer');
      }
    } catch (error) {
      toast.error('Failed to share transcript', {
        description:
          error instanceof Error ? error.message : 'Unexpected error',
      });
    } finally {
      setIsSharing(false);
    }
  };

  return (
    <>
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

          <div
            className="flex flex-1 justify-end gap-2"
            data-tauri-drag-region="true"
          >
            {activeConversationId ? (
              <>
                <button
                  type="button"
                  className={`flex items-center gap-2 rounded-md px-3 py-1.5 text-xs transition ${
                    canShare
                      ? 'font-semibold text-foreground hover:bg-accent/60'
                      : 'text-muted-foreground cursor-default'
                  }`}
                  onClick={() => {
                    if (canShare && !isSharing) {
                      setConfirmShareOpen(true);
                    }
                  }}
                  disabled={!canShare || isSharing}
                >
                  <Share2 className="h-4 w-4" />
                  {isSharing ? 'Sharing…' : 'Share'}
                </button>

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
                >
                  Review changes
                </button>
              </>
            ) : null}
          </div>
        </div>
      </div>

      <Dialog open={confirmShareOpen} onOpenChange={setConfirmShareOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <div className="flex items-center gap-3 mb-2">
              <div className="w-10 h-10 rounded-lg bg-brand-soft flex items-center justify-center">
                <Share2 className="w-5 h-5 text-brand" />
              </div>
              <DialogTitle>Share this conversation</DialogTitle>
            </div>
            <DialogDescription className="text-left">
              Create a public link anyone can view.
            </DialogDescription>
          </DialogHeader>

          {/* Preview card showing what will be shared */}
          <div className="rounded-lg border border-border bg-muted/30 p-3 my-2">
            <p className="text-sm font-medium text-foreground truncate">
              {shareTitle?.slice(0, 30)}
              {shareTitle?.length > 30 ? '...' : ''}
            </p>
            <p className="text-xs text-muted-foreground mt-1">
              {turnOrder?.length ?? 0} turn
              {(turnOrder?.length ?? 0) === 1 ? '' : 's'} · pasture.dev
            </p>
          </div>

          <DialogFooter className="sm:justify-between gap-2">
            <Button
              variant="ghost"
              onClick={() => setConfirmShareOpen(false)}
              disabled={isSharing}
            >
              Cancel
            </Button>
            <Button
              onClick={() => {
                setConfirmShareOpen(false);
                void handleShare();
              }}
              disabled={isSharing}
              className="gap-2"
            >
              {isSharing ? (
                <>
                  <Loader2Icon className="w-4 h-4 animate-spin" />
                  Creating link…
                </>
              ) : (
                <>
                  Copy link
                  <span className="text-primary-foreground/60">→</span>
                </>
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
