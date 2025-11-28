import { useMemo } from 'react';
import { cn } from '~/lib/utils';

import { useDraftComment } from '../DraftCommentContext';
import { buildSplitDiffRows } from '../diff';
import type { ParsedTurnDiffHunk, TurnReviewComment } from '../types';
import type { FileHighlighting } from '../useFileHighlighting';
import { SplitDiffLine } from './SplitDiffLine';
import { VirtualizedHunk } from './VirtualizedHunk';

export type SplitDiffViewProps = {
  fileId: string;
  filePath: string;
  hunks: ParsedTurnDiffHunk[];
  highlighting: FileHighlighting;
  commentsByLine: Map<string, TurnReviewComment[]>;
  onDeleteComment: (id: string) => void;
};

export function SplitDiffView({
  fileId,
  filePath,
  hunks,
  highlighting,
  commentsByLine,
  onDeleteComment,
}: SplitDiffViewProps) {
  const {
    draftTargetId,
    draftText,
    setDraftText,
    startDraft,
    cancelDraft,
    submitDraft,
  } = useDraftComment();

  const processedHunks = useMemo(
    () =>
      hunks.map((hunk) => {
        const rows = buildSplitDiffRows(hunk.lines);
        const signature = rows.map((row) => row.id).join(':');
        return {
          id: hunk.id,
          rows,
          signature: signature ? `${hunk.id}:${signature}` : `${hunk.id}:empty`,
        };
      }),
    [hunks]
  );

  return (
    <div className="flex flex-col">
      {processedHunks.map((hunk, index) => (
        <div
          key={hunk.id}
          className={cn(index === 0 ? '' : 'border-t border-border/40')}
        >
          <VirtualizedHunk
            key={hunk.signature}
            rows={hunk.rows}
            renderRow={(row) => (
              <SplitDiffLine
                fileId={fileId}
                filePath={filePath}
                hunkId={hunk.id}
                row={row}
                highlighting={highlighting}
                commentsByLine={commentsByLine}
                draftTargetId={draftTargetId}
                draftText={draftText}
                setDraftText={setDraftText}
                onStartDraft={startDraft}
                onCancelDraft={cancelDraft}
                onSubmitDraft={submitDraft}
                onDeleteComment={onDeleteComment}
              />
            )}
            getRowKey={(row) => row.id}
          />
        </div>
      ))}
    </div>
  );
}
