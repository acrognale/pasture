import { useRouter } from '@tanstack/react-router';
import { useCallback, useEffect, useMemo, useState } from 'react';
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
import { useWorkspaceThreads } from './hooks/useWorkspaceThreads';

export const OPEN_WORKSPACE_THREAD_SWITCHER_EVENT =
  'workspace-thread-switcher-open';

export function WorkspaceConversationSwitcher() {
  const [open, setOpen] = useState(false);
  const router = useRouter();
  const { workspacePath } = useWorkspace();
  const threads = useWorkspaceThreads();

  const items = useMemo(() => threads.items ?? [], [threads.items]);

  const workspaceId = useMemo(
    () => encodeWorkspaceId(workspacePath),
    [workspacePath]
  );

  const handleOpen = useCallback(() => {
    setOpen(true);
    return true;
  }, []);

  useEffect(() => {
    if (typeof window === 'undefined') {
      return;
    }

    const handleEvent = () => setOpen(true);
    window.addEventListener(OPEN_WORKSPACE_THREAD_SWITCHER_EVENT, handleEvent);
    return () => {
      window.removeEventListener(
        OPEN_WORKSPACE_THREAD_SWITCHER_EVENT,
        handleEvent
      );
    };
  }, []);

  useNamedShortcut('workspace.openThreadSwitcher', undefined, handleOpen);

  const handleSelectConversation = useCallback(
    (threadId: string) => {
      setOpen(false);
      void router.navigate({
        to: '/workspaces/$workspaceId/threads/$threadId',
        params: {
          workspaceId,
          threadId,
        },
      });
    },
    [router, workspaceId]
  );

  return (
    <CommandDialog
      open={open}
      onOpenChange={setOpen}
      title="Open thread"
      description="Search for a thread"
    >
      <CommandInput placeholder="Open thread…" />
      <CommandList>
        <CommandEmpty>No sessions found.</CommandEmpty>
        <CommandGroup heading="Sessions">
          {items.map((session) => (
            <CommandItem
              key={session.threadId}
              value={[
                session.preview ?? '',
                session.threadId,
                session.workspacePath,
              ]
                .filter(Boolean)
                .join(' ')}
              onSelect={() => {
                handleSelectConversation(session.threadId);
              }}
            >
              <div className="flex w-full items-center justify-between gap-3">
                <span className="truncate">
                  {formatSessionPreview(session.preview ?? session.threadId)}
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
