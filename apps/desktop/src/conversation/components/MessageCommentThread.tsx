import { Button } from '~/components/ui/button';
import { Textarea } from '~/components/ui/textarea';
import type { MessageComment } from '~/conversation/comments/types';

export type MessageCommentThreadProps = {
  comments: MessageComment[];
  isDraftOpen: boolean;
  draftText: string;
  onCancelDraft: () => void;
  onSubmitDraft: () => boolean;
  setDraftText: (value: string) => void;
  onDeleteComment: (id: string) => void;
};

export function MessageCommentThread({
  comments,
  isDraftOpen,
  draftText,
  onCancelDraft,
  onSubmitDraft,
  setDraftText,
  onDeleteComment,
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
    <div className="flex flex-col gap-2 border border-border/60 bg-muted/40 px-4 py-3 rounded-md">
      {comments.length > 0 ? (
        <div className="flex flex-col gap-2">
          {comments.map((comment) => (
            <div
              key={comment.id}
              className="rounded-md border border-border/60 bg-background px-3 py-2"
            >
              <p className="whitespace-pre-wrap text-transcript-base text-foreground">
                {comment.commentText}
              </p>
              <p className="mt-1 text-[10px] text-muted-foreground">
                Snippet: “{comment.selectionPreview || comment.selectionText}”
              </p>
              <div className="mt-2 flex items-center justify-end text-[10px] text-muted-foreground">
                <Button
                  type="button"
                  size="sm"
                  variant="ghost"
                  className="h-6 px-1 text-[10px]"
                  onClick={() => onDeleteComment(comment.id)}
                >
                  Remove
                </Button>
              </div>
            </div>
          ))}
        </div>
      ) : null}
      {isDraftOpen ? (
        <form className="flex flex-col gap-3" onSubmit={handleSubmit}>
          <Textarea
            value={draftText}
            rows={3}
            className="resize-none"
            onChange={(event) => setDraftText(event.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Add a comment"
          />
          <div className="flex items-center justify-end gap-2 text-xs">
            <Button
              type="button"
              size="sm"
              variant="ghost"
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
