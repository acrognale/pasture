import { createFileRoute } from '@tanstack/react-router';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { ConversationPane } from '~/conversation/ConversationPane';
import { useNamedShortcut } from '~/keyboard/hooks';
import { decodeWorkspaceId } from '~/lib/routing';
import { useWorkspaceActions } from '~/workspace';
import { ChangesSidebar } from '~/workspace/components/ChangesSidebar';

export const Route = createFileRoute(
  '/workspaces/$workspaceId/threads/$threadId'
)({
  component: RouteComponent,
});

function RouteComponent() {
  const { workspaceId, threadId } = Route.useParams();
  const workspacePath = useMemo(
    () => decodeWorkspaceId(workspaceId),
    [workspaceId]
  );
  const { loadThread, getThreadConversationId } = useWorkspaceActions();
  const [conversationId, setConversationId] = useState<string | null>(() =>
    getThreadConversationId(threadId)
  );
  const [error, setError] = useState<Error | null>(null);
  const [isChangesSidebarCollapsed, setIsChangesSidebarCollapsed] =
    useState(false);

  const handleToggleChangesSidebar = useCallback(() => {
    setIsChangesSidebarCollapsed((prev) => !prev);
  }, []);

  useNamedShortcut(
    'workspace.toggleChangesSidebar',
    undefined,
    handleToggleChangesSidebar
  );

  useEffect(() => {
    let cancelled = false;
    const run = async () => {
      try {
        setError(null);
        const existing = getThreadConversationId(threadId);
        const resolved = await loadThread(threadId, {
          force: !existing,
        });
        const nextConversationId =
          resolved ?? getThreadConversationId(threadId);
        if (!cancelled && nextConversationId) {
          setConversationId(nextConversationId);
        }
      } catch (err) {
        if (cancelled) {
          return;
        }
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
    <div className="flex h-full w-full">
      <ConversationPane
        workspacePath={workspacePath}
        conversationId={conversationId}
        onConversationForked={setConversationId}
      />
      <ChangesSidebar
        workspacePath={workspacePath}
        conversationId={conversationId}
        isCollapsed={isChangesSidebarCollapsed}
        onToggleCollapse={handleToggleChangesSidebar}
      />
    </div>
  );
}
