import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useRouter, useRouterState } from '@tanstack/react-router';
import { Loader2Icon, PlusIcon, SearchIcon, XIcon } from 'lucide-react';
import { useCallback, useMemo, useState } from 'react';
import type { FocusEvent } from 'react';
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
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarMenuSkeleton,
} from '~/components/ui/sidebar';
import { useConversationIsRunning } from '~/conversation/store/hooks';
import { useNamedShortcut } from '~/keyboard/hooks';
import { encodeWorkspaceId } from '~/lib/routing';
import { formatSessionPreviewTimestamp } from '~/lib/time';
import { formatSessionPreview } from '~/lib/workspaces';
import { sortConversationsByTimestamp } from '~/workspace/conversations';

import { OPEN_WORKSPACE_CONVERSATION_SWITCHER_EVENT } from './WorkspaceConversationSwitcher';
import {
  useWorkspace,
  useWorkspaceConversationStores,
  useWorkspaceKeys,
} from './WorkspaceProvider';
import {
  type WorkspaceConversationsState,
  useOpenWorkspaceConversations,
} from './hooks/useWorkspaceConversations';

export function SidebarPanel() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const { workspacePath, normalizedWorkspacePath } = useWorkspace();
  const keys = useWorkspaceKeys();
  const conversations = useOpenWorkspaceConversations();
  const { closeConversation, clearConversationStore } =
    useWorkspaceConversationStores();
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

  const sessions: ConversationSummary[] = useMemo(
    () => conversations.items ?? [],
    [conversations.items]
  );
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

  const navigateToConversation = useCallback(
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

  const handleCloseConversation = useCallback(
    (conversationId: string) => {
      closeConversation(conversationId);
      clearConversationStore(conversationId);

      if (activeConversationId === conversationId) {
        const nextConversation = sessions.find(
          (session: ConversationSummary) =>
            session.conversationId !== conversationId
        );
        if (nextConversation) {
          navigateToConversation(nextConversation.conversationId);
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
      activeConversationId,
      clearConversationStore,
      closeConversation,
      navigateToConversation,
      router,
      sessions,
      workspacePath,
    ]
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

  const handleOpenConversationSelector = useCallback(() => {
    if (typeof window === 'undefined') {
      return;
    }
    window.dispatchEvent(new Event(OPEN_WORKSPACE_CONVERSATION_SWITCHER_EVENT));
  }, []);

  return (
    <div className="flex h-full flex-col">
      <ScrollArea className="flex min-h-0 flex-1 flex-col bg-card/60">
        <SidebarGroup className="px-2 py-2">
          <SidebarGroupLabel className="flex items-center justify-between gap-2">
            <span>Sessions</span>
            <div className="flex items-center gap-1">
              <Button
                size="sm"
                variant="ghost"
                className="shrink-0 h-7 px-2 text-xs"
                onClick={handleStartNewSession}
                disabled={newConversationMutation.isPending}
              >
                {newConversationMutation.isPending ? (
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
                      onClose={handleCloseConversation}
                    />
                  ))}
                </SidebarMenu>
              </>
            ) : (
              <div className="px-2 space-y-1 text-xs text-muted-foreground">
                <span>
                  No open sessions in this workspace. Start a new session or
                  open one with CmdOrCtrl+P to begin.
                </span>
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
  onClose: (conversationId: string) => void;
};

function SidebarConversationMenuItem({
  session,
  isActive,
  onSelect,
  onClose,
}: SidebarConversationMenuItemProps) {
  const isRunning = useConversationIsRunning(session.conversationId);
  const [isHovered, setIsHovered] = useState(false);

  const showCloseButton = !isRunning && isHovered;

  const handleBlur = useCallback((event: FocusEvent<HTMLButtonElement>) => {
    if (!event.currentTarget.contains(event.relatedTarget as Node | null)) {
      setIsHovered(false);
    }
  }, []);

  return (
    <SidebarMenuItem>
      <SidebarMenuButton
        type="button"
        onClick={() => onSelect(session.conversationId)}
        isActive={isActive}
        onMouseEnter={() => setIsHovered(true)}
        onMouseLeave={() => setIsHovered(false)}
        onFocus={() => setIsHovered(true)}
        onBlur={handleBlur}
      >
        <div className="flex flex-1 items-center justify-between gap-2">
          <span className="flex items-center gap-2 min-w-0">
            {isRunning ? (
              <Loader2Icon className="size-4 shrink-0 animate-spin text-muted-foreground" />
            ) : null}
            <span className="truncate text-sm font-medium">
              {formatSessionPreview(session.preview ?? session.conversationId)}
            </span>
          </span>
          <span className="flex items-center">
            {session.timestamp ? (
              <span className="text-transcript-micro text-muted-foreground">
                {formatSessionPreviewTimestamp(session.timestamp)}
              </span>
            ) : null}
            {showCloseButton ? (
              <Button
                variant="ghost"
                size="icon"
                className="ml-2 h-6 w-6 shrink-0"
                onClick={(event) => {
                  event.stopPropagation();
                  onClose(session.conversationId);
                }}
                aria-label="Close session"
              >
                <span className="sr-only">Close session</span>
                <XIcon className="h-4 w-4" />
              </Button>
            ) : null}
          </span>
        </div>
      </SidebarMenuButton>
    </SidebarMenuItem>
  );
}
