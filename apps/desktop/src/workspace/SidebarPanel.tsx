import type { NewThreadResponse } from '@pasture/protocol';
import type { ThreadSummary } from '@pasture/protocol';
import type { GetRepoDiffParams } from '@pasture/protocol';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useRouter, useRouterState } from '@tanstack/react-router';
import {
  ChevronDownIcon,
  Loader2Icon,
  PlusIcon,
  SearchIcon,
  SettingsIcon,
  XIcon,
} from 'lucide-react';
import { useCallback, useEffect, useMemo, useState } from 'react';
import type { FocusEvent } from 'react';
import { toast } from 'sonner';
import { Codex } from '~/codex/client';
import { Button } from '~/components/ui/button';
import { ScrollArea } from '~/components/ui/scroll-area';
import {
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarMenuSkeleton,
} from '~/components/ui/sidebar';
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '~/components/ui/tooltip';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '~/components/ui/dropdown-menu';
import {
  dispatchOpenRepoReviewOverlayEvent,
  dispatchOpenReviewOverlayEvent,
  OPEN_REVIEW_OVERLAY_EVENT,
  type OpenReviewOverlayDetail,
} from '~/conversation/events';
import {
  useConversationIsRunning,
  useConversationLatestTurnDiff,
  useConversationLoadState,
  useConversationTurnDiffHistory,
} from '~/conversation/store/hooks';
import { useNamedShortcut } from '~/keyboard/hooks';
import { useNow } from '~/lib/hooks/useNow';
import { encodeWorkspaceId } from '~/lib/routing';
import { formatSessionPreviewTimestamp } from '~/lib/time';
import { makePathRelative } from '~/lib/utils';
import { resolveSessionLabel } from '~/lib/workspaces';
import { buildFileDiffStats, parseUnifiedDiff } from '~/review/diff';
import { useRepoDiff } from '~/review/queries';
import { ChangesSidebarContent } from '~/workspace/components/ChangesSidebarContent';
import { sortThreadsByTimestamp } from '~/workspace/conversations';

import { OPEN_WORKSPACE_THREAD_SWITCHER_EVENT } from './WorkspaceConversationSwitcher';
import {
  useWorkspace,
  useWorkspaceActions,
  useWorkspaceKeys,
  useWorkspaceThreadConversationId,
} from './WorkspaceProvider';
import {
  type WorkspaceThreadsState,
  useOpenWorkspaceThreads,
} from './hooks/useWorkspaceThreads';

export function SidebarPanel({
  onOpenSettings,
}: {
  onOpenSettings?: () => void;
}) {
  const router = useRouter();
  const queryClient = useQueryClient();
  const { workspacePath, normalizedWorkspacePath } = useWorkspace();
  const keys = useWorkspaceKeys();
  const threads = useOpenWorkspaceThreads();
  const { closeThread } = useWorkspaceActions();
  const now = useNow();
  const threadMatch = useRouterState({
    select: (state) =>
      state.matches.find(
        (match) =>
          match.routeId === '/workspaces/$workspaceId/threads/$threadId'
      ),
  });
  const activeThreadId =
    typeof threadMatch?.params?.threadId === 'string'
      ? threadMatch.params.threadId
      : null;

  const activeConversationId = useWorkspaceThreadConversationId(activeThreadId);

  const sessions: ThreadSummary[] = useMemo(
    () => threads.items ?? [],
    [threads.items]
  );
  const threadsError =
    threads.query.error instanceof Error ? threads.query.error : null;

  const handleThreadClick = useCallback(
    (threadId: string) => {
      void router.navigate({
        to: '/workspaces/$workspaceId/threads/$threadId',
        params: {
          workspaceId: encodeWorkspaceId(workspacePath),
          threadId,
        },
      });
    },
    [router, workspacePath]
  );

  const navigateToThread = useCallback(
    (threadId: string) => {
      void router.navigate({
        to: '/workspaces/$workspaceId/threads/$threadId',
        params: {
          workspaceId: encodeWorkspaceId(workspacePath),
          threadId,
        },
      });
    },
    [router, workspacePath]
  );

  const handleCloseThread = useCallback(
    (threadId: string) => {
      closeThread(threadId);

      if (activeThreadId === threadId) {
        const nextThread = sessions.find(
          (session: ThreadSummary) => session.threadId !== threadId
        );
        if (nextThread) {
          navigateToThread(nextThread.threadId);
        } else {
          void router.navigate({
            to: '/workspaces/$workspaceId',
            params: {
              workspaceId: encodeWorkspaceId(workspacePath),
            },
          });
        }
      }
    },
    [
      activeThreadId,
      closeThread,
      navigateToThread,
      router,
      sessions,
      workspacePath,
    ]
  );

  const newThreadMutation = useMutation({
    mutationFn: async (): Promise<NewThreadResponse> => {
      return await Codex.newThread({
        workspacePath,
        options: null,
      });
    },
    onSuccess: (data) => {
      const optimisticSummary: ThreadSummary = {
        threadId: data.threadId,
        workspacePath: normalizedWorkspacePath || workspacePath,
        currentConversationId: data.conversationId,
        preview: 'Untitled thread',
        title: null,
        timestamp: new Date().toISOString(),
        conversationCount: 1,
      };

      queryClient.setQueryData<WorkspaceThreadsState | undefined>(
        keys.threads(),
        (state) => {
          const existingItems =
            state?.items.filter(
              (item) => item.threadId !== optimisticSummary.threadId
            ) ?? [];

          return {
            items: sortThreadsByTimestamp([
              optimisticSummary,
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
      toast.error('Failed to create new thread.', { description });
    },
  });

  const handleStartNewSession = useCallback(() => {
    newThreadMutation.mutate();
  }, [newThreadMutation]);

  const newThreadShortcutOverrides = useMemo(
    () => ({
      enabled: () => !newThreadMutation.isPending,
      when: (event: KeyboardEvent) => !event.altKey && !event.shiftKey,
    }),
    [newThreadMutation.isPending]
  );

  const handleNewConversationShortcut = useCallback(() => {
    if (newThreadMutation.isPending) {
      return false;
    }
    handleStartNewSession();
    return true;
  }, [handleStartNewSession, newThreadMutation.isPending]);

  useNamedShortcut(
    'workspace.newThread',
    newThreadShortcutOverrides,
    handleNewConversationShortcut
  );

  const [isChangesCollapsed, setIsChangesCollapsed] = useState(false);

  const handleToggleChangesPanelShortcut = useCallback(() => {
    setIsChangesCollapsed((previous) => !previous);
    return true;
  }, []);

  useNamedShortcut(
    'workspace.toggleChangesSidebar',
    undefined,
    handleToggleChangesPanelShortcut
  );

  const handleOpenConversationSelector = useCallback(() => {
    if (typeof window === 'undefined') {
      return;
    }
    window.dispatchEvent(new Event(OPEN_WORKSPACE_THREAD_SWITCHER_EVENT));
  }, []);

  useNamedShortcut('workspace.openSettings', undefined, () => {
    onOpenSettings?.();
    return true;
  });

  const conversationIdForDiffs = activeConversationId ?? '';
  const turnDiffHistory = useConversationTurnDiffHistory(
    conversationIdForDiffs
  );
  const latestDiff = useConversationLatestTurnDiff(conversationIdForDiffs);

  const processedFiles = useMemo(() => {
    if (!turnDiffHistory.length && !latestDiff?.unifiedDiff) {
      return [];
    }

    const sortedHistory = [...turnDiffHistory];
    if (latestDiff && !turnDiffHistory.includes(latestDiff)) {
      sortedHistory.push(latestDiff);
    }

    sortedHistory.sort((a, b) => a.turnNumber - b.turnNumber);

    const statsByPath = new Map<string, { added: number; removed: number }>();
    const latestFileByPath = new Map<
      string,
      ReturnType<typeof parseUnifiedDiff>['files'][number]
    >();

    sortedHistory.forEach((turnDiff) => {
      if (!turnDiff.unifiedDiff) return;
      const parsed = parseUnifiedDiff(turnDiff.unifiedDiff);
      const fileStats = buildFileDiffStats(parsed.files);

      parsed.files.forEach((file) => {
        const path = file.displayPath;
        const previous = statsByPath.get(path) ?? { added: 0, removed: 0 };
        const stats = fileStats.get(file.id) ?? { added: 0, removed: 0 };
        statsByPath.set(path, {
          added: previous.added + stats.added,
          removed: previous.removed + stats.removed,
        });
        latestFileByPath.set(path, { ...file, id: path });
      });
    });

    return Array.from(latestFileByPath.entries())
      .map(([path, file]) => ({
        file,
        stats: statsByPath.get(path) ?? { added: 0, removed: 0 },
        relativePath: makePathRelative(workspacePath, path),
      }))
      .sort((a, b) => a.relativePath.localeCompare(b.relativePath));
  }, [latestDiff, turnDiffHistory, workspacePath]);

  return (
    <div className="flex h-full min-w-0 flex-col">
      <div className="flex min-h-0 min-w-0 flex-1 flex-col bg-card/60 overflow-y-auto">
        <SidebarGroup className="px-2 py-2">
          <SidebarGroupLabel className="flex w-full items-center gap-2">
            <span>Threads</span>
            <div className="ml-auto flex items-center gap-1">
              <Button
                size="sm"
                variant="ghost"
                className="shrink-0 h-7 px-2 text-xs"
                onClick={handleStartNewSession}
                disabled={newThreadMutation.isPending}
              >
                {newThreadMutation.isPending ? (
                  <Loader2Icon className="mr-1 h-4 w-4 animate-spin" />
                ) : (
                  <PlusIcon className="mr-1 h-4 w-4" />
                )}
                New
              </Button>
              <Button
                size="sm"
                variant="ghost"
                className="shrink-0 h-7 px-2 text-xs"
                onClick={handleOpenConversationSelector}
              >
                <SearchIcon className="mr-1 h-4 w-4" />
                Open
              </Button>
            </div>
          </SidebarGroupLabel>
          <SidebarGroupContent className="mt-2">
            {threads.query.isPending ? (
              <SidebarMenu>
                {[1, 2, 3].map((item) => (
                  <SidebarMenuItem key={item}>
                    <SidebarMenuSkeleton showIcon />
                  </SidebarMenuItem>
                ))}
              </SidebarMenu>
            ) : threadsError ? (
              <div className="px-2 space-y-2 text-xs text-destructive">
                <p>Failed to load threads: {threadsError.message}</p>
                <Button
                  size="sm"
                  variant="outline"
                  className="w-fit"
                  onClick={() => {
                    void threads.query.refetch();
                  }}
                >
                  Try again
                </Button>
              </div>
            ) : sessions.length > 0 ? (
              <SidebarMenu>
                {sessions.map((session) => (
                  <SidebarConversationMenuItem
                    key={session.threadId}
                    session={session}
                    isActive={session.threadId === activeThreadId}
                    now={now}
                    onSelect={handleThreadClick}
                    onClose={handleCloseThread}
                  />
                ))}
              </SidebarMenu>
            ) : null}
          </SidebarGroupContent>
        </SidebarGroup>
        {activeConversationId ? (
          <ChangesSidebarSection
            key={activeThreadId ?? activeConversationId}
            conversationId={activeConversationId}
            threadId={activeThreadId}
            workspacePath={workspacePath}
            normalizedWorkspacePath={normalizedWorkspacePath}
            threadFilesFromEvents={processedFiles}
            collapsed={isChangesCollapsed}
          />
        ) : null}
      </div>
      <div className="border-t border-border/60 px-3 py-2 flex justify-end">
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              type="button"
              size="icon-sm"
              variant="ghost"
              className="rounded-full"
              onClick={onOpenSettings}
              aria-label="Open settings"
            >
              <SettingsIcon className="size-4" />
            </Button>
          </TooltipTrigger>
          <TooltipContent side="top" align="end">
            Settings
          </TooltipContent>
        </Tooltip>
      </div>
    </div>
  );
}

type SidebarChangesEntry = {
  file: ReturnType<typeof parseUnifiedDiff>['files'][number];
  stats: { added: number; removed: number };
  relativePath: string;
};

function toRepoParams(params: GetRepoDiffParams) {
  return {
    workspacePath: params.workspacePath,
    baseRef: params.baseRef,
    targetRef: params.targetRef ?? null,
    includeWorktree: params.includeWorktree,
  };
}

function formatRepoRangeLabel(params: GetRepoDiffParams): string {
  if (params.includeWorktree) {
    return `${params.baseRef} → working tree`;
  }
  return `${params.baseRef} → ${params.targetRef ?? 'HEAD'}`;
}

function ChangesSidebarSection({
  conversationId,
  threadId,
  workspacePath,
  normalizedWorkspacePath,
  threadFilesFromEvents,
  collapsed,
}: {
  conversationId: string;
  threadId: string | null;
  workspacePath: string;
  normalizedWorkspacePath: string | null;
  threadFilesFromEvents: SidebarChangesEntry[];
  collapsed: boolean;
}) {
  type ChangesMode = 'repo' | 'thread';

  const conversationLoadState = useConversationLoadState(conversationId);

  const workspaceKey = normalizedWorkspacePath || workspacePath;
  const liveRangeStorageKey = `pasture.changes.liveRange:${workspaceKey}`;
  const modeStorageKey = `pasture.changes.mode:${workspaceKey}:${threadId ?? conversationId}`;

  const [mode, setMode] = useState<ChangesMode>(() => {
    if (typeof window === 'undefined') {
      return 'repo';
    }
    try {
      const stored = window.localStorage.getItem(modeStorageKey);
      if (stored === 'repo' || stored === 'thread') {
        return stored;
      }
    } catch {
      // ignore
    }
    return 'repo';
  });

  const setModeAndPersist = useCallback(
    (next: ChangesMode) => {
      setMode(next);
      if (typeof window === 'undefined') {
        return;
      }
      try {
        window.localStorage.setItem(modeStorageKey, next);
      } catch {
        // ignore
      }
    },
    [modeStorageKey]
  );

  const [liveRepoParams, setLiveRepoParams] = useState<GetRepoDiffParams>(() => {
    const fallback: GetRepoDiffParams = {
      workspacePath,
      baseRef: 'HEAD',
      targetRef: null,
      includeWorktree: true,
    };
    if (typeof window === 'undefined') {
      return fallback;
    }
    try {
      const stored = window.localStorage.getItem(liveRangeStorageKey);
      if (!stored) {
        return fallback;
      }
      const parsed = JSON.parse(stored) as Partial<GetRepoDiffParams> | null;
      if (!parsed || typeof parsed !== 'object') {
        return fallback;
      }
      return {
        workspacePath,
        baseRef: typeof parsed.baseRef === 'string' ? parsed.baseRef : 'HEAD',
        targetRef:
          parsed.targetRef === null || typeof parsed.targetRef === 'string'
            ? parsed.targetRef
            : null,
        includeWorktree: Boolean(parsed.includeWorktree),
      };
    } catch {
      return fallback;
    }
  });

  const setLiveRepoParamsAndPersist = useCallback(
    (next: GetRepoDiffParams) => {
      setLiveRepoParams(next);
      if (typeof window === 'undefined') {
        return;
      }
      try {
        window.localStorage.setItem(
          liveRangeStorageKey,
          JSON.stringify({
            baseRef: next.baseRef,
            targetRef: next.targetRef,
            includeWorktree: next.includeWorktree,
          })
        );
      } catch {
        // ignore
      }
    },
    [liveRangeStorageKey]
  );

  const repoDiffQuery = useRepoDiff(liveRepoParams);
  const repoProcessedFiles = useMemo<SidebarChangesEntry[]>(() => {
    const files = repoDiffQuery.parsedDiff?.files ?? [];
    if (!files.length) {
      return [];
    }

    const fileStats = buildFileDiffStats(files);
    return files
      .map((file) => ({
        file: { ...file, id: file.displayPath },
        stats: fileStats.get(file.id) ?? { added: 0, removed: 0 },
        relativePath: makePathRelative(workspacePath, file.displayPath),
      }))
      .sort((a, b) => a.relativePath.localeCompare(b.relativePath));
  }, [repoDiffQuery.parsedDiff?.files, workspacePath]);

  useEffect(() => {
    if (typeof window === 'undefined') {
      return;
    }

    const handleOpenReview = (event: CustomEvent<OpenReviewOverlayDetail>) => {
      if (event.detail.conversationId !== conversationId) {
        return;
      }
      if (event.detail.mode !== 'repo' || !event.detail.repo) {
        return;
      }
      setModeAndPersist('repo');
      setLiveRepoParamsAndPersist({
        workspacePath,
        baseRef: event.detail.repo.baseRef,
        targetRef: event.detail.repo.targetRef ?? null,
        includeWorktree: event.detail.repo.includeWorktree,
      });
    };

    window.addEventListener(
      OPEN_REVIEW_OVERLAY_EVENT,
      handleOpenReview as EventListener
    );

    return () => {
      window.removeEventListener(
        OPEN_REVIEW_OVERLAY_EVENT,
        handleOpenReview as EventListener
      );
    };
  }, [
    conversationId,
    setLiveRepoParamsAndPersist,
    setModeAndPersist,
    workspacePath,
  ]);

  const liveCount = repoProcessedFiles.length;
  const threadFiles = threadFilesFromEvents;
  const threadCount = threadFiles.length;
  const activeCount = mode === 'repo' ? liveCount : threadCount;
  const files = mode === 'repo' ? repoProcessedFiles : threadFiles;
  const selectionLabel =
    mode === 'repo' ? formatRepoRangeLabel(liveRepoParams) : 'Thread changes';

  return (
    <SidebarGroup className="flex min-h-0 flex-1 flex-col pl-2 pr-0 py-2">
      <SidebarGroupLabel className="flex w-full items-center justify-between gap-2">
        <span className="flex items-center gap-2">
          <span>Changes</span>
          <span className="rounded-full bg-muted px-2 py-0.5 text-[10px] font-semibold text-muted-foreground">
            {activeCount}
          </span>
        </span>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              type="button"
              size="sm"
              variant="ghost"
              className="h-7 px-2 text-[11px] text-muted-foreground"
            >
              {selectionLabel}
              <ChevronDownIcon className="ml-1 size-3 opacity-60" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent className="w-72" align="end">
            <DropdownMenuLabel>Show changes from</DropdownMenuLabel>
            <DropdownMenuItem
              onSelect={() => {
                setModeAndPersist('thread');
              }}
            >
              Thread changes
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem
              onSelect={() => {
                setModeAndPersist('repo');
                setLiveRepoParamsAndPersist({
                  workspacePath,
                  baseRef: 'HEAD',
                  targetRef: null,
                  includeWorktree: true,
                });
              }}
            >
              Working tree (HEAD → working tree)
            </DropdownMenuItem>
            <DropdownMenuItem
              onSelect={() => {
                setModeAndPersist('repo');
                setLiveRepoParamsAndPersist({
                  workspacePath,
                  baseRef: 'main',
                  targetRef: 'HEAD',
                  includeWorktree: false,
                });
              }}
            >
              main → HEAD
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem
              onSelect={() => {
                setModeAndPersist('repo');
                dispatchOpenRepoReviewOverlayEvent(
                  conversationId,
                  toRepoParams(liveRepoParams)
                );
              }}
            >
              Custom range…
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </SidebarGroupLabel>
      {!collapsed ? (
        <SidebarGroupContent className="mt-2 min-h-0 flex-1">
          <ScrollArea
            className="h-full overflow-x-hidden"
            scrollbarClassName="w-1.5"
          >
            <div className="pr-2">
              <div className="flex items-center justify-end gap-2 pl-1">
                <Button
                  type="button"
                  size="sm"
                  variant="ghost"
                  className="h-7 px-2 text-[11px]"
                  onClick={() => {
                    if (mode === 'repo') {
                      dispatchOpenRepoReviewOverlayEvent(
                        conversationId,
                        toRepoParams(liveRepoParams)
                      );
                      return;
                    }
                    dispatchOpenReviewOverlayEvent(conversationId);
                  }}
                >
                  View All
                </Button>
              </div>
              <ChangesSidebarContent
                files={files}
                emptyStateTitle={
                  mode === 'repo'
                    ? repoDiffQuery.query.isPending
                      ? 'Loading changes…'
                      : repoDiffQuery.query.error
                        ? "Couldn't load changes"
                        : liveRepoParams.includeWorktree &&
                            liveRepoParams.baseRef === 'HEAD'
                          ? 'Working tree is clean'
                          : 'No changes found'
                    : conversationLoadState.isLoading
                      ? 'Loading changes…'
                      : 'No thread diffs recorded'
                }
                emptyStateDescription={
                  mode === 'repo'
                    ? repoDiffQuery.query.error instanceof Error
                      ? repoDiffQuery.query.error.message
                      : 'Compare commits or branches to review committed work.'
                    : 'Thread changes are based on agent-emitted diffs.'
                }
                emptyStateAction={
                  mode === 'repo'
                    ? repoDiffQuery.query.isPending
                      ? undefined
                      : repoDiffQuery.query.error
                        ? {
                            label: 'Try again',
                            onClick: () => {
                              void repoDiffQuery.query.refetch();
                            },
                          }
                        : {
                            label: 'Compare another range…',
                            onClick: () => {
                              dispatchOpenRepoReviewOverlayEvent(
                                conversationId,
                                toRepoParams(liveRepoParams)
                              );
                            },
                          }
                    : threadCount === 0
                      ? {
                          label: 'View working tree changes',
                          onClick: () => {
                            setModeAndPersist('repo');
                            setLiveRepoParamsAndPersist({
                              workspacePath,
                              baseRef: 'HEAD',
                              targetRef: null,
                              includeWorktree: true,
                            });
                          },
                        }
                      : undefined
                }
                onFileClick={(file) => {
                  if (mode === 'repo') {
                    dispatchOpenRepoReviewOverlayEvent(
                      conversationId,
                      toRepoParams(liveRepoParams),
                      file.displayPath
                    );
                    return;
                  }
                  dispatchOpenReviewOverlayEvent(conversationId, file.displayPath);
                }}
              />
            </div>
          </ScrollArea>
        </SidebarGroupContent>
      ) : null}
    </SidebarGroup>
  );
}

type SidebarConversationMenuItemProps = {
  session: ThreadSummary;
  isActive: boolean;
  now: Date;
  onSelect: (threadId: string) => void;
  onClose: (threadId: string) => void;
};

function SidebarConversationMenuItem({
  session,
  isActive,
  now,
  onSelect,
  onClose,
}: SidebarConversationMenuItemProps) {
  const isRunning = useConversationIsRunning(session.currentConversationId);
  const [isHovered, setIsHovered] = useState(false);

  const showCloseButton = !isRunning && isHovered;
  const { text: sessionLabel, source: labelSource } = resolveSessionLabel(
    session.title,
    session.preview,
    session.threadId
  );

  const handleBlur = useCallback((event: FocusEvent<HTMLButtonElement>) => {
    if (!event.currentTarget.contains(event.relatedTarget as Node | null)) {
      setIsHovered(false);
    }
  }, []);

  const titleContent = (
    <div className="flex w-full items-center gap-2">
      <span className="flex w-0 flex-1 items-center gap-2 overflow-hidden">
        {isRunning ? (
          <Loader2Icon className="size-4 shrink-0 animate-spin text-muted-foreground" />
        ) : null}
        <span className="truncate text-sm font-medium">{sessionLabel}</span>
      </span>
      <span className="flex shrink-0 items-center gap-2">
        {session.timestamp ? (
          <span className="text-transcript-micro text-muted-foreground whitespace-nowrap">
            {formatSessionPreviewTimestamp(session.timestamp, now)}
          </span>
        ) : null}
        {showCloseButton ? (
          <Button
            variant="ghost"
            size="icon"
            className="h-6 w-6 shrink-0"
            onClick={(event) => {
              event.stopPropagation();
              onClose(session.threadId);
            }}
            aria-label="Close thread"
          >
            <span className="sr-only">Close thread</span>
            <XIcon className="h-4 w-4" />
          </Button>
        ) : null}
      </span>
    </div>
  );

  const menuButton = (
    <SidebarMenuButton
      type="button"
      onClick={() => onSelect(session.threadId)}
      isActive={isActive}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
      onFocus={() => setIsHovered(true)}
      onBlur={handleBlur}
    >
      {titleContent}
    </SidebarMenuButton>
  );

  if (labelSource !== 'title') {
    return <SidebarMenuItem>{menuButton}</SidebarMenuItem>;
  }

  return (
    <SidebarMenuItem>
      <Tooltip>
        <TooltipTrigger asChild>{menuButton}</TooltipTrigger>
        <TooltipContent side="right" sideOffset={8}>
          {sessionLabel}
        </TooltipContent>
      </Tooltip>
    </SidebarMenuItem>
  );
}
