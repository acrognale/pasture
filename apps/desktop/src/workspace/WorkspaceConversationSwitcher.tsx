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
import { useNow } from '~/lib/hooks/useNow';
import { encodeWorkspaceId } from '~/lib/routing';
import { formatSessionPreviewTimestamp } from '~/lib/time';
import { resolveSessionLabel } from '~/lib/workspaces';

import { useWorkspace } from './WorkspaceProvider';
import { useWorkspaceThreads } from './hooks/useWorkspaceThreads';

export const OPEN_WORKSPACE_THREAD_SWITCHER_EVENT =
  'workspace-thread-switcher-open';

export function WorkspaceConversationSwitcher() {
  const [open, setOpen] = useState(false);
  const router = useRouter();
  const { workspacePath } = useWorkspace();
  const threads = useWorkspaceThreads();
  const now = useNow();

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
          {items.map((session) => {
            const { text, source } = resolveSessionLabel(
              session.title,
              session.preview,
              session.threadId
            );

            return (
              <CommandItem
                key={session.threadId}
                value={[
                  session.title ?? '',
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
                  <span
                    className={`text-sm font-medium leading-snug ${source === 'title' ? '' : 'truncate'}`}
                  >
                    {text}
                  </span>
                  {session.timestamp ? (
                    <span className="shrink-0 text-transcript-micro text-muted-foreground">
                      {formatSessionPreviewTimestamp(session.timestamp, now)}
                    </span>
                  ) : null}
                </div>
              </CommandItem>
            );
          })}
        </CommandGroup>
      </CommandList>
    </CommandDialog>
  );
}
