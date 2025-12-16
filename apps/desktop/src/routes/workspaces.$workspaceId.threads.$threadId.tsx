import { createFileRoute } from '@tanstack/react-router';
import type React from 'react';
import { useEffect, useMemo, useState } from 'react';

import { MessageCommentDraftProvider } from '~/conversation/comments/MessageCommentDraftContext';
import { MessageCommentProvider } from '~/conversation/comments/MessageCommentContext';
import { ConversationThreadPanel } from '~/conversation/panels/ConversationThreadPanel';
import { ConversationPanelServicesProvider } from '~/conversation/panels/ConversationPanelServices';
import { registerConversationPanels } from '~/conversation/panels/register';
import { getConversationHostId } from '~/panels/host-ids';
import { usePanelManager } from '~/panels/PanelManagerProvider';
import { PanelHost } from '~/panels/PanelHost';
import { dockLayoutHasAnyTabs } from '~/panels/layout';
import { decodeWorkspaceId } from '~/lib/routing';
import { cn } from '~/lib/utils';
import { useWorkspaceActions } from '~/workspace';

registerConversationPanels();

export const Route = createFileRoute('/workspaces/$workspaceId/threads/$threadId')({
  component: RouteComponent,
});

const DEFAULT_TOOLS_WIDTH = 420;
const MIN_TOOLS_WIDTH = 280;
const MAX_TOOLS_WIDTH = 720;

function RouteComponent() {
  const { workspaceId, threadId } = Route.useParams();
  const workspacePath = useMemo(() => decodeWorkspaceId(workspaceId), [workspaceId]);
  const { loadThread, getThreadConversationId } = useWorkspaceActions();
  const [conversationId, setConversationId] = useState<string | null>(() =>
    getThreadConversationId(threadId)
  );
  const [error, setError] = useState<Error | null>(null);

  useEffect(() => {
    let cancelled = false;
    const run = async () => {
      try {
        setError(null);
        const existing = getThreadConversationId(threadId);
        const resolved = await loadThread(threadId, { force: !existing });
        const nextConversationId = resolved ?? getThreadConversationId(threadId);
        if (!cancelled && nextConversationId) {
          setConversationId(nextConversationId);
        }
      } catch (err) {
        if (cancelled) return;
        setError(err instanceof Error ? err : new Error(String(err)));
      }
    };

    void run();

    return () => {
      cancelled = true;
    };
  }, [getThreadConversationId, loadThread, threadId]);

  if (error) {
    return (
      <div className="flex h-full items-center justify-center text-sm text-destructive">
        Failed to open thread: {error.message}
      </div>
    );
  }

  if (!conversationId) {
    return (
      <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
        Loading thread…
      </div>
    );
  }

  return (
    <ConversationPanelServicesProvider>
      <MessageCommentProvider conversationId={conversationId} workspacePath={workspacePath}>
        <MessageCommentDraftProvider>
          <ThreadWithTools
            workspacePath={workspacePath}
            threadId={threadId}
            conversationId={conversationId}
            onConversationForked={setConversationId}
          />
        </MessageCommentDraftProvider>
      </MessageCommentProvider>
    </ConversationPanelServicesProvider>
  );
}

function ThreadWithTools({
  workspacePath,
  threadId,
  conversationId,
  onConversationForked,
}: {
  workspacePath: string;
  threadId: string;
  conversationId: string;
  onConversationForked: (conversationId: string) => void;
}) {
  const hostId = useMemo(() => getConversationHostId(workspacePath), [workspacePath]);
  const host = usePanelManager((state) => state.hosts[hostId] ?? null);

  const hasTools = dockLayoutHasAnyTabs(host?.docks.utility.root ?? null);

  const storageKey = `pasture.tools.width:${workspacePath}`;
  const [toolsWidth, setToolsWidth] = useState<number>(() => {
    if (typeof window === 'undefined') return DEFAULT_TOOLS_WIDTH;
    try {
      const stored = window.localStorage.getItem(storageKey);
      const parsed = stored ? Number(stored) : NaN;
      if (Number.isFinite(parsed)) {
        return Math.max(MIN_TOOLS_WIDTH, Math.min(MAX_TOOLS_WIDTH, parsed));
      }
    } catch {
      // ignore
    }
    return DEFAULT_TOOLS_WIDTH;
  });

  useEffect(() => {
    if (typeof window === 'undefined') return;
    try {
      window.localStorage.setItem(storageKey, String(toolsWidth));
    } catch {
      // ignore
    }
  }, [storageKey, toolsWidth]);

  const handleResizeStart = (event: React.MouseEvent<HTMLDivElement>) => {
    event.preventDefault();
    const startX = event.clientX;
    const startWidth = toolsWidth;

    const handleMouseMove = (moveEvent: MouseEvent) => {
      const dx = moveEvent.clientX - startX;
      const next = Math.max(MIN_TOOLS_WIDTH, Math.min(MAX_TOOLS_WIDTH, startWidth + dx));
      setToolsWidth(next);
    };

    const handleMouseUp = () => {
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
    };

    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mouseup', handleMouseUp);
  };

  return (
    <div className="flex h-full w-full min-w-0">
      {hasTools ? (
        <>
          <div className="min-w-0" style={{ width: toolsWidth }}>
            <PanelHost
              hostId={hostId}
              dockId="utility"
              emptyState="No tools"
            />
          </div>
          <div
            className="flex items-stretch justify-center bg-transparent w-2 cursor-col-resize"
            onMouseDown={handleResizeStart}
            role="separator"
            aria-orientation="vertical"
            aria-label="Resize tools"
          >
            <div className="h-full w-px bg-border/60" />
          </div>
        </>
      ) : null}
      <div className={cn('flex min-w-0 flex-1')}>
        <ConversationThreadPanel
          workspacePath={workspacePath}
          conversationId={conversationId}
          threadId={threadId}
          onConversationForked={onConversationForked}
        />
      </div>
    </div>
  );
}
