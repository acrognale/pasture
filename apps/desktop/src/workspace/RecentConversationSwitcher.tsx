import { useRouter, useRouterState } from '@tanstack/react-router';
import { Clock3Icon, MessagesSquareIcon } from 'lucide-react';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { useNamedShortcut } from '~/keyboard/hooks';
import { useNow } from '~/lib/hooks/useNow';
import { encodeWorkspaceId } from '~/lib/routing';
import { formatSessionPreviewTimestamp } from '~/lib/time';
import { cn } from '~/lib/utils';
import { formatSessionPreview, resolveSessionLabel } from '~/lib/workspaces';

import { useWorkspace } from './WorkspaceProvider';
import { useWorkspaceRecentConversations } from './hooks/useWorkspaceRecentConversations';

type Direction = 1 | -1;

export function RecentConversationSwitcher() {
  const router = useRouter();
  const { workspacePath } = useWorkspace();
  const now = useNow();
  const recent = useWorkspaceRecentConversations();
  const [open, setOpen] = useState(false);
  const [highlightIndex, setHighlightIndex] = useState(0);

  const workspaceId = useMemo(
    () => encodeWorkspaceId(workspacePath),
    [workspacePath]
  );

  const currentThreadId = useRouterState({
    select: (state) =>
      state.matches.find(
        (match) =>
          match.routeId === '/workspaces/$workspaceId/threads/$threadId'
      )?.params?.threadId,
  });

  const items = recent.slice(0, 15);
  const activeIndex =
    items.length === 0 ? 0 : Math.min(highlightIndex, items.length - 1);

  const close = useCallback(() => {
    setOpen(false);
    setHighlightIndex(0);
  }, []);

  const commitSelection = useCallback(async () => {
    if (!open || recent.length === 0) {
      close();
      return;
    }

    const target = recent[activeIndex] ?? recent[0];
    if (!target) {
      close();
      return;
    }

    close();
    await router.navigate({
      to: '/workspaces/$workspaceId/threads/$threadId',
      params: {
        workspaceId,
        threadId: target.threadId,
      },
    });
  }, [activeIndex, close, open, recent, router, workspaceId]);

  const cycle = useCallback(
    (direction: Direction) => {
      if (recent.length === 0) {
        return false;
      }

      const currentIndex = recent.findIndex(
        (item) => item.threadId === currentThreadId
      );
      const baseIndex =
        open && recent[highlightIndex]
          ? highlightIndex
          : currentIndex >= 0
            ? currentIndex
            : 0;
      const nextIndex = (baseIndex + direction + recent.length) % recent.length;

      setOpen(true);
      setHighlightIndex(nextIndex);
      return true;
    },
    [currentThreadId, highlightIndex, open, recent]
  );

  const handleNext = useCallback(() => cycle(1), [cycle]);
  const handlePrev = useCallback(() => cycle(-1), [cycle]);

  useNamedShortcut('conversation.recentNext', { allowRepeat: true }, () =>
    handleNext()
  );
  useNamedShortcut('conversation.recentPrev', { allowRepeat: true }, () =>
    handlePrev()
  );

  useEffect(() => {
    if (!open) {
      return;
    }

    const handleKeyUp = (event: KeyboardEvent) => {
      if (event.key === 'Control') {
        event.preventDefault();
        void commitSelection();
      }
      if (event.key === 'Escape') {
        event.preventDefault();
        close();
      }
    };

    window.addEventListener('keyup', handleKeyUp, true);
    return () => {
      window.removeEventListener('keyup', handleKeyUp, true);
    };
  }, [close, commitSelection, open]);

  useEffect(() => {
    if (!open) {
      return;
    }
    const handleVisibilityChange = () => {
      if (document.hidden) {
        close();
      }
    };
    document.addEventListener('visibilitychange', handleVisibilityChange);
    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, [close, open]);

  if (items.length === 0) {
    return null;
  }

  return (
    <>
      {open ? (
        <div
          className={cn(
            'pointer-events-none fixed inset-0 z-50 flex items-center justify-center transition-opacity duration-150',
            open ? 'opacity-100' : 'opacity-0'
          )}
          aria-hidden={!open}
        >
          <div className="pointer-events-auto w-[520px] max-w-[90vw] rounded-xl border border-border bg-card/90 shadow-2xl backdrop-blur">
            <div className="flex items-center justify-between border-b border-border px-4 py-3">
              <div className="text-sm font-semibold text-foreground">
                Recent conversations
              </div>
              <div className="text-xs text-muted-foreground">
                Ctrl+Tab to cycle, release Ctrl to switch
              </div>
            </div>
            <div className="max-h-[360px] overflow-y-auto px-2 py-2">
              {items.map((item, index) => {
                const { text, source } = resolveSessionLabel(
                  item.title,
                  item.preview,
                  item.threadId
                );
                const preview =
                  source === 'preview'
                    ? formatSessionPreview(item.preview)
                    : item.preview;
                const isActive = open && index === activeIndex;

                return (
                  <button
                    key={item.threadId}
                    type="button"
                    className={cn(
                      'w-full rounded-lg border border-transparent px-3 py-3 text-left transition',
                      isActive
                        ? 'bg-accent text-accent-foreground shadow-sm'
                        : 'hover:bg-muted'
                    )}
                    onMouseEnter={() => setHighlightIndex(index)}
                    onClick={() => {
                      setHighlightIndex(index);
                      void commitSelection();
                    }}
                  >
                    <div className="flex items-center justify-between gap-3">
                      <div className="min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="truncate text-sm font-semibold leading-snug">
                            {text}
                          </span>
                          {item.conversationCount > 1 ? (
                            <span className="flex items-center gap-1 rounded-md bg-muted px-2 py-0.5 text-[11px] font-medium text-muted-foreground">
                              <MessagesSquareIcon className="h-3.5 w-3.5" />
                              {item.conversationCount}
                            </span>
                          ) : null}
                        </div>
                        {preview ? (
                          <div className="truncate text-sm text-muted-foreground">
                            {formatSessionPreview(preview)}
                          </div>
                        ) : null}
                      </div>
                      <div className="flex shrink-0 items-center gap-1 text-transcript-micro text-muted-foreground">
                        <Clock3Icon className="h-3.5 w-3.5" />
                        {formatSessionPreviewTimestamp(item.timestamp, now)}
                      </div>
                    </div>
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}
