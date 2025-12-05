import type { NewThreadResponse } from '@pasture/protocol';
import type { ThreadSummary } from '@pasture/protocol';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useRouter, useRouterState } from '@tanstack/react-router';
import {
  Loader2Icon,
  PlusIcon,
  SearchIcon,
  SettingsIcon,
  XIcon,
} from 'lucide-react';
import { useCallback, useMemo, useState } from 'react';
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
import { dispatchOpenReviewOverlayEvent } from '~/conversation/events';
import {
  useConversationHasTurnDiffHistory,
  useConversationIsRunning,
  useConversationLatestTurnDiff,
  useConversationTurnDiffHistory,
} from '~/conversation/store/hooks';
import { useNamedShortcut } from '~/keyboard/hooks';
import { useNow } from '~/lib/hooks/useNow';
import { encodeWorkspaceId } from '~/lib/routing';
import { formatSessionPreviewTimestamp } from '~/lib/time';
import { makePathRelative } from '~/lib/utils';
import { resolveSessionLabel } from '~/lib/workspaces';
import { buildFileDiffStats, parseUnifiedDiff } from '~/review/diff';
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
  const hasReviewHistory = useConversationHasTurnDiffHistory(
    conversationIdForDiffs
  );
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
      <ScrollArea className="flex min-h-0 min-w-0 flex-1 flex-col overflow-x-hidden bg-card/60">
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
          <SidebarGroup className="px-2 py-2">
            <SidebarGroupLabel className="flex w-full items-center justify-between gap-2">
              <span className="flex items-center gap-2">
                <span>Changes</span>
                <span className="rounded-full bg-muted px-2 py-0.5 text-[10px] font-semibold text-muted-foreground">
                  {processedFiles.length}
                </span>
              </span>
              {hasReviewHistory ? (
                <Button
                  type="button"
                  size="sm"
                  variant="ghost"
                  className="h-7 px-2 text-[11px]"
                  onClick={() => {
                    dispatchOpenReviewOverlayEvent(activeConversationId);
                  }}
                >
                  View All
                </Button>
              ) : null}
            </SidebarGroupLabel>
            {!isChangesCollapsed ? (
              <SidebarGroupContent className="mt-2">
                <ChangesSidebarContent
                  files={processedFiles}
                  onFileClick={(file) => {
                    dispatchOpenReviewOverlayEvent(
                      activeConversationId,
                      file.displayPath
                    );
                  }}
                />
              </SidebarGroupContent>
            ) : null}
          </SidebarGroup>
        ) : null}
      </ScrollArea>
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
