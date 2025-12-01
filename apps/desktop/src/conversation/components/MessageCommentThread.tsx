import { MessageSquareQuoteIcon } from 'lucide-react';
import { Button } from '~/components/ui/button';
import { Textarea } from '~/components/ui/textarea';
import type { MessageComment } from '~/conversation/comments/types';
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

export function MessageCommentThread({
  comments,
  isDraftOpen,
  draftText,
  onCancelDraft,
  onSubmitDraft,
  setDraftText,
  onDeleteComment,
  activeCommentId,
  onCommentHover,
}: MessageCommentThreadProps) {
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

  return (
    <div className="flex flex-col gap-2.5 rounded-lg bg-comment/50 px-3 py-3 border border-comment-accent/20">
      {comments.length > 0 ? (
        <div className="flex flex-col gap-2.5">
          {comments.map((comment, index) => (
            <div key={comment.id} className="relative">
              {/* Thread connector line */}
              {index > 0 && (
                <div className="absolute left-3 -top-2.5 h-2.5 w-0.5 bg-comment-accent/30" />
              )}
              <div
                onMouseEnter={() => onCommentHover(comment.id)}
                onMouseLeave={() => onCommentHover(null)}
                className={cn(
                  // Sticky note aesthetic with left accent border
                  'animate-in fade-in-50 slide-in-from-right-2 duration-200',
                  'rounded-md border-l-[3px] border-l-comment-accent border border-comment-accent/25',
                  'bg-comment px-3 py-2.5 shadow-sm',
                  'transition-all duration-200 ease-out',
                  activeCommentId === comment.id
                    ? 'scale-[1.02] ring-2 ring-comment-accent/60 shadow-md shadow-comment-accent/20 bg-comment'
                    : 'hover:shadow-md hover:bg-comment/80'
                )}
              >
                {/* Comment header with icon */}
                <div className="flex items-start gap-2">
                  <MessageSquareQuoteIcon className="size-3.5 text-comment-accent shrink-0 mt-0.5" />
                  <p className="whitespace-pre-wrap text-transcript-base text-comment-foreground leading-relaxed">
                    {comment.commentText}
                  </p>
                </div>

                {/* Quoted snippet as styled blockquote */}
                <blockquote className="mt-2.5 ml-5.5 border-l-2 border-comment-muted/40 pl-2.5 text-transcript-micro text-comment-muted italic leading-snug">
                  "{comment.selectionPreview || comment.selectionText}"
                </blockquote>

                {/* Actions */}
                <div className="mt-2 flex items-center justify-end">
                  <Button
                    type="button"
                    size="sm"
                    variant="ghost"
                    className="h-6 px-1.5 text-transcript-micro text-comment-muted hover:text-comment-foreground hover:bg-comment-accent/10"
                    onClick={() => onDeleteComment(comment.id)}
                  >
                    Remove
                  </Button>
                </div>
              </div>
            </div>
          ))}
        </div>
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
            placeholder="Add your annotation..."
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
