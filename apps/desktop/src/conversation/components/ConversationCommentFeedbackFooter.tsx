import type { MessageComment } from '@pasture/protocol';
import { MessageSquareIcon } from 'lucide-react';
import { Button } from '~/components/ui/button';

type ConversationCommentFeedbackFooterProps = {
  comments: readonly MessageComment[];
  onInsertFeedback: () => void;
};

export function ConversationCommentFeedbackFooter({
  comments,
  onInsertFeedback,
}: ConversationCommentFeedbackFooterProps) {
  if (!comments.length) {
    return null;
  }

  const count = comments.length;

  return (
    <div className="flex items-center justify-between rounded-md border border-border/60 bg-muted/50 px-3 py-2 text-xs">
      <div className="flex items-center gap-2 text-muted-foreground">
        <MessageSquareIcon className="size-4" />
        <span>
          {count} comment{count === 1 ? '' : 's'} on agent messages
        </span>
      </div>
      <Button
        type="button"
        size="sm"
        className="h-7"
        onClick={onInsertFeedback}
      >
        Insert review as message
      </Button>
    </div>
  );
}
