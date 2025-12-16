import { createFileRoute } from '@tanstack/react-router';
import type React from 'react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import { MessageCommentDraftProvider } from '~/conversation/comments/MessageCommentDraftContext';
import { MessageCommentProvider } from '~/conversation/comments/MessageCommentContext';
import { ConversationThreadPanel } from '~/conversation/panels/ConversationThreadPanel';
import { ConversationPanelServicesProvider } from '~/conversation/panels/ConversationPanelServices';
import { registerConversationPanels } from '~/conversation/panels/register';
import { getConversationThreadHostId } from '~/panels/host-ids';
import { usePanelManager, usePanelManagerStore } from '~/panels/PanelManagerProvider';
import { PanelHost } from '~/panels/PanelHost';
import { dockLayoutHasAnyTabs } from '~/panels/layout';
import type { DockLayoutNode, PanelKindId } from '~/panels/types';
import { decodeWorkspaceId } from '~/lib/routing';
import { cn } from '~/lib/utils';
import { useWorkspaceActions } from '~/workspace';

registerConversationPanels();

export const Route = createFileRoute('/workspaces/$workspaceId/threads/$threadId')({
  component: RouteComponent,
});

const DEFAULT_TOOLS_WIDTH = 520;
const MIN_TOOLS_WIDTH = 280;
const DEFAULT_REVIEW_COMMENTS_WIDTH = 375;
const DEFAULT_EDITOR_WIDTH = 600;
const MIN_EDITOR_WIDTH = 320;

function dockLayoutHasPanelKind(
  root: DockLayoutNode | null,
  instances: Record<string, { kindId: PanelKindId }> | null | undefined,
  kindId: PanelKindId
): boolean {
  if (!root || !instances) return false;
  if (root.type === 'group') {
    return root.tabs.some((instanceId) => instances[instanceId]?.kindId === kindId);
  }
  return root.children.some((child) => dockLayoutHasPanelKind(child, instances, kindId));
}

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
        setConversationId(existing ?? null);
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
  const hostId = useMemo(
    () => getConversationThreadHostId(workspacePath, threadId),
    [threadId, workspacePath]
  );
  const hasTools = usePanelManager(
    useCallback(
      (state) => dockLayoutHasAnyTabs(state.hosts[hostId]?.docks.utility.root ?? null),
      [hostId]
    )
  );
  const hasEditor = usePanelManager(
    useCallback(
      (state) => dockLayoutHasAnyTabs(state.hosts[hostId]?.docks.editor.root ?? null),
      [hostId]
    )
  );
  const panelManagerStore = usePanelManagerStore();

  const storageKey = `pasture.tools.ratio:${workspacePath}`;
  const legacyStorageKey = `pasture.tools.width:${workspacePath}`;
  const [toolsRatio, setToolsRatio] = useState<number>(() => {
    if (typeof window === 'undefined') return 0;
    try {
      const stored = window.localStorage.getItem(storageKey);
      const parsedRatio = stored ? Number(stored) : NaN;
      if (Number.isFinite(parsedRatio) && parsedRatio > 0) {
        return parsedRatio;
      }
    } catch {
      // ignore
    }
    return 0;
  });

  const [legacyToolsWidth] = useState<number | null>(() => {
    if (typeof window === 'undefined') return null;
    try {
      const legacyStored = window.localStorage.getItem(legacyStorageKey);
      const parsedWidth = legacyStored ? Number(legacyStored) : NaN;
      if (Number.isFinite(parsedWidth) && parsedWidth > 0) {
        return parsedWidth;
      }
    } catch {
      // ignore
    }
    return null;
  });

  const containerRef = useRef<HTMLDivElement | null>(null);
  const [containerWidth, setContainerWidth] = useState<number>(() => {
    if (typeof window === 'undefined') return 0;
    return 0;
  });
  const containerWidthRef = useRef(containerWidth);
  useEffect(() => {
    containerWidthRef.current = containerWidth;
  }, [containerWidth]);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const container = containerRef.current;
    if (!container) return;

    const update = () => {
      const rect = container.getBoundingClientRect();
      setContainerWidth(rect.width);
    };

    update();

    if (typeof ResizeObserver === 'undefined') {
      window.addEventListener('resize', update);
      return () => window.removeEventListener('resize', update);
    }

    const observer = new ResizeObserver(() => update());
    observer.observe(container);
    return () => observer.disconnect();
  }, []);

  const effectiveToolsRatio = useMemo(() => {
    if (toolsRatio > 0) return toolsRatio;
    if (containerWidth && legacyToolsWidth) return legacyToolsWidth / containerWidth;
    return 0;
  }, [containerWidth, legacyToolsWidth, toolsRatio]);

  const toolsWidth = useMemo(() => {
    if (!containerWidth) return DEFAULT_TOOLS_WIDTH;
    const ratio = effectiveToolsRatio > 0 ? effectiveToolsRatio : DEFAULT_TOOLS_WIDTH / containerWidth;
    const next = containerWidth * ratio;
    return Math.max(MIN_TOOLS_WIDTH, Math.min(containerWidth, next));
  }, [containerWidth, effectiveToolsRatio]);

  const toolsRatioRef = useRef(toolsRatio);
  useEffect(() => {
    toolsRatioRef.current = toolsRatio;
  }, [toolsRatio]);

  const appliedReviewCommentsDefaultRef = useRef(false);
  useEffect(() => {
    const maybeApplyReviewCommentsDefault = (state: ReturnType<typeof panelManagerStore.getState>) => {
      if (appliedReviewCommentsDefaultRef.current) return true;
      if (toolsRatioRef.current > 0) return true;
      if (legacyToolsWidth) return true;

      const host = state.hosts[hostId];
      if (!host) return false;
      const hasReviewComments = dockLayoutHasPanelKind(
        host.docks.utility.root,
        host.instances,
        'conversation.reviewComments'
      );
      if (!hasReviewComments) return false;

      const width = containerWidthRef.current;
      if (!width) return false;

      const clampedWidth = Math.max(MIN_TOOLS_WIDTH, Math.min(width, DEFAULT_REVIEW_COMMENTS_WIDTH));
      setToolsRatio(clampedWidth / width);
      appliedReviewCommentsDefaultRef.current = true;
      return true;
    };

    const attemptApply = () => {
      maybeApplyReviewCommentsDefault(panelManagerStore.getState());
    };

    const unsubscribe = panelManagerStore.subscribe(() => {
      requestAnimationFrame(attemptApply);
    });

    requestAnimationFrame(attemptApply);

    return unsubscribe;
  }, [hostId, legacyToolsWidth, panelManagerStore, setToolsRatio]);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    try {
      if (effectiveToolsRatio > 0) {
        window.localStorage.setItem(storageKey, String(effectiveToolsRatio));
      }
    } catch {
      // ignore
    }
  }, [effectiveToolsRatio, storageKey]);

  const editorStorageKey = `pasture.editor.ratio:${workspacePath}`;
  const [editorRatio, setEditorRatio] = useState<number>(() => {
    if (typeof window === 'undefined') return 0;
    try {
      const stored = window.localStorage.getItem(editorStorageKey);
      const parsedRatio = stored ? Number(stored) : NaN;
      if (Number.isFinite(parsedRatio) && parsedRatio > 0) {
        return parsedRatio;
      }
    } catch {
      // ignore
    }
    return 0;
  });

  const effectiveEditorRatio = useMemo(() => {
    if (editorRatio > 0) return editorRatio;
    return 0;
  }, [editorRatio]);

  const editorWidth = useMemo(() => {
    if (!containerWidth) return DEFAULT_EDITOR_WIDTH;
    const ratio = effectiveEditorRatio > 0 ? effectiveEditorRatio : DEFAULT_EDITOR_WIDTH / containerWidth;
    const next = containerWidth * ratio;
    return Math.max(MIN_EDITOR_WIDTH, Math.min(containerWidth * 0.7, next));
  }, [containerWidth, effectiveEditorRatio]);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    try {
      if (effectiveEditorRatio > 0) {
        window.localStorage.setItem(editorStorageKey, String(effectiveEditorRatio));
      }
    } catch {
      // ignore
    }
  }, [editorStorageKey, effectiveEditorRatio]);

  const handleToolsResizeStart = (event: React.MouseEvent<HTMLDivElement>) => {
    event.preventDefault();
    const totalWidth = containerWidth || containerRef.current?.getBoundingClientRect().width || 0;
    if (!totalWidth) return;
    const startX = event.clientX;
    const startWidth = toolsWidth;

    const handleMouseMove = (moveEvent: MouseEvent) => {
      const dx = moveEvent.clientX - startX;
      const next = Math.max(MIN_TOOLS_WIDTH, startWidth + dx);
      setToolsRatio(next / totalWidth);
    };

    const handleMouseUp = () => {
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
    };

    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mouseup', handleMouseUp);
  };

  const handleEditorResizeStart = (event: React.MouseEvent<HTMLDivElement>) => {
    event.preventDefault();
    const totalWidth = containerWidth || containerRef.current?.getBoundingClientRect().width || 0;
    if (!totalWidth) return;
    const startX = event.clientX;
    const startWidth = editorWidth;

    const handleMouseMove = (moveEvent: MouseEvent) => {
      const dx = moveEvent.clientX - startX;
      const next = Math.max(MIN_EDITOR_WIDTH, startWidth + dx);
      setEditorRatio(next / totalWidth);
    };

    const handleMouseUp = () => {
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
    };

    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mouseup', handleMouseUp);
  };

  return (
    <div ref={containerRef} className="flex h-full w-full min-w-0">
      {hasTools ? (
        <>
          <div className="min-w-0" style={{ width: toolsWidth }}>
            <PanelHost
              key={hostId}
              hostId={hostId}
              dockId="utility"
              emptyState="No tools"
            />
          </div>
          <div
            className="flex items-stretch justify-center bg-transparent w-2 cursor-col-resize"
            onMouseDown={handleToolsResizeStart}
            role="separator"
            aria-orientation="vertical"
            aria-label="Resize tools"
          >
            <div className="h-full w-px bg-border/60" />
          </div>
        </>
      ) : null}
      {hasEditor ? (
        <>
          <div className="min-w-0" style={{ width: editorWidth }}>
            <PanelHost
              key={`${hostId}-editor`}
              hostId={hostId}
              dockId="editor"
              emptyState="No files"
            />
          </div>
          <div
            className="flex items-stretch justify-center bg-transparent w-2 cursor-col-resize"
            onMouseDown={handleEditorResizeStart}
            role="separator"
            aria-orientation="vertical"
            aria-label="Resize editor"
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
