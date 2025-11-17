import { useMemo } from 'react';
import { cn } from '~/lib/utils';

import { buildSplitDiffRows } from '../diff-utils';
import type { ParsedTurnDiffHunk, TurnReviewComment } from '../types';
import { SplitDiffLine } from './SplitDiffLine';
import { VirtualizedHunk } from './VirtualizedHunk';

export type SplitDiffViewProps = {
  hunks: ParsedTurnDiffHunk[];
  commentsByLine: Map<string, TurnReviewComment[]>;
  draftTargetId: string | null;
  draftText: string;
  onStartDraft: (lineId: string) => void;
  onCancelDraft: () => void;
  onSubmitDraft: (lineId: string) => void;
  setDraftText: (value: string) => void;
  onDeleteComment: (id: string) => void;
};

export function SplitDiffView({
  hunks,
  commentsByLine,
  draftTargetId,
  draftText,
  onStartDraft,
  onCancelDraft,
  onSubmitDraft,
  setDraftText,
  onDeleteComment,
}: SplitDiffViewProps) {
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
                row={row}
                commentsByLine={commentsByLine}
                draftTargetId={draftTargetId}
                draftText={draftText}
                onOpenDraft={onStartDraft}
                onCancelDraft={onCancelDraft}
                onSubmitDraft={onSubmitDraft}
                setDraftText={setDraftText}
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
