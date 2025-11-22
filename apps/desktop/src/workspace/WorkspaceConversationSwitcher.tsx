import { useRouter } from '@tanstack/react-router';
import { useCallback, useMemo, useState } from 'react';
import {
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from '~/components/ui/command';
import { useNamedShortcut } from '~/keyboard/hooks';
import { encodeWorkspaceId } from '~/lib/routing';
import { formatSessionPreviewTimestamp } from '~/lib/time';
import { formatSessionPreview } from '~/lib/workspaces';

import { useWorkspace } from './WorkspaceProvider';
import { useWorkspaceConversations } from './hooks/useWorkspaceConversations';

export function WorkspaceConversationSwitcher() {
  const [open, setOpen] = useState(false);
  const router = useRouter();
  const { workspacePath } = useWorkspace();
  const conversations = useWorkspaceConversations();

  const items = useMemo(() => conversations.items ?? [], [conversations.items]);

  const workspaceId = useMemo(
    () => encodeWorkspaceId(workspacePath),
    [workspacePath]
  );

  const handleOpen = useCallback(() => {
    setOpen(true);
    return true;
  }, []);

  useNamedShortcut('workspace.openConversationSwitcher', undefined, handleOpen);

  const handleSelectConversation = useCallback(
    (conversationId: string) => {
      setOpen(false);
      void router.navigate({
        to: '/workspaces/$workspaceId/conversations/$conversationId',
        params: {
          workspaceId,
          conversationId,
        },
      });
    },
    [router, workspaceId]
  );

  return (
    <CommandDialog
      open={open}
      onOpenChange={setOpen}
      title="Open conversation"
      description="Search for a conversation"
    >
      <CommandInput placeholder="Open session…" />
      <CommandList>
        <CommandEmpty>No sessions found.</CommandEmpty>
        <CommandGroup heading="Sessions">
          {items.map((session) => (
            <CommandItem
              key={session.conversationId}
              value={[
                session.preview ?? '',
                session.conversationId,
                session.cwd,
                session.path,
              ]
                .filter(Boolean)
                .join(' ')}
              onSelect={() => {
                handleSelectConversation(session.conversationId);
              }}
            >
              <div className="flex w-full items-center justify-between gap-3">
                <span className="truncate">
                  {formatSessionPreview(
                    session.preview ?? session.conversationId
                  )}
                </span>
                {session.timestamp ? (
                  <span className="text-transcript-micro text-muted-foreground">
                    {formatSessionPreviewTimestamp(session.timestamp)}
                  </span>
                ) : null}
              </div>
            </CommandItem>
          ))}
        </CommandGroup>
      </CommandList>
    </CommandDialog>
  );
}
