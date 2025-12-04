import type { NewThreadResponse } from '@pasture/protocol';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { createFileRoute, useRouter } from '@tanstack/react-router';
import { Loader2Icon, PlusIcon, SearchIcon } from 'lucide-react';
import { useCallback } from 'react';
import { toast } from 'sonner';
import { Codex } from '~/codex/client';
import { Button } from '~/components/ui/button';
import { encodeWorkspaceId } from '~/lib/routing';
import { useWorkspace, useWorkspaceKeys } from '~/workspace';
import type { WorkspaceThreadsState } from '~/workspace';
import { OPEN_WORKSPACE_THREAD_SWITCHER_EVENT } from '~/workspace/WorkspaceConversationSwitcher';
import { sortThreadsByTimestamp } from '~/workspace/conversations';

export const Route = createFileRoute('/workspaces/$workspaceId/')({
  component: RouteComponent,
});

function RouteComponent() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const { workspacePath, normalizedWorkspacePath } = useWorkspace();
  const keys = useWorkspaceKeys();

  const newThreadMutation = useMutation({
    mutationFn: async (): Promise<NewThreadResponse> => {
      return await Codex.newThread({
        workspacePath,
        options: null,
      });
    },
    onSuccess: (data) => {
      const optimisticState: WorkspaceThreadsState = {
        items: [
          {
            threadId: data.threadId,
            workspacePath: normalizedWorkspacePath || workspacePath,
            currentConversationId: data.conversationId,
            preview: 'Untitled session',
            title: null,
            timestamp: new Date().toISOString(),
            conversationCount: 1,
          },
        ],
      };

      queryClient.setQueryData<WorkspaceThreadsState | undefined>(
        keys.threads(),
        (state) => {
          const existingItems =
            state?.items.filter(
              (item) => item.threadId !== optimisticState.items[0]?.threadId
            ) ?? [];

          return {
            items: sortThreadsByTimestamp([
              optimisticState.items[0],
              ...existingItems,
            ]),
          };
        }
      );

      void router.navigate({
        to: '/workspaces/$workspaceId/threads/$threadId',
        params: {
          workspaceId: encodeWorkspaceId(workspacePath),
          threadId: data.threadId,
        },
      });
    },
    onError: (error: Error) => {
      const description =
        error instanceof Error ? error.message : 'Please try again.';
      toast.error('Failed to create new session.', { description });
    },
  });

  const handleStartNewSession = useCallback(() => {
    if (newThreadMutation.isPending) {
      return;
    }
    newThreadMutation.mutate();
  }, [newThreadMutation]);

  const handleOpenConversationSelector = useCallback(() => {
    if (typeof window === 'undefined') {
      return;
    }
    window.dispatchEvent(new Event(OPEN_WORKSPACE_THREAD_SWITCHER_EVENT));
  }, []);

  return (
    <div className="relative flex h-full flex-1 flex-col items-center justify-center overflow-hidden bg-background px-6 py-8 text-foreground">
      <div className="w-full max-w-xl space-y-8">
        {/* Header */}
        <div className="space-y-3">
          <h1 className="text-lg font-semibold">Choose a thread to begin</h1>
          <p className="text-xs text-muted-foreground">
            Start a new session in this workspace or open an existing one.
            Conversations will appear here once a thread is selected.
          </p>
        </div>

        {/* Actions */}
        <div className="space-y-3">
          <h2 className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
            Actions
          </h2>
          <div className="flex items-center gap-3">
            <Button
              size="sm"
              className="h-8 min-w-32 gap-2 text-xs"
              onClick={handleStartNewSession}
              disabled={newThreadMutation.isPending}
            >
              {newThreadMutation.isPending ? (
                <>
                  <Loader2Icon className="h-4 w-4 animate-spin" />
                  Creating session…
                </>
              ) : (
                <>
                  <PlusIcon className="h-4 w-4" />
                  Start new session
                </>
              )}
            </Button>
            <Button
              size="sm"
              variant="outline"
              className="h-8 min-w-32 gap-2 text-xs"
              onClick={handleOpenConversationSelector}
            >
              <SearchIcon className="h-4 w-4" />
              Open thread…
            </Button>
          </div>
        </div>

        {/* Tip */}
        <div className="rounded-lg border border-border/40 bg-[var(--cream-50)] dark:bg-[var(--cream-900)]/20 px-4 py-3">
          <p className="text-xs text-foreground/70">
            <span className="font-medium text-foreground">Tip:</span> Use{' '}
            <kbd className="rounded bg-background/60 px-1 py-0.5 font-mono text-[10px]">
              ⌘N
            </kbd>{' '}
            to start a new session or{' '}
            <kbd className="rounded bg-background/60 px-1 py-0.5 font-mono text-[10px]">
              ⌘P
            </kbd>{' '}
            to quickly switch between threads.
          </p>
        </div>
      </div>
    </div>
  );
}
