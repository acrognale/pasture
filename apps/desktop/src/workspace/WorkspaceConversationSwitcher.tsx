import type { SearchThreadsResponse, ThreadSearchHit } from '@pasture/protocol';
import { useQuery } from '@tanstack/react-query';
import { useRouter } from '@tanstack/react-router';
import { Loader2Icon } from 'lucide-react';
import { memo, useCallback, useEffect, useMemo, useState } from 'react';
import { Codex } from '~/codex/client';
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
import { cn } from '~/lib/utils';
import { formatSessionPreview, resolveSessionLabel } from '~/lib/workspaces';
import { useNavigation, useNavigationActions } from '~/navigation/NavigationProvider';

import { useWorkspace } from './WorkspaceProvider';
import { useWorkspaceThreads } from './hooks/useWorkspaceThreads';

type ThreadRowData = {
  threadId: string;
  title?: string | null;
  preview?: string | null;
  timestamp?: string | null;
};

type ThreadRowProps = {
  thread: ThreadRowData;
  now: ReturnType<typeof useNow>;
};

const ThreadRow = memo(function ThreadRow({ thread, now }: ThreadRowProps) {
  const { text, source } = resolveSessionLabel(
    thread.title,
    thread.preview,
    thread.threadId
  );
  const normalizedPreview = thread.preview?.trim() ?? '';
  const shouldShowPreview =
    normalizedPreview.length > 0 && source !== 'preview';

  return (
    <div className="flex w-full items-center justify-between gap-3">
      <div className="flex min-w-0 items-center gap-2">
        <span
          className={cn(
            'text-sm font-medium leading-snug',
            source === 'title' ? null : 'truncate'
          )}
        >
          {text}
        </span>
        {shouldShowPreview ? (
          <span className="truncate text-sm font-normal leading-snug text-muted-foreground">
            {formatSessionPreview(normalizedPreview)}
          </span>
        ) : null}
      </div>
      {thread.timestamp ? (
        <span className="shrink-0 text-transcript-micro text-muted-foreground">
          {formatSessionPreviewTimestamp(thread.timestamp, now)}
        </span>
      ) : null}
    </div>
  );
});

export function WorkspaceConversationSwitcher() {
  const open = useNavigation((state) => state.threadSwitcherOpen);
  const { openThreadSwitcher, setThreadSwitcherOpen } = useNavigationActions();
  const [query, setQuery] = useState('');
  const [debouncedQuery, setDebouncedQuery] = useState('');
  const router = useRouter();
  const { workspacePath, normalizedWorkspacePath } = useWorkspace();
  const threads = useWorkspaceThreads();
  const now = useNow();

  const items = useMemo(() => threads.items ?? [], [threads.items]);
  const visibleThreads = useMemo(() => {
    // Rendering thousands of `CommandItem`s can freeze the UI (especially when clearing a search
    // query and switching back to the full thread list). Keep this list intentionally small.
    const MAX_VISIBLE = 200;
    return items.slice(0, MAX_VISIBLE);
  }, [items]);

  const handleOpen = useCallback(() => {
    return openThreadSwitcher();
  }, [openThreadSwitcher]);

  useNamedShortcut('workspace.openThreadSwitcher', undefined, handleOpen);

  useEffect(() => {
    const handle = setTimeout(() => {
      setDebouncedQuery(query);
    }, 150);
    return () => {
      clearTimeout(handle);
    };
  }, [query]);

  const inputQuery = query.trim();
  const searchQuery = debouncedQuery.trim();
  const isTypingAhead = inputQuery.length > 0 && inputQuery !== searchQuery;
  const searchEnabled = open && searchQuery.length > 0;
  const searchWorkspacePath = normalizedWorkspacePath ?? workspacePath;

  const search = useQuery<SearchThreadsResponse>({
    queryKey: ['workspace', searchWorkspacePath, 'thread-search', searchQuery],
    queryFn: async () => {
      return Codex.searchThreads({
        workspacePath: searchWorkspacePath,
        query: searchQuery,
        limit: 50,
      });
    },
    enabled: searchEnabled,
    refetchOnWindowFocus: false,
  });
  const searchErrorMessage =
    search.error instanceof Error ? search.error.message : null;

  const handleSelectConversation = useCallback(
    (threadId: string) => {
      setThreadSwitcherOpen(false);
      setQuery('');
      setDebouncedQuery('');
      void router.navigate({
        to: '/workspaces/$workspaceId/threads/$threadId',
        params: { workspaceId: encodeWorkspaceId(workspacePath), threadId },
      });
    },
    [router, setThreadSwitcherOpen, workspacePath]
  );

  const renderSearchSnippet = useCallback((hit: ThreadSearchHit) => {
    if (!hit.snippet) {
      return null;
    }

    return (
      <div
        className="text-xs text-muted-foreground line-clamp-2"
        // Backend escapes all HTML and only injects <b> for highlights.
        dangerouslySetInnerHTML={{ __html: hit.snippet }}
      />
    );
  }, []);

  return (
    <CommandDialog
      open={open}
      onOpenChange={(nextOpen) => {
        setThreadSwitcherOpen(nextOpen);
        if (!nextOpen) {
          setQuery('');
          setDebouncedQuery('');
        }
      }}
      title="Open thread"
      description="Search for a thread"
      commandProps={{ shouldFilter: false }}
    >
      <CommandInput
        placeholder="Search threads…"
        value={query}
        onValueChange={setQuery}
      />
      <CommandList>
        {inputQuery.length > 0 ? (
          <>
            <CommandEmpty>
              {isTypingAhead || search.isFetching
                ? 'Searching…'
                : search.error
                  ? 'Search failed.'
                  : search.data?.isIndexing
                    ? 'Indexing…'
                    : 'No threads found.'}
            </CommandEmpty>
            <CommandGroup heading="Matches">
              {isTypingAhead || search.isFetching ? (
                <CommandItem value="searching" disabled>
                  <Loader2Icon className="size-4 animate-spin" />
                  Searching…
                </CommandItem>
              ) : search.error ? (
                <CommandItem value="search-error" disabled>
                  Search failed
                  {searchErrorMessage ? `: ${searchErrorMessage}` : '.'}
                </CommandItem>
              ) : search.data?.indexError ? (
                <CommandItem value="search-error" disabled>
                  Search failed: {search.data.indexError}
                </CommandItem>
              ) : (
                (search.data?.hits ?? []).map((hit) => {
                  return (
                    <CommandItem
                      key={hit.threadId}
                      // `CommandDialog` has `shouldFilter: false`, so keep this cheap.
                      value={hit.threadId}
                      onSelect={() => {
                        handleSelectConversation(hit.threadId);
                      }}
                    >
                      <div className="flex w-full flex-col gap-1.5">
                        <ThreadRow thread={hit} now={now} />
                        {renderSearchSnippet(hit)}
                      </div>
                    </CommandItem>
                  );
                })
              )}
            </CommandGroup>
          </>
        ) : (
          <>
            <CommandEmpty>No threads found.</CommandEmpty>
            <CommandGroup heading="Threads">
              {visibleThreads.map((session) => {
                return (
                  <CommandItem
                    key={session.threadId}
                    // `CommandDialog` has `shouldFilter: false`, so keep this cheap.
                    value={session.threadId}
                    onSelect={() => {
                      handleSelectConversation(session.threadId);
                    }}
                  >
                    <ThreadRow thread={session} now={now} />
                  </CommandItem>
                );
              })}
              {items.length > visibleThreads.length ? (
                <CommandItem value="threads-truncated" disabled>
                  Showing {visibleThreads.length} of {items.length} threads.
                  Type to search.
                </CommandItem>
              ) : null}
            </CommandGroup>
          </>
        )}
      </CommandList>
    </CommandDialog>
  );
}
