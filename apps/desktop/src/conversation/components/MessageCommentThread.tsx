import type { MessageComment } from '@pasture/protocol';
import { MessageSquareQuoteIcon } from 'lucide-react';
import {
  useEffect,
  useImperativeHandle,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { forwardRef } from 'react';
import type { ForwardedRef } from 'react';
import { Button } from '~/components/ui/button';
import { Textarea } from '~/components/ui/textarea';
import { cn } from '~/lib/utils';

export type MessageCommentThreadProps = {
  comments: MessageComment[];
  isDraftOpen: boolean;
  draftText: string;
  onCancelDraft: () => void;
  onSubmitDraft: () => boolean;
  setDraftText: (value: string) => void;
  onDeleteComment: (id: string) => void;
  activeCommentId: string | null;
  onCommentHover: (id: string | null) => void;
  anchorsById?: Record<string, number>;
};

export type MessageCommentThreadHandle = {
  expandResolved: () => void;
};

const DRAFT_ANCHOR_ID = '__draft__';

function MessageCommentThreadInner(
  {
    comments,
    isDraftOpen,
    draftText,
    onCancelDraft,
    onSubmitDraft,
    setDraftText,
    onDeleteComment,
    activeCommentId,
    onCommentHover,
    anchorsById = {},
  }: MessageCommentThreadProps,
  ref: ForwardedRef<MessageCommentThreadHandle>
) {
  const hasUnresolved = comments.some((comment) => !comment.isSubmitted);
  const [showResolvedThread, setShowResolvedThread] = useState(
    () => hasUnresolved || isDraftOpen
  );
  const previousHasUnresolvedRef = useRef(hasUnresolved);
  const listRef = useRef<HTMLDivElement | null>(null);
  const itemRefs = useRef(new Map<string, HTMLDivElement>());
  const [marginsById, setMarginsById] = useState<Record<string, number>>({});
  const draftTextareaRef = useRef<HTMLTextAreaElement | null>(null);

  useEffect(() => {
    const previousHasUnresolved = previousHasUnresolvedRef.current;

    if (hasUnresolved || isDraftOpen) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setShowResolvedThread(true);
    } else if (previousHasUnresolved && !hasUnresolved && !isDraftOpen) {
      setShowResolvedThread(false);
    }

    previousHasUnresolvedRef.current = hasUnresolved;
  }, [hasUnresolved, isDraftOpen]);

  useEffect(() => {
    if (!isDraftOpen) {
      return;
    }

    const raf = requestAnimationFrame(() => {
      draftTextareaRef.current?.focus({ preventScroll: true });
    });

    return () => {
      cancelAnimationFrame(raf);
    };
  }, [isDraftOpen]);

  const handleSubmit = (event: React.FormEvent) => {
    event.preventDefault();
    onSubmitDraft();
  };

  const handleKeyDown = (event: React.KeyboardEvent) => {
    if (event.key === 'Enter' && (event.metaKey || event.ctrlKey)) {
      event.preventDefault();
      onSubmitDraft();
    }
  };

  const showResolvedBubble =
    comments.length > 0 && !hasUnresolved && !isDraftOpen;
  const isCollapsed = showResolvedBubble && !showResolvedThread;

  type ThreadItem =
    | { kind: 'comment'; id: string; comment: MessageComment }
    | { kind: 'draft'; id: string };

  const items = useMemo<ThreadItem[]>(() => {
    const commentItems: ThreadItem[] = comments.map((comment) => ({
      kind: 'comment',
      id: comment.id,
      comment,
    }));
    if (isDraftOpen) {
      commentItems.push({ kind: 'draft' as const, id: DRAFT_ANCHOR_ID });
    }
    return commentItems;
  }, [comments, isDraftOpen]);

  const sortedItems = useMemo(() => {
    const getY = (id: string) => anchorsById[id] ?? Number.POSITIVE_INFINITY;

    return [...items].sort((a, b) => {
      const ay = getY(a.id);
      const by = getY(b.id);
      if (ay !== by) return ay - by;

      if (a.kind === 'comment' && b.kind === 'comment') {
        const ao = a.comment.selectionStartOffset ?? Number.POSITIVE_INFINITY;
        const bo = b.comment.selectionStartOffset ?? Number.POSITIVE_INFINITY;
        if (ao !== bo) return ao - bo;
        return (a.comment.createdAt ?? '').localeCompare(
          b.comment.createdAt ?? ''
        );
      }

      return a.id.localeCompare(b.id);
    });
  }, [anchorsById, items]);

  useLayoutEffect(() => {
    let raf = 0;

    const run = () => {
      const listEl = listRef.current;
      if (!listEl) return;

      if (showResolvedBubble && isCollapsed) {
        setMarginsById({});
        return;
      }

      const scrollEl = listEl.closest(
        '[data-conversation-transcript]'
      ) as HTMLDivElement | null;
      const scrollElTop = scrollEl?.getBoundingClientRect().top ?? 0;
      const scrollTop = scrollEl?.scrollTop ?? 0;

      const listTopViewport = listEl.getBoundingClientRect().top;
      const listTop = scrollEl
        ? listTopViewport - scrollElTop + scrollTop
        : listTopViewport;
      const styles = getComputedStyle(listEl);
      const gap = parseFloat(styles.rowGap || '0') || 0;

      let cursor = 0;
      const next: Record<string, number> = {};

      for (const item of sortedItems) {
        const el = itemRefs.current.get(item.id);
        const height = el?.offsetHeight ?? 0;
        const anchorY = anchorsById[item.id];
        const desiredTop = anchorY != null ? anchorY - listTop : cursor;
        const marginTop = Math.max(desiredTop - cursor, 0);

        next[item.id] = marginTop;
        cursor = cursor + marginTop + height + gap;
      }

      setMarginsById(next);
    };

    raf = requestAnimationFrame(run);

    return () => cancelAnimationFrame(raf);
  }, [anchorsById, sortedItems, showResolvedBubble, isCollapsed]);

  useImperativeHandle(
    ref,
    () => ({
      expandResolved: () => {
        if (showResolvedBubble) {
          setShowResolvedThread(true);
        }
      },
    }),
    [showResolvedBubble]
  );

  return (
    <div className="flex flex-col gap-2.5">
      {comments.length > 0 || isDraftOpen ? (
        <>
          {comments.length > 0 && showResolvedBubble ? (
            <button
              type="button"
              className={cn(
                'inline-flex items-center gap-1.5 self-end rounded-full border border-border/70 bg-muted/70 px-2.5 py-1 text-[11px] font-medium text-muted-foreground',
                'transition-all duration-200 hover:bg-background hover:text-foreground hover:shadow-sm',
                showResolvedThread ? 'opacity-80' : 'opacity-100 shadow-sm'
              )}
              onClick={() => setShowResolvedThread((value) => !value)}
              aria-expanded={showResolvedThread}
              aria-label={`${comments.length} resolved annotations`}
            >
              <MessageSquareQuoteIcon className="size-3" />
              <span className="tabular-nums">{comments.length}</span>
            </button>
          ) : null}

          <div
            className={cn(
              'flex flex-col gap-2.5',
              showResolvedBubble &&
                'overflow-hidden transition-all duration-200',
              showResolvedBubble && isCollapsed
                ? 'max-h-0 opacity-0 pointer-events-none'
                : 'max-h-none opacity-100'
            )}
            ref={listRef}
          >
            {sortedItems.map((item) => {
              const marginTop = marginsById[item.id] ?? 0;
              const isComment = item.kind === 'comment';
              const comment = item.kind === 'comment' ? item.comment : null;

              return (
                <div
                  key={item.id}
                  className="relative transition-[margin-top] duration-200 ease-out"
                  style={{ marginTop }}
                  ref={(node) => {
                    if (!node) {
                      itemRefs.current.delete(item.id);
                    } else {
                      itemRefs.current.set(item.id, node);
                    }
                  }}
                >
                  {isComment && comment ? (
                    <div
                      onMouseEnter={() => onCommentHover(comment.id)}
                      onMouseLeave={() => onCommentHover(null)}
                      className={cn(
                        'animate-in fade-in-50 slide-in-from-right-2 duration-200',
                        'rounded-md border border-border/60 px-3 py-2.5 shadow-sm',
                        'transition-all duration-200 ease-out group',
                        comment.isSubmitted
                          ? 'border-l-[3px] border-l-muted-foreground/70 bg-muted/40 opacity-75'
                          : 'border-l-[3px] border-l-transcript-comment bg-muted/60',
                        activeCommentId === comment.id
                          ? 'scale-[1.01] ring-2 ring-transcript-comment/60 shadow-md shadow-transcript-comment/20 bg-background'
                          : 'hover:shadow-md hover:bg-background'
                      )}
                    >
                      <div className="flex items-start gap-2">
                        <MessageSquareQuoteIcon
                          className={cn(
                            'size-3.5 shrink-0 mt-0.5',
                            comment.isSubmitted
                              ? 'text-muted-foreground'
                              : 'text-transcript-comment'
                          )}
                        />
                        <p className="min-w-0 whitespace-pre-wrap break-words text-transcript-base leading-relaxed">
                          {comment.commentText}
                        </p>
                      </div>

                      <blockquote className="mt-2.5 ml-5 border-l-2 border-muted pl-2.5 text-transcript-micro text-muted-foreground italic leading-snug break-words">
                        "{comment.selectionPreview || comment.selectionText}"
                      </blockquote>

                      <div className="mt-2 flex items-center justify-end">
                        <Button
                          type="button"
                          size="sm"
                          variant="ghost"
                          className="h-6 px-1.5 text-transcript-micro text-muted-foreground hover:text-foreground"
                          onClick={() => onDeleteComment(comment.id)}
                        >
                          Remove
                        </Button>
                      </div>
                    </div>
                  ) : (
                    <form
                      className="flex flex-col gap-3 rounded-md border border-border/60 bg-muted/50 p-3"
                      onSubmit={handleSubmit}
                    >
                      <Textarea
                        ref={draftTextareaRef}
                        value={draftText}
                        rows={3}
                        className="resize-none bg-background border-border/60 focus:border-ring"
                        onChange={(event) => setDraftText(event.target.value)}
                        onKeyDown={handleKeyDown}
                        placeholder="Add your comment..."
                      />
                      <div className="flex items-center justify-end gap-2 text-xs">
                        <Button
                          type="button"
                          size="sm"
                          variant="ghost"
                          className="text-muted-foreground hover:text-foreground"
                          onClick={onCancelDraft}
                        >
                          Cancel
                        </Button>
                        <Button
                          type="submit"
                          size="sm"
                          disabled={!draftText.trim()}
                        >
                          Save comment
                        </Button>
                      </div>
                    </form>
                  )}
                </div>
              );
            })}
          </div>
        </>
      ) : null}
    </div>
  );
}

export const MessageCommentThread = forwardRef(MessageCommentThreadInner);
