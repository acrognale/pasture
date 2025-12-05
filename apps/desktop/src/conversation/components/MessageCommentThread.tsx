import type { MessageComment } from '@pasture/protocol';
import { MessageSquareQuoteIcon } from 'lucide-react';
import { useEffect, useImperativeHandle, useRef, useState } from 'react';
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
};

export type MessageCommentThreadHandle = {
  expandResolved: () => void;
};

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
  }: MessageCommentThreadProps,
  ref: ForwardedRef<MessageCommentThreadHandle>
) {
  const hasUnresolved = comments.some((comment) => !comment.isSubmitted);
  const [showResolvedThread, setShowResolvedThread] = useState(
    () => hasUnresolved || isDraftOpen
  );
  const previousHasUnresolvedRef = useRef(hasUnresolved);

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
      {comments.length > 0 ? (
        <>
          {showResolvedBubble ? (
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
          >
            {comments.map((comment, index) => (
              <div key={comment.id} className="relative">
                {/* Thread connector line */}
                {index > 0 && (
                  <div className="absolute left-3 -top-2.5 h-2.5 w-0.5 bg-warning-foreground/30" />
                )}
                <div
                  onMouseEnter={() => onCommentHover(comment.id)}
                  onMouseLeave={() => onCommentHover(null)}
                  className={cn(
                    'animate-in fade-in-50 slide-in-from-right-2 duration-200',
                    'rounded-md border border-border/60 px-3 py-2.5 shadow-sm',
                    'transition-all duration-200 ease-out group',
                    comment.isSubmitted
                      ? 'border-l-[3px] border-l-muted-foreground/70 bg-muted/40 opacity-75'
                      : 'border-l-[3px] border-l-warning-foreground bg-muted/60',
                    activeCommentId === comment.id
                      ? 'scale-[1.01] ring-2 ring-warning-foreground/60 shadow-md shadow-warning-foreground/20 bg-background'
                      : 'hover:shadow-md hover:bg-background'
                  )}
                >
                  {/* Comment header with icon */}
                  <div className="flex items-start gap-2">
                    <MessageSquareQuoteIcon
                      className={cn(
                        'size-3.5 shrink-0 mt-0.5',
                        comment.isSubmitted
                          ? 'text-muted-foreground'
                          : 'text-warning-foreground'
                      )}
                    />
                    <p className="min-w-0 whitespace-pre-wrap break-words text-transcript-base leading-relaxed">
                      {comment.commentText}
                    </p>
                  </div>

                  {/* Quoted snippet as styled blockquote */}
                  <blockquote className="mt-2.5 ml-5 border-l-2 border-muted pl-2.5 text-transcript-micro text-muted-foreground italic leading-snug break-words">
                    "{comment.selectionPreview || comment.selectionText}"
                  </blockquote>

                  {/* Actions */}
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
              </div>
            ))}
          </div>
        </>
      ) : null}
      {isDraftOpen ? (
        <form
          className="flex flex-col gap-3 rounded-md border border-border/60 bg-muted/50 p-3"
          onSubmit={handleSubmit}
        >
          <Textarea
            value={draftText}
            rows={3}
            className="resize-none bg-background border-border/60 focus:border-ring"
            onChange={(event) => setDraftText(event.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Add your comment..."
            autoFocus
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
            <Button type="submit" size="sm" disabled={!draftText.trim()}>
              Save comment
            </Button>
          </div>
        </form>
      ) : null}
    </div>
  );
}

export const MessageCommentThread = forwardRef(MessageCommentThreadInner);
