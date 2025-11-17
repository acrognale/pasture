import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useRouter } from '@tanstack/react-router';
import { useState } from 'react';
import { toast } from 'sonner';
import { Codex } from '~/codex/client';
import { Button } from '~/components/ui/button';
import { Card } from '~/components/ui/card';
import { encodeWorkspaceId } from '~/lib/routing';
import { formatWorkspaceLabel } from '~/lib/workspaces';

const workspaceQueryKeys = {
  recent: () => ['workspaces', 'recent'] as const,
};

const MAX_VISIBLE_RECENT_WORKSPACES = 5;
const RECENT_WORKSPACE_ITEM_HEIGHT_REM = 3.5;
const RECENT_WORKSPACE_GAP_REM = 0.5;
const RECENT_WORKSPACE_LIST_MAX_HEIGHT_REM =
  MAX_VISIBLE_RECENT_WORKSPACES * RECENT_WORKSPACE_ITEM_HEIGHT_REM +
  (MAX_VISIBLE_RECENT_WORKSPACES - 1) * RECENT_WORKSPACE_GAP_REM;

export function WorkspaceLaunchpad() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const [pendingPath, setPendingPath] = useState<string | null>(null);
  const [actionError, setActionError] = useState<Error | null>(null);

  const recentWorkspacesQuery = useQuery({
    queryKey: workspaceQueryKeys.recent(),
    queryFn: async () => {
      return await Codex.workspace.listRecentWorkspaces();
    },
    refetchOnWindowFocus: false,
  });

  const recentWorkspaces = recentWorkspacesQuery.data ?? [];
  const recentWorkspacesError =
    recentWorkspacesQuery.error instanceof Error
      ? recentWorkspacesQuery.error
      : null;

  const handleOpen = async (workspacePath: string) => {
    if (pendingPath) {
      return;
    }

    setPendingPath(workspacePath);
    setActionError(null);
    try {
      await Codex.workspace.openWorkspace({ workspacePath });
      await queryClient.invalidateQueries({
        queryKey: workspaceQueryKeys.recent(),
      });

      await router.navigate({
        to: '/workspaces/$workspaceId',
        params: { workspaceId: encodeWorkspaceId(workspacePath) },
      });
    } catch (err) {
      const description =
        err instanceof Error ? err.message : 'Please try again.';
      const error = err instanceof Error ? err : new Error(description);
      setActionError(error);
      toast.error('Failed to open workspace.', { description });
    } finally {
      setPendingPath(null);
    }
  };

  const handleBrowse = async () => {
    setActionError(null);
    try {
      const workspacePath = await Codex.workspace.browseForWorkspace();
      if (workspacePath) {
        await handleOpen(workspacePath);
      }
    } catch (err) {
      const description =
        err instanceof Error ? err.message : 'Please try again.';
      const error = err instanceof Error ? err : new Error(description);
      setActionError(error);
      toast.error('Failed to browse for workspace.', { description });
    }
  };

  const isPending = Boolean(pendingPath);

  return (
    <div
      className="fixed inset-0 flex h-dvh w-full items-center justify-center overflow-hidden bg-background px-4 py-10 text-foreground sm:px-6"
      data-tauri-drag-region="true"
    >
      <div className="flex h-full w-full max-w-3xl flex-col space-y-8 overflow-hidden rounded-lg bg-transparent p-4 sm:p-6 lg:p-10">
        <div className="mx-auto max-w-2xl space-y-2 text-center">
          <h1 className="text-2xl font-semibold">Select a workspace</h1>
          <p className="text-sm text-muted-foreground">
            Open an existing Codex workspace or browse to a new project to get
            started.
          </p>
        </div>

        <Card
          className="rounded-lg border border-border/60 bg-card/60 p-6 shadow-sm"
          data-tauri-drag-region="false"
        >
          <div className="flex items-center justify-between gap-4">
            <div>
              <p className="text-sm font-medium">Recent workspaces</p>
              <p className="text-xs text-muted-foreground">
                Pick up where you left off.
              </p>
            </div>
            <Button
              variant="ghost"
              size="sm"
              className="shrink-0"
              disabled={recentWorkspacesQuery.isPending}
              onClick={() => {
                void recentWorkspacesQuery.refetch();
              }}
            >
              Refresh
            </Button>
          </div>

          <div className="mt-4 space-y-4">
            {recentWorkspacesQuery.isPending ? (
              <div className="space-y-2">
                {[1, 2, 3].map((i) => (
                  <div
                    key={i}
                    className="h-14 rounded-md border border-border/40 bg-muted/30 animate-pulse"
                  />
                ))}
              </div>
            ) : recentWorkspacesError ? (
              <div className="space-y-3 rounded-md border border-destructive/40 bg-destructive/10 px-4 py-4 text-sm text-destructive">
                <p>
                  Failed to load recent workspaces:{' '}
                  {recentWorkspacesError.message}
                </p>
                <Button
                  size="sm"
                  variant="outline"
                  className="w-fit"
                  onClick={() => {
                    void recentWorkspacesQuery.refetch();
                  }}
                >
                  Try again
                </Button>
              </div>
            ) : recentWorkspaces.length > 0 ? (
              <div
                className="space-y-2 overflow-y-auto pr-1"
                style={{
                  maxHeight: `${RECENT_WORKSPACE_LIST_MAX_HEIGHT_REM}rem`,
                }}
              >
                {recentWorkspaces.map((workspacePath) => {
                  const isWorkspacePending = pendingPath === workspacePath;
                  return (
                    <button
                      key={workspacePath}
                      type="button"
                      className="flex w-full min-h-[3.5rem] items-center justify-between rounded-md border border-border/40 bg-background/40 px-4 py-3 text-left transition hover:border-border hover:bg-card focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-60"
                      disabled={isPending}
                      onClick={() => {
                        void handleOpen(workspacePath);
                      }}
                    >
                      <div className="min-w-0">
                        <p className="truncate text-sm font-medium">
                          {formatWorkspaceLabel(workspacePath)}
                        </p>
                        <p className="truncate text-xs text-muted-foreground">
                          {workspacePath}
                        </p>
                      </div>
                      {isWorkspacePending && (
                        <span className="ml-3 inline-flex items-center">
                          <span
                            className="size-3 rounded-full border-2 border-muted-foreground/40 border-t-muted-foreground/80 animate-spin"
                            aria-hidden="true"
                          />
                          <span className="sr-only">Opening workspace</span>
                        </span>
                      )}
                    </button>
                  );
                })}
              </div>
            ) : (
              <div className="rounded-md border border-dashed border-border/60 px-4 py-6 text-center text-sm text-muted-foreground">
                Workspaces you open will appear here.
              </div>
            )}

            {actionError && (
              <p className="text-xs text-destructive">{actionError.message}</p>
            )}
          </div>
        </Card>

        <Card
          className="flex flex-col items-center gap-3 rounded-lg border border-border/60 bg-card/60 p-6 text-center shadow-sm"
          data-tauri-drag-region="false"
        >
          <p className="text-sm font-medium">Browse for a workspace</p>
          <p className="text-xs text-muted-foreground">
            Choose a project directory to open.
          </p>
          <Button
            variant="outline"
            disabled={isPending}
            onClick={() => {
              void handleBrowse();
            }}
          >
            Browse...
          </Button>
        </Card>
      </div>
    </div>
  );
}
