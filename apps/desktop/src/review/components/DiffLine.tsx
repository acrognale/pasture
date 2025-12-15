import type { ParsedTurnDiffLine, TurnReviewComment } from '../types';
import type { HighlightedLine } from '../useFileHighlighting';
import { CommentThread } from './CommentThread';
import { DiffLineCell } from './DiffLineCell';

type DraftLineContext = {
  fileId: string;
  hunkId: string;
  filePath: string;
  line: ParsedTurnDiffLine;
};

export type DiffLineProps = {
  fileId: string;
  filePath: string;
  hunkId: string;
  line: ParsedTurnDiffLine;
  tokens?: HighlightedLine;
  comments: TurnReviewComment[];
  isDraftOpen: boolean;
  draftText: string;
  setDraftText: (value: string) => void;
  onStartDraft: (context: DraftLineContext) => void;
  onCancelDraft: () => void;
  onSubmitDraft: () => boolean;
  onDeleteComment: (id: string) => void;
  focusLineRange?: { start: number; end: number } | null;
};

export function DiffLine({
  fileId,
  filePath,
  hunkId,
  line,
  tokens,
  comments,
  isDraftOpen,
  draftText,
  setDraftText,
  onStartDraft,
  onCancelDraft,
  onSubmitDraft,
  onDeleteComment,
  focusLineRange,
}: DiffLineProps) {
  const allowComment = line.kind === 'addition' || line.kind === 'removal';

  const handleOpenDraft = () => {
    onStartDraft({ fileId, hunkId, filePath, line });
  };

  return (
    <div className="pl-4">
      <DiffLineCell
        filePath={filePath}
        line={line}
        tokens={tokens}
        primaryLineNumber={line.oldNumber ?? null}
        secondaryLineNumber={line.newNumber ?? null}
        allowComment={allowComment}
        onOpenDraft={handleOpenDraft}
        focusLineRange={focusLineRange}
      />
      {comments.length > 0 || isDraftOpen ? (
        <div className="grid grid-cols-[30px_30px_4px_minmax(0,1fr)] items-start gap-x-2">
          <div />
          <div />
          <div />
          <div className="mt-2">
            <CommentThread
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
