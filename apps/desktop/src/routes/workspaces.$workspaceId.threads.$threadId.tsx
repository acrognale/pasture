import { createFileRoute } from '@tanstack/react-router';
import { useEffect, useMemo, useState } from 'react';
import { ConversationPane } from '~/conversation/ConversationPane';
import { decodeWorkspaceId } from '~/lib/routing';
import {
  useWorkspaceConversationStores,
  useWorkspaceThreadsContext,
} from '~/workspace';

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
  const { loadThread } = useWorkspaceThreadsContext();
  const { getThreadConversationId } = useWorkspaceConversationStores();
  const [conversationId, setConversationId] = useState<string | null>(() =>
    getThreadConversationId(threadId)
  );
  const [error, setError] = useState<Error | null>(null);

  useEffect(() => {
    let cancelled = false;
    const run = async () => {
      try {
        setError(null);
        const resolved = await loadThread(threadId, { force: true });
        if (!cancelled && resolved) {
          setConversationId(resolved);
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
  }, [loadThread, threadId]);

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
    <ConversationPane
      workspacePath={workspacePath}
      conversationId={conversationId}
    />
  );
}
