import type { NewThreadResponse } from '@pasture/protocol';
import type { ThreadSummary } from '@pasture/protocol';
import type { GetRepoDiffParams } from '@pasture/protocol';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import {
  ChevronDownIcon,
  FolderTreeIcon,
  ListIcon,
  Loader2Icon,
  PlusIcon,
  SearchIcon,
  SettingsIcon,
  XIcon,
} from 'lucide-react';
import { useCallback, useEffect, useMemo, useState } from 'react';
import type { FocusEvent, MouseEvent as ReactMouseEvent } from 'react';
import { toast } from 'sonner';
import { Codex } from '~/codex/client';
import { Button } from '~/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '~/components/ui/dropdown-menu';
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
  useNavigationActions,
  useNavigationStoreApi,
} from '~/navigation/NavigationProvider';
import { useConversationIsRunning } from '~/conversation/store/hooks';
import { useNamedShortcut } from '~/keyboard/hooks';
import { useNow } from '~/lib/hooks/useNow';
import { formatSessionPreviewTimestamp } from '~/lib/time';
import { cn, makePathRelative } from '~/lib/utils';
import { resolveSessionLabel } from '~/lib/workspaces';
import { buildFileDiffStats } from '~/review/diff';
import { useRepoDiff } from '~/review/queries';
import type { ParsedTurnDiffFile } from '~/review/types';
import { ChangesSidebarContent } from '~/workspace/components/ChangesSidebarContent';
import { ChangesSidebarTreeContent } from '~/workspace/components/ChangesSidebarTreeContent';
import { sortThreadsByTimestamp } from '~/workspace/conversations';
import { usePanelManagerStore } from '~/panels/PanelManagerProvider';
import type { DockLayoutNode } from '~/panels/types';
import { getConversationHostId } from '~/panels/host-ids';
import { useActiveConversationSelection } from '~/panels/conversation-selection';

import {
  useWorkspace,
  useWorkspaceActions,
  useWorkspaceKeys,
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
  const queryClient = useQueryClient();
  const { workspacePath, normalizedWorkspacePath } = useWorkspace();
  const { openThreadSwitcher } = useNavigationActions();
  const panelManagerStore = usePanelManagerStore();
  const keys = useWorkspaceKeys();
  const threads = useOpenWorkspaceThreads();
  const { closeThread, loadThread } = useWorkspaceActions();
  const now = useNow();
  const active = useActiveConversationSelection(workspacePath);
  const activeThreadId = active.threadId;
  const activeConversationId = active.conversationId;

  const sessions: ThreadSummary[] = useMemo(
    () => threads.items ?? [],
    [threads.items]
  );
  const threadsError =
    threads.query.error instanceof Error ? threads.query.error : null;

  const handleThreadClick = useCallback(
    (threadId: string, event: ReactMouseEvent<HTMLButtonElement>) => {
      void (async () => {
        const conversationId = await loadThread(threadId);
        if (!conversationId) {
          return;
        }

        const threadTitle =
          sessions.find((item) => item.threadId === threadId)?.title ?? null;

        const hostId = getConversationHostId(workspacePath);
        const state = panelManagerStore.getState();
        const host = state.hosts[hostId] ?? null;
        const editorDock = host?.docks.editor ?? null;
        const root = editorDock?.root ?? null;

        const findFirstGroupId = (node: DockLayoutNode | null): string | null => {
          if (!node) return null;
          if (node.type === 'group') return node.groupId;
          for (const child of node.children) {
            const found = findFirstGroupId(child);
            if (found) return found;
          }
          return null;
        };

        const groupId =
          editorDock?.focusedGroupId ??
          (root?.type === 'group' ? root.groupId : findFirstGroupId(root));

        if (event.shiftKey && groupId) {
          state.actions.splitGroup(hostId, 'editor', groupId, 'row', {
            move: 'none',
          });
        }

        state.actions.open(hostId, 'editor', 'conversation.thread', {
          workspacePath,
          conversationId,
          threadId,
          threadTitle,
        });
      })();
    },
    [loadThread, panelManagerStore, sessions, workspacePath]
  );

  const handleCloseThread = useCallback(
    (threadId: string) => {
      closeThread(threadId);

      const hostId = getConversationHostId(workspacePath);
      const state = panelManagerStore.getState();
      const host = state.hosts[hostId];
      if (!host) {
        return;
      }

      const instanceIds = Object.values(host.instances)
        .filter((instance) => instance.kindId === 'conversation.thread')
        .filter((instance) => {
          const params = instance.params as { threadId?: unknown };
          return params.threadId === threadId;
        })
        .map((instance) => instance.instanceId);

      for (const instanceId of instanceIds) {
        state.actions.close(hostId, instanceId);
      }
    },
    [closeThread, panelManagerStore, workspacePath]
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

      void (async () => {
        const conversationId = await loadThread(data.threadId, { force: true });
        if (!conversationId) return;
        const hostId = getConversationHostId(workspacePath);
        panelManagerStore.getState().actions.open(hostId, 'editor', 'conversation.thread', {
          workspacePath,
          conversationId,
          threadId: data.threadId,
          threadTitle: null,
        });
      })();
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
    openThreadSwitcher();
  }, [openThreadSwitcher]);

  useNamedShortcut('workspace.openSettings', undefined, () => {
    onOpenSettings?.();
    return true;
  });

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
        <ChangesSidebarSection
          key={normalizedWorkspacePath || workspacePath}
          conversationId={activeConversationId ?? null}
          threadTitle={sessions.find((item) => item.threadId === activeThreadId)?.title ?? null}
          workspacePath={workspacePath}
          normalizedWorkspacePath={normalizedWorkspacePath}
          collapsed={isChangesCollapsed}
        />
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
  file: ParsedTurnDiffFile;
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

const REPO_PRESET_UNCOMMITTED = {
  baseRef: 'HEAD',
  targetRef: null,
  includeWorktree: true,
} as const;

const REPO_PRESET_BRANCH = {
  baseRef: 'main',
  targetRef: 'HEAD',
  includeWorktree: false,
} as const;

function normalizeRepoPreset(params: GetRepoDiffParams): GetRepoDiffParams {
  if (params.includeWorktree) {
    return { ...params, ...REPO_PRESET_UNCOMMITTED };
  }
  return { ...params, ...REPO_PRESET_BRANCH };
}

function getRepoPresetLabel(params: GetRepoDiffParams): string {
  return params.includeWorktree ? 'Working tree' : 'Branch';
}

function ChangesSidebarSection({
  conversationId,
  threadTitle,
  workspacePath,
  normalizedWorkspacePath,
  collapsed,
}: {
  conversationId: string | null;
  threadTitle: string | null;
  workspacePath: string;
  normalizedWorkspacePath: string | null;
  collapsed: boolean;
}) {
  type ChangesView = 'list' | 'tree';

  const { openReviewRepo } = useNavigationActions();
  const navigationStore = useNavigationStoreApi();

  const workspaceKey = normalizedWorkspacePath || workspacePath;
  const liveRangeStorageKey = `pasture.changes.liveRange:${workspaceKey}`;
  const viewStorageKey = `pasture.changes.view:${workspaceKey}`;

  const [view, setView] = useState<ChangesView>(() => {
    if (typeof window === 'undefined') {
      return 'list';
    }
    try {
      const stored = window.localStorage.getItem(viewStorageKey);
      if (stored === 'list' || stored === 'tree') {
        return stored;
      }
    } catch {
      // ignore
    }
    return 'list';
  });

  const setViewAndPersist = useCallback(
    (next: ChangesView) => {
      setView(next);
      if (typeof window === 'undefined') {
        return;
      }
      try {
        window.localStorage.setItem(viewStorageKey, next);
      } catch {
        // ignore
      }
    },
    [viewStorageKey]
  );

  const [liveRepoParams, setLiveRepoParams] = useState<GetRepoDiffParams>(
    () => {
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
        return normalizeRepoPreset({
          workspacePath,
          baseRef: typeof parsed.baseRef === 'string' ? parsed.baseRef : 'HEAD',
          targetRef:
            parsed.targetRef === null || typeof parsed.targetRef === 'string'
              ? parsed.targetRef
              : null,
          includeWorktree: Boolean(parsed.includeWorktree),
        });
      } catch {
        return fallback;
      }
    }
  );

  const setLiveRepoParamsAndPersist = useCallback(
    (next: GetRepoDiffParams) => {
      const normalized = normalizeRepoPreset(next);
      setLiveRepoParams(normalized);
      if (typeof window === 'undefined') {
        return;
      }
      try {
        window.localStorage.setItem(
          liveRangeStorageKey,
          JSON.stringify({
            baseRef: normalized.baseRef,
            targetRef: normalized.targetRef,
            includeWorktree: normalized.includeWorktree,
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
    return navigationStore.subscribe(
      (state, prevState) => {
        const event = state.lastEvent;
        if (!event || event === prevState.lastEvent) {
          return;
        }
        const intent = event.intent;
        if (intent.target !== 'review') {
          return;
        }
        if (intent.mode !== 'repo' || !intent.repoParams) {
          return;
        }
        setLiveRepoParamsAndPersist({
          workspacePath,
          baseRef: intent.repoParams.baseRef,
          targetRef: intent.repoParams.targetRef ?? null,
          includeWorktree: intent.repoParams.includeWorktree,
        });
      }
    );
  }, [
    navigationStore,
    setLiveRepoParamsAndPersist,
    workspacePath,
  ]);

  const activeCount = repoProcessedFiles.length;
  const files = repoProcessedFiles;
  const selectionLabel = getRepoPresetLabel(liveRepoParams);

  return (
    <SidebarGroup className="flex min-h-0 flex-1 flex-col pl-2 pr-0 py-2">
      <SidebarGroupLabel className="flex w-full items-center justify-between gap-2">
        <span className="flex min-w-0 items-center gap-2">
          <span>Changes</span>
          <span className="rounded-full bg-muted px-2 py-0.5 text-[10px] font-semibold text-muted-foreground">
            {activeCount}
          </span>
        </span>
        <div className="flex items-center gap-1.5">
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                type="button"
                size="sm"
                variant="ghost"
                className="h-6 min-w-0 justify-between gap-1.5 px-2 text-[11px] text-muted-foreground"
              >
                <span className="min-w-0 truncate">{selectionLabel}</span>
                <ChevronDownIcon className="size-3 shrink-0 opacity-60" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent
              className="min-w-0 w-auto bg-card/95 backdrop-blur-sm border-border/40"
              align="end"
            >
              <DropdownMenuItem
                className="text-xs px-3 py-1.5"
                onSelect={() => {
                  setLiveRepoParamsAndPersist({
                    workspacePath,
                    ...REPO_PRESET_UNCOMMITTED,
                  });
                }}
              >
                Working tree
              </DropdownMenuItem>
              <DropdownMenuItem
                className="text-xs px-3 py-1.5"
                onSelect={() => {
                  setLiveRepoParamsAndPersist({
                    workspacePath,
                    ...REPO_PRESET_BRANCH,
                  });
                }}
              >
                Branch
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>

          <div
            role="group"
            aria-label="Changes view"
            className="shrink-0 flex items-center rounded-md border border-border/60 bg-muted/20 p-0.5"
          >
            <Button
              type="button"
              size="sm"
              variant="ghost"
              className={cn(
                'h-5 w-5 p-0',
                view === 'list'
                  ? 'bg-background text-foreground hover:bg-background'
                  : 'text-muted-foreground hover:text-foreground'
              )}
              aria-pressed={view === 'list'}
              aria-label="List view"
              onClick={() => setViewAndPersist('list')}
            >
              <ListIcon className="size-3.5" />
            </Button>
            <Button
              type="button"
              size="sm"
              variant="ghost"
              className={cn(
                'h-5 w-5 p-0',
                view === 'tree'
                  ? 'bg-background text-foreground hover:bg-background'
                  : 'text-muted-foreground hover:text-foreground'
              )}
              aria-pressed={view === 'tree'}
              aria-label="Tree view"
              onClick={() => setViewAndPersist('tree')}
            >
              <FolderTreeIcon className="size-3.5" />
            </Button>
          </div>
        </div>
      </SidebarGroupLabel>
      {!collapsed ? (
        <SidebarGroupContent className="mt-2 min-h-0 flex-1">
          <ScrollArea
            className="h-full overflow-x-hidden"
            scrollbarClassName="w-1.5"
          >
            <div className="pr-2">
              {view === 'tree' ? (
                <ChangesSidebarTreeContent
                  files={files}
                  emptyStateTitle={
                    repoDiffQuery.query.isPending
                      ? 'Loading changes…'
                      : repoDiffQuery.query.error
                        ? "Couldn't load changes"
                        : liveRepoParams.includeWorktree
                          ? 'No uncommitted changes'
                          : 'No branch changes'
                  }
                  emptyStateDescription={
                    repoDiffQuery.query.error instanceof Error
                      ? repoDiffQuery.query.error.message
                      : liveRepoParams.includeWorktree
                        ? 'Make an edit to see it here.'
                        : 'Commits on this branch that are not in main will appear here.'
                  }
                  emptyStateAction={
                    repoDiffQuery.query.isPending
                      ? undefined
                      : repoDiffQuery.query.error
                        ? {
                            label: 'Try again',
                            onClick: () => {
                              void repoDiffQuery.query.refetch();
                            },
                          }
                        : undefined
                  }
                  onFileClick={(file) => {
                    if (!conversationId) {
                      return;
                    }
                    openReviewRepo({
                      workspacePath,
                      conversationId,
                      repoParams: toRepoParams(liveRepoParams),
                      focusFilePath: file.displayPath,
                      threadTitle,
                    });
                  }}
                />
              ) : (
                <ChangesSidebarContent
                  files={files}
                  emptyStateTitle={
                    repoDiffQuery.query.isPending
                      ? 'Loading changes…'
                      : repoDiffQuery.query.error
                        ? "Couldn't load changes"
                        : liveRepoParams.includeWorktree
                          ? 'No uncommitted changes'
                          : 'No branch changes'
                  }
                  emptyStateDescription={
                    repoDiffQuery.query.error instanceof Error
                      ? repoDiffQuery.query.error.message
                      : liveRepoParams.includeWorktree
                        ? 'Make an edit to see it here.'
                        : 'Commits on this branch that are not in main will appear here.'
                  }
                  emptyStateAction={
                    repoDiffQuery.query.isPending
                      ? undefined
                      : repoDiffQuery.query.error
                        ? {
                            label: 'Try again',
                            onClick: () => {
                              void repoDiffQuery.query.refetch();
                            },
                          }
                        : undefined
                  }
                  onFileClick={(file) => {
                    if (!conversationId) {
                      return;
                    }
                    openReviewRepo({
                      workspacePath,
                      conversationId,
                      repoParams: toRepoParams(liveRepoParams),
                      focusFilePath: file.displayPath,
                      threadTitle,
                    });
                  }}
                />
              )}
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
  onSelect: (threadId: string, event: ReactMouseEvent<HTMLButtonElement>) => void;
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
      onClick={(event) => onSelect(session.threadId, event)}
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
