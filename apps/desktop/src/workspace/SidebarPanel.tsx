import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useRouter, useRouterState } from '@tanstack/react-router';
import { Loader2Icon, PlusIcon } from 'lucide-react';
import { useCallback, useMemo } from 'react';
import { toast } from 'sonner';
import type { ConversationSummary } from '~/codex.gen/ConversationSummary';
import type { NewConversationResponse } from '~/codex.gen/NewConversationResponse';
import { Codex } from '~/codex/client';
import { Button } from '~/components/ui/button';
import { ScrollArea } from '~/components/ui/scroll-area';
import {
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarMenuSkeleton,
} from '~/components/ui/sidebar';
import { useConversationIsRunning } from '~/conversation/store/hooks';
import { useNamedShortcut } from '~/keyboard/hooks';
import { encodeWorkspaceId } from '~/lib/routing';
import { formatSessionPreviewTimestamp } from '~/lib/time';
import { formatSessionPreview, formatWorkspaceLabel } from '~/lib/workspaces';
import { sortConversationsByTimestamp } from '~/workspace/conversations';

import { useWorkspace, useWorkspaceKeys } from './WorkspaceProvider';
import {
  type WorkspaceConversationsState,
  useWorkspaceConversations,
} from './hooks/useWorkspaceConversations';

export function SidebarPanel() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const { workspacePath, normalizedWorkspacePath } = useWorkspace();
  const keys = useWorkspaceKeys();
  const conversations = useWorkspaceConversations();
  const conversationMatch = useRouterState({
    select: (state) =>
      state.matches.find(
        (match) =>
          match.routeId ===
          '/workspaces/$workspaceId/conversations/$conversationId'
      ),
  });
  const activeConversationId =
    typeof conversationMatch?.params?.conversationId === 'string'
      ? conversationMatch.params.conversationId
      : null;

  const workspaceName = useMemo(
    () => formatWorkspaceLabel(workspacePath),
    [workspacePath]
  );

  const sessions = conversations.items ?? [];
  const hasMoreSessions = conversations.hasMore ?? false;
  const isLoadingMore = conversations.isLoadingMore ?? false;
  const conversationsError =
    conversations.query.error instanceof Error
      ? conversations.query.error
      : null;

  const handleConversationClick = useCallback(
    (conversationId: string) => {
      void router.navigate({
        to: '/workspaces/$workspaceId/conversations/$conversationId',
        params: {
          workspaceId: encodeWorkspaceId(workspacePath),
          conversationId,
        },
      });
    },
    [router, workspacePath]
  );

  const newConversationMutation = useMutation({
    mutationFn: async (): Promise<NewConversationResponse> => {
      return await Codex.newConversation({
        workspacePath,
        options: null,
      });
    },
    onSuccess: (data) => {
      const optimisticSummary: ConversationSummary = {
        conversationId: data.conversationId,
        path: data.rolloutPath ?? '',
        cwd: normalizedWorkspacePath || workspacePath,
        preview: 'New session',
        timestamp: new Date().toISOString(),
      };

      queryClient.setQueryData<WorkspaceConversationsState | undefined>(
        keys.conversations(),
        (state) => {
          const existingItems =
            state?.items.filter(
              (item) => item.conversationId !== optimisticSummary.conversationId
            ) ?? [];

          return {
            items: sortConversationsByTimestamp([
              optimisticSummary,
              ...existingItems,
            ]),
            nextCursor: state?.nextCursor ?? null,
          };
        }
      );

      void router.navigate({
        to: '/workspaces/$workspaceId/conversations/$conversationId',
        params: {
          workspaceId: encodeWorkspaceId(workspacePath),
          conversationId: data.conversationId,
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
    newConversationMutation.mutate();
  }, [newConversationMutation]);

  const newConversationShortcutOverrides = useMemo(
    () => ({
      enabled: () => !newConversationMutation.isPending,
      when: (event: KeyboardEvent) => !event.altKey && !event.shiftKey,
    }),
    [newConversationMutation.isPending]
  );

  const handleNewConversationShortcut = useCallback(() => {
    if (newConversationMutation.isPending) {
      return false;
    }
    handleStartNewSession();
    return true;
  }, [handleStartNewSession, newConversationMutation.isPending]);

  useNamedShortcut(
    'workspace.newConversation',
    newConversationShortcutOverrides,
    handleNewConversationShortcut
  );

  const handleLoadMoreSessions = () => {
    void conversations.loadMore?.();
  };

  return (
    <div className="flex h-full flex-col">
      <SidebarHeader
        className="border-b border-border/60 pb-3 pl-4"
        data-tauri-drag-region="true"
      >
        <div
          className="space-y-3"
          style={{ paddingTop: '8px' }}
          data-tauri-drag-region="true"
        >
          <div
            className="flex justify-end gap-3"
            style={{ paddingLeft: '68px' }}
            data-tauri-drag-region="true"
          >
            <Button
              size="sm"
              variant="outline"
              className="shrink-0 text-xs h-7 px-2.5"
              onClick={handleStartNewSession}
              disabled={newConversationMutation.isPending}
              data-tauri-drag-region="false"
            >
              {newConversationMutation.isPending ? (
                <Loader2Icon className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <PlusIcon className="mr-2 h-4 w-4" />
              )}
              New
            </Button>
          </div>
        </div>
      </SidebarHeader>

      <ScrollArea className="flex min-h-0 flex-1 flex-col bg-card/60">
        <SidebarGroup className="px-2 py-2">
          <SidebarGroupLabel>
            Sessions
            <span className="ml-2 text-xs font-normal text-muted-foreground">
              {workspaceName}
            </span>
          </SidebarGroupLabel>
          <SidebarGroupContent>
            {conversations.query.isPending ? (
              <SidebarMenu>
                {[1, 2, 3].map((item) => (
                  <SidebarMenuItem key={item}>
                    <SidebarMenuSkeleton showIcon />
                  </SidebarMenuItem>
                ))}
              </SidebarMenu>
            ) : conversationsError ? (
              <div className="px-2 space-y-2 text-xs text-destructive">
                <p>Failed to load sessions: {conversationsError.message}</p>
                <Button
                  size="sm"
                  variant="outline"
                  className="w-fit"
                  onClick={() => {
                    void conversations.query.refetch();
                  }}
                >
                  Try again
                </Button>
              </div>
            ) : sessions.length > 0 ? (
              <>
                <SidebarMenu>
                  {sessions.map((session) => (
                    <SidebarConversationMenuItem
                      key={session.conversationId}
                      session={session}
                      isActive={session.conversationId === activeConversationId}
                      onSelect={handleConversationClick}
                    />
                  ))}
                </SidebarMenu>
                {hasMoreSessions && (
                  <div className="px-2 pt-2">
                    <Button
                      size="sm"
                      variant="ghost"
                      className="w-full"
                      onClick={handleLoadMoreSessions}
                      disabled={isLoadingMore}
                    >
                      {isLoadingMore ? 'Loading…' : 'Load more'}
                    </Button>
                  </div>
                )}
              </>
            ) : (
              <div className="px-2 space-y-1 text-xs text-muted-foreground">
                <span>No sessions in this workspace yet.</span>
                <span>Start a new session to begin chatting with Codex.</span>
              </div>
            )}
          </SidebarGroupContent>
        </SidebarGroup>
      </ScrollArea>
    </div>
  );
}

type SidebarConversationMenuItemProps = {
  session: ConversationSummary;
  isActive: boolean;
  onSelect: (conversationId: string) => void;
};

function SidebarConversationMenuItem({
  session,
  isActive,
  onSelect,
}: SidebarConversationMenuItemProps) {
  const isRunning = useConversationIsRunning(session.conversationId);

  return (
    <SidebarMenuItem>
      <SidebarMenuButton
        type="button"
        onClick={() => onSelect(session.conversationId)}
        isActive={isActive}
      >
        <div className="flex flex-1 items-center justify-between gap-2">
          <span className="flex items-center gap-2 min-w-0">
            {isRunning ? (
              <Loader2Icon className="size-3 text-muted-foreground animate-spin shrink-0" />
            ) : null}
            <span className="truncate text-sm font-medium">
              {formatSessionPreview(session.preview ?? session.conversationId)}
            </span>
          </span>
          {session.timestamp ? (
            <span className="text-transcript-micro text-muted-foreground">
              {formatSessionPreviewTimestamp(session.timestamp)}
            </span>
          ) : null}
        </div>
      </SidebarMenuButton>
    </SidebarMenuItem>
  );
}
