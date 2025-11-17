import { useMemo } from 'react';
import { cn } from '~/lib/utils';

import type { ParsedTurnDiffHunk, TurnReviewComment } from '../types';
import { DiffLine } from './DiffLine';
import { VirtualizedHunk } from './VirtualizedHunk';

export type UnifiedDiffViewProps = {
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

export function UnifiedDiffView({
  hunks,
  commentsByLine,
  draftTargetId,
  draftText,
  onStartDraft,
  onCancelDraft,
  onSubmitDraft,
  setDraftText,
  onDeleteComment,
}: UnifiedDiffViewProps) {
  const processedHunks = useMemo(
    () =>
      hunks.map((hunk) => {
        const lines = hunk.lines.filter((line) => line.kind !== 'metadata');
        const signature = lines.map((line) => line.id).join(':');
        return {
          id: hunk.id,
          lines,
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
            rows={hunk.lines}
            renderRow={(line) => (
              <DiffLine
                line={line}
                comments={commentsByLine.get(line.id) ?? []}
                isDraftOpen={draftTargetId === line.id}
                draftText={draftText}
                onOpenDraft={onStartDraft}
                onCancelDraft={onCancelDraft}
                onSubmitDraft={onSubmitDraft}
                setDraftText={setDraftText}
                onDeleteComment={onDeleteComment}
              />
            )}
            getRowKey={(line) => line.id}
          />
        </div>
      ))}
    </div>
  );
}
