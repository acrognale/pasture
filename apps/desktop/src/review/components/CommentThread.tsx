import { Button } from '~/components/ui/button';
import { Textarea } from '~/components/ui/textarea';

import type { TurnReviewComment } from '../types';

export type CommentThreadProps = {
  lineId: string;
  comments: TurnReviewComment[];
  isDraftOpen: boolean;
  draftText: string;
  onCancelDraft: () => void;
  onSubmitDraft: (lineId: string) => void;
  setDraftText: (value: string) => void;
  onDeleteComment: (id: string) => void;
};

export function CommentThread({
  lineId,
  comments,
  isDraftOpen,
  draftText,
  onCancelDraft,
  onSubmitDraft,
  setDraftText,
  onDeleteComment,
}: CommentThreadProps) {
  return (
    <div className="flex flex-col gap-2 border border-border/70 bg-background px-6 py-4 text-xs">
      {comments.length > 0 ? (
        <div className="flex flex-col gap-2">
          {comments.map((comment) => (
            <div
              key={comment.id}
              className="rounded-md border border-border/60 bg-background/95 p-2"
            >
              <p className="whitespace-pre-wrap text-transcript-base text-foreground">
                {comment.text}
              </p>
              <div className="mt-2 flex items-center justify-between text-[10px] text-muted-foreground">
                <span>
                  Line {comment.newLineNumber ?? comment.oldLineNumber ?? '?'}
                </span>
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
        <form
          className="flex flex-col gap-4"
          onSubmit={(event) => {
            event.preventDefault();
            onSubmitDraft(lineId);
          }}
        >
          <Textarea
            value={draftText}
            rows={3}
            className="resize-none"
            onChange={(event) => setDraftText(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === 'Enter' && (event.metaKey || event.ctrlKey)) {
                event.preventDefault();
                onSubmitDraft(lineId);
              }
            }}
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
