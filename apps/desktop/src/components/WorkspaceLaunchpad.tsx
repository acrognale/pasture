import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useRouter } from '@tanstack/react-router';
import { FolderIcon, Loader2Icon, RotateCwIcon } from 'lucide-react';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { toast } from 'sonner';
import { Codex } from '~/codex/client';
import { Button } from '~/components/ui/button';
import { encodeWorkspaceId } from '~/lib/routing';
import { formatWorkspaceLabel } from '~/lib/workspaces';

const workspaceQueryKeys = {
  recent: () => ['workspaces', 'recent'] as const,
};

const Kbd = ({ children }: { children: React.ReactNode }) => (
  <kbd className="px-1 py-0.5 rounded bg-background/50 text-[10px] font-mono">
    {children}
  </kbd>
);

const Code = ({ children }: { children: React.ReactNode }) => (
  <code className="px-1 py-0.5 rounded bg-background/50 text-[10px] font-mono">
    {children}
  </code>
);

const TIPS = [
  <>
    Press <Kbd>⌘B</Kbd> to toggle the sidebar, or <Kbd>⌘P</Kbd> for quick thread
    switching.
  </>,
  <>Edit any message to fork the conversation into a new branch.</>,
  <>
    Use <Kbd>⌘N</Kbd> to start a new thread in your current workspace.
  </>,
  <>
    Press <Kbd>Escape</Kbd> to interrupt an active turn or close overlays.
  </>,
  <>Paste images directly into the composer using your clipboard.</>,
  <>
    Use <Code>/compact</Code> to clean up long conversations and free up
    context.
  </>,
  <>
    Press <Kbd>Ctrl+Tab</Kbd> to cycle through recent conversations.
  </>,
  <>
    The sidebar only shows active threads - use <Kbd>⌘P</Kbd> to resume previous
    ones.
  </>,
];

export function WorkspaceLaunchpad() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const [pendingPath, setPendingPath] = useState<string | null>(null);
  const [actionError, setActionError] = useState<Error | null>(null);
  const [randomTip] = useState(
    () => TIPS[Math.floor(Math.random() * TIPS.length)]
  );

  const recentWorkspacesQuery = useQuery({
    queryKey: workspaceQueryKeys.recent(),
    queryFn: async () => {
      return await Codex.workspace.listRecentWorkspaces();
    },
    refetchOnWindowFocus: false,
  });

  const recentWorkspaces = useMemo(
    () => recentWorkspacesQuery.data ?? [],
    [recentWorkspacesQuery.data]
  );
  const recentWorkspacesError = useMemo(
    () =>
      recentWorkspacesQuery.error instanceof Error
        ? recentWorkspacesQuery.error
        : null,
    [recentWorkspacesQuery.error]
  );

  const handleOpen = useCallback(
    async (workspacePath: string) => {
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
    },
    [pendingPath, router, queryClient]
  );

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

  // Keyboard shortcuts for opening workspaces
  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      // Only handle number keys 1-5
      if (event.key >= '1' && event.key <= '5') {
        const index = parseInt(event.key, 10) - 1;
        const workspace = recentWorkspaces[index];

        if (workspace && !isPending) {
          event.preventDefault();
          void handleOpen(workspace);
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [recentWorkspaces, isPending, handleOpen]);

  return (
    <div
      className="hills-bg fixed inset-0 flex h-dvh w-full items-center justify-center overflow-y-auto bg-background px-6 py-8 text-foreground"
      data-tauri-drag-region="true"
    >
      {/* Rolling hills SVG divider */}
      <div className="absolute bottom-0 left-0 right-0 h-16 overflow-hidden pointer-events-none opacity-30">
        <svg
          className="absolute bottom-0 w-full h-24"
          viewBox="0 0 1200 120"
          preserveAspectRatio="none"
          fill="var(--brand-soft)"
        >
          <path d="M0,60 C200,100 400,20 600,60 C800,100 1000,20 1200,60 L1200,120 L0,120 Z" />
        </svg>
      </div>

      <div className="w-full max-w-xl space-y-8" data-tauri-drag-region="false">
        {/* Header */}
        <div className="space-y-3">
          <div className="flex items-center gap-2">
            <img
              src="/logo-48.png"
              srcSet="/logo-48.png 1x, /logo-96.png 2x"
              alt="Pasture"
              width={28}
              height={28}
              className="size-7 rounded-lg"
            />
            <h1 className="text-lg font-semibold">Pasture</h1>
          </div>
          <p className="text-xs text-muted-foreground">
            Select a workspace to get started
          </p>
        </div>

        {/* Recent Workspaces */}
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <h2 className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
              Recent workspaces
            </h2>
            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                size="sm"
                className="h-7 text-xs"
                disabled={isPending}
                onClick={() => {
                  void handleBrowse();
                }}
              >
                <FolderIcon className="size-3.5 mr-1.5" />
                Open...
              </Button>
              <Button
                variant="ghost"
                size="sm"
                className="h-7 w-7 p-0"
                disabled={recentWorkspacesQuery.isPending}
                onClick={() => {
                  void recentWorkspacesQuery.refetch();
                }}
                aria-label="Refresh workspaces"
              >
                <RotateCwIcon className="size-3.5" />
              </Button>
            </div>
          </div>

          <div>
            {recentWorkspacesQuery.isPending ? (
              <div className="space-y-0">
                {[1, 2, 3].map((i) => (
                  <div
                    key={i}
                    className="flex items-center justify-between px-2 py-1.5 animate-pulse"
                  >
                    <div className="h-3.5 w-32 rounded bg-muted-foreground/20" />
                    <div className="h-3 w-48 rounded bg-muted-foreground/10" />
                  </div>
                ))}
              </div>
            ) : recentWorkspacesError ? (
              <div className="rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2.5">
                <p className="text-xs text-destructive">
                  Failed to load recent workspaces:{' '}
                  {recentWorkspacesError.message}
                </p>
                <Button
                  size="sm"
                  variant="outline"
                  className="mt-2 h-6 text-xs"
                  onClick={() => {
                    void recentWorkspacesQuery.refetch();
                  }}
                >
                  Try again
                </Button>
              </div>
            ) : recentWorkspaces.length > 0 ? (
              <div className="space-y-0">
                {recentWorkspaces.map((workspacePath, index) => {
                  const isWorkspacePending = pendingPath === workspacePath;
                  const showKeyboardHint = index < 5;
                  return (
                    <button
                      key={workspacePath}
                      type="button"
                      className="group flex w-full items-center gap-3 pr-2 py-1.5 text-left transition-colors hover:bg-muted/50 focus-visible:outline-none focus-visible:bg-muted/50 disabled:cursor-not-allowed disabled:opacity-50"
                      disabled={isPending}
                      onClick={() => {
                        void handleOpen(workspacePath);
                      }}
                    >
                      {showKeyboardHint && (
                        <kbd className="flex items-center justify-center size-5 shrink-0 rounded bg-muted text-[10px] font-mono text-muted-foreground ml-0">
                          {index + 1}
                        </kbd>
                      )}
                      <div className="flex items-center justify-between gap-3 min-w-0 flex-1">
                        <span className="truncate text-sm font-medium">
                          {formatWorkspaceLabel(workspacePath)}
                        </span>
                        <div className="flex items-center gap-3 shrink-0">
                          <span className="truncate text-xs text-muted-foreground font-mono">
                            {workspacePath}
                          </span>
                          {isWorkspacePending && (
                            <Loader2Icon
                              className="size-3.5 shrink-0 animate-spin text-muted-foreground"
                              aria-hidden="true"
                            />
                          )}
                        </div>
                      </div>
                    </button>
                  );
                })}
              </div>
            ) : (
              <div className="px-2 py-8 text-center">
                <FolderIcon className="size-6 mx-auto mb-2 text-muted-foreground/30" />
                <p className="text-xs text-muted-foreground">
                  No recent workspaces
                </p>
                <p className="text-xs text-muted-foreground/70 mt-0.5">
                  Open a project to get started
                </p>
              </div>
            )}

            {actionError && (
              <div className="mt-2 px-2">
                <p className="text-xs text-destructive">
                  {actionError.message}
                </p>
              </div>
            )}
          </div>
        </div>

        {/* Tip of the day */}
        {recentWorkspaces.length > 0 && (
          <div className="rounded-lg border border-border/40 bg-[var(--cream-50)] dark:bg-[var(--cream-900)]/20 px-4 py-3">
            <div className="flex items-center gap-3">
              <div className="shrink-0">
                <svg
                  className="size-4 text-muted-foreground"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <circle cx="12" cy="12" r="10" />
                  <path d="M12 16v-4" />
                  <path d="M12 8h.01" />
                </svg>
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-xs text-foreground/70">
                  <span className="font-medium text-foreground">Tip:</span>{' '}
                  {randomTip}
                </p>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
