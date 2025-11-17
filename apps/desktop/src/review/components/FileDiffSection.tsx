import { cn, makePathRelative } from '~/lib/utils';

import type { ParsedTurnDiffFile, TurnReviewComment } from '../types';
import { FileDiffHeader } from './FileDiffHeader';
import { SplitDiffView } from './SplitDiffView';
import { UnifiedDiffView } from './UnifiedDiffView';

export type DiffViewMode = 'split' | 'unified';

export type FileDiffSectionProps = {
  workspacePath: string;
  file: ParsedTurnDiffFile;
  viewMode: DiffViewMode;
  commentsByLine: Map<string, TurnReviewComment[]>;
  draftTargetId: string | null;
  draftText: string;
  onStartDraft: (lineId: string) => void;
  onCancelDraft: () => void;
  onSubmitDraft: (lineId: string) => void;
  setDraftText: (value: string) => void;
  onDeleteComment: (id: string) => void;
  isCollapsed: boolean;
  onToggleCollapse: () => void;
  isActive: boolean;
  registerRef: (el: HTMLDivElement | null) => void;
};

export function FileDiffSection({
  workspacePath,
  file,
  viewMode,
  commentsByLine,
  draftTargetId,
  draftText,
  onStartDraft,
  onCancelDraft,
  onSubmitDraft,
  setDraftText,
  onDeleteComment,
  isCollapsed,
  onToggleCollapse,
  isActive,
  registerRef,
}: FileDiffSectionProps) {
  const relativePath = makePathRelative(workspacePath, file.displayPath);

  return (
    <div
      ref={registerRef}
      className={cn(
        'overflow-hidden rounded-lg border border-border/60 bg-background shadow-sm transition-shadow',
        isActive ? 'ring-1 ring-primary/60' : ''
      )}
    >
      <FileDiffHeader
        filePath={relativePath}
        isCollapsed={isCollapsed}
        onToggleCollapse={onToggleCollapse}
      />
      {!isCollapsed ? (
        viewMode === 'split' ? (
          <SplitDiffView
            hunks={file.hunks}
            commentsByLine={commentsByLine}
            draftTargetId={draftTargetId}
            draftText={draftText}
            onStartDraft={onStartDraft}
            onCancelDraft={onCancelDraft}
            onSubmitDraft={onSubmitDraft}
            setDraftText={setDraftText}
            onDeleteComment={onDeleteComment}
          />
        ) : (
          <UnifiedDiffView
            hunks={file.hunks}
            commentsByLine={commentsByLine}
            draftTargetId={draftTargetId}
            draftText={draftText}
            onStartDraft={onStartDraft}
            onCancelDraft={onCancelDraft}
            onSubmitDraft={onSubmitDraft}
            setDraftText={setDraftText}
            onDeleteComment={onDeleteComment}
          />
        )
      ) : null}
    </div>
  );
}
