import type { SplitDiffRow } from '../diff-utils';
import type { FileHighlighting } from '../hooks';
import type { TurnReviewComment } from '../types';
import { CommentThread } from './CommentThread';
import { DiffLineCell } from './DiffLineCell';

export type SplitDiffLineProps = {
  row: SplitDiffRow;
  highlighting: FileHighlighting;
  commentsByLine: Map<string, TurnReviewComment[]>;
  draftTargetId: string | null;
  draftText: string;
  onOpenDraft: (lineId: string) => void;
  onCancelDraft: () => void;
  onSubmitDraft: (lineId: string) => void;
  setDraftText: (value: string) => void;
  onDeleteComment: (id: string) => void;
};

export function SplitDiffLine({
  row,
  highlighting,
  commentsByLine,
  draftTargetId,
  draftText,
  onOpenDraft,
  onCancelDraft,
  onSubmitDraft,
  setDraftText,
  onDeleteComment,
}: SplitDiffLineProps) {
  const leftLine = row.left;
  const rightLine = row.right;

  const leftAllowComment =
    !!leftLine && (leftLine.kind === 'addition' || leftLine.kind === 'removal');
  const rightAllowComment =
    !!rightLine &&
    (rightLine.kind === 'addition' || rightLine.kind === 'removal');

  const leftComments = leftLine ? (commentsByLine.get(leftLine.id) ?? []) : [];
  const rightComments = rightLine
    ? (commentsByLine.get(rightLine.id) ?? [])
    : [];

  const isLeftDraftOpen = !!leftLine && draftTargetId === leftLine.id;
  const isRightDraftOpen = !!rightLine && draftTargetId === rightLine.id;

  const oldCellClass = leftLine
    ? leftLine.kind === 'removal'
      ? 'bg-rose-50 text-rose-800'
      : leftLine.kind === 'addition'
        ? 'bg-emerald-50 text-emerald-800'
        : 'bg-muted text-muted-foreground'
    : 'bg-muted text-muted-foreground';

  const newCellClass = rightLine
    ? rightLine.kind === 'addition'
      ? 'bg-emerald-50 text-emerald-800'
      : rightLine.kind === 'removal'
        ? 'bg-rose-50 text-rose-800'
        : 'bg-muted text-muted-foreground'
    : 'bg-muted text-muted-foreground';

  const leftPrefix = leftLine?.prefix ?? null;
  const leftIsEmpty = !leftLine || leftLine.kind === 'addition';
  const leftText = leftIsEmpty ? '\u00A0' : leftLine.text || '\u00A0';
  const rightPrefix = rightLine?.prefix ?? null;
  const rightIsEmpty = !rightLine || rightLine.kind === 'removal';
  const rightText = rightIsEmpty ? '\u00A0' : rightLine.text || '\u00A0';

  const showLeftThread =
    !!leftLine && (leftComments.length > 0 || isLeftDraftOpen);
  const showRightThread =
    !!rightLine && (rightComments.length > 0 || isRightDraftOpen);

  return (
    <div>
      <div className="flex gap-6 pl-4">
        <div className="flex-1 isolate">
          <DiffLineCell
            line={leftLine}
            primaryLineNumber={leftLine?.oldNumber ?? null}
            cellClass={oldCellClass}
            prefix={leftPrefix}
            text={leftText}
            tokens={leftIsEmpty ? undefined : highlighting.get(leftLine.id)}
            allowComment={leftAllowComment}
            onOpenDraft={onOpenDraft}
          />
        </div>
        <div className="flex-1 isolate">
          <DiffLineCell
            line={rightLine}
            primaryLineNumber={rightLine?.newNumber ?? null}
            cellClass={newCellClass}
            prefix={rightPrefix}
            text={rightText}
            tokens={rightIsEmpty ? undefined : highlighting.get(rightLine.id)}
            allowComment={rightAllowComment}
            onOpenDraft={onOpenDraft}
          />
        </div>
      </div>
      {showLeftThread || showRightThread ? (
        <div className="flex gap-6 pl-4">
          <div className="flex-1 isolate">
            {showLeftThread ? (
              <div className="grid grid-cols-[30px_4px_minmax(0,1fr)] items-start gap-x-2">
                <div />
                <div />
                <div>
                  {leftLine ? (
                    <CommentThread
                      lineId={leftLine.id}
                      comments={leftComments}
                      isDraftOpen={isLeftDraftOpen}
                      draftText={draftText}
                      onCancelDraft={onCancelDraft}
                      onSubmitDraft={onSubmitDraft}
                      setDraftText={setDraftText}
                      onDeleteComment={onDeleteComment}
                    />
                  ) : null}
                </div>
              </div>
            ) : null}
          </div>
          <div className="flex-1 isolate">
            {showRightThread ? (
              <div className="grid grid-cols-[30px_4px_minmax(0,1fr)] items-start gap-x-2">
                <div />
                <div />
                <div>
                  {rightLine ? (
                    <CommentThread
                      lineId={rightLine.id}
                      comments={rightComments}
                      isDraftOpen={isRightDraftOpen}
                      draftText={draftText}
                      onCancelDraft={onCancelDraft}
                      onSubmitDraft={onSubmitDraft}
                      setDraftText={setDraftText}
                      onDeleteComment={onDeleteComment}
                    />
                  ) : null}
                </div>
              </div>
            ) : null}
          </div>
        </div>
      ) : null}
    </div>
  );
}
