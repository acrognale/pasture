import type { ParsedTurnDiffLine, TurnReviewComment } from '../types';
import { CommentThread } from './CommentThread';
import { DiffLineCell } from './DiffLineCell';

export type DiffLineProps = {
  line: ParsedTurnDiffLine;
  comments: TurnReviewComment[];
  isDraftOpen: boolean;
  draftText: string;
  onOpenDraft: (lineId: string) => void;
  onCancelDraft: () => void;
  onSubmitDraft: (lineId: string) => void;
  setDraftText: (value: string) => void;
  onDeleteComment: (id: string) => void;
};

export function DiffLine({
  line,
  comments,
  isDraftOpen,
  draftText,
  onOpenDraft,
  onCancelDraft,
  onSubmitDraft,
  setDraftText,
  onDeleteComment,
}: DiffLineProps) {
  const allowComment = line.kind === 'addition' || line.kind === 'removal';

  return (
    <div className="pl-4">
      <DiffLineCell
        line={line}
        primaryLineNumber={line.oldNumber ?? null}
        secondaryLineNumber={line.newNumber ?? null}
        allowComment={allowComment}
        onOpenDraft={onOpenDraft}
      />
      {comments.length > 0 || isDraftOpen ? (
        <div className="grid grid-cols-[30px_30px_4px_minmax(0,1fr)] items-start gap-x-2">
          <div />
          <div />
          <div />
          <div className="mt-2">
            <CommentThread
              lineId={line.id}
              comments={comments}
              isDraftOpen={isDraftOpen}
              draftText={draftText}
              onCancelDraft={onCancelDraft}
              onSubmitDraft={onSubmitDraft}
              setDraftText={setDraftText}
              onDeleteComment={onDeleteComment}
            />
          </div>
        </div>
      ) : null}
    </div>
  );
}
