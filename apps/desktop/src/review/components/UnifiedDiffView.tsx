import { useMemo } from 'react';
import { cn } from '~/lib/utils';

import { useDraftComment } from '../DraftCommentContext';
import type { ParsedTurnDiffHunk, TurnReviewComment } from '../types';
import type { FileHighlighting } from '../useFileHighlighting';
import { DiffLine } from './DiffLine';
import { VirtualizedHunk } from './VirtualizedHunk';

export type UnifiedDiffViewProps = {
  fileId: string;
  filePath: string;
  hunks: ParsedTurnDiffHunk[];
  highlighting: FileHighlighting;
  commentsByLine: Map<string, TurnReviewComment[]>;
  onDeleteComment: (id: string) => void;
  focusLineRange?: { start: number; end: number } | null;
};

export function UnifiedDiffView({
  fileId,
  filePath,
  hunks,
  highlighting,
  commentsByLine,
  onDeleteComment,
  focusLineRange,
}: UnifiedDiffViewProps) {
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
            hunkId={hunk.id}
            rows={hunk.lines}
            renderRow={(line) => (
              <DiffLine
                fileId={fileId}
                filePath={filePath}
                hunkId={hunk.id}
                line={line}
                tokens={highlighting.get(line.id)}
                comments={commentsByLine.get(line.id) ?? []}
                isDraftOpen={draftTargetId === line.id}
                draftText={draftText}
                setDraftText={setDraftText}
                onStartDraft={startDraft}
                onCancelDraft={cancelDraft}
                onSubmitDraft={submitDraft}
                onDeleteComment={onDeleteComment}
                focusLineRange={focusLineRange}
              />
            )}
            getRowKey={(line) => line.id}
          />
        </div>
      ))}
    </div>
  );
}
