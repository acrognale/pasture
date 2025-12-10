import { useState } from 'react';
import { cn, makePathRelative } from '~/lib/utils';

import type { ParsedTurnDiffFile, TurnReviewComment } from '../types';
import { useFileHighlighting } from '../useFileHighlighting';
import { FileDiffHeader } from './FileDiffHeader';
import { SplitDiffView } from './SplitDiffView';
import { UnifiedDiffView } from './UnifiedDiffView';

export type DiffViewMode = 'split' | 'unified';

export type FileDiffSectionProps = {
  workspacePath: string;
  file: ParsedTurnDiffFile;
  viewMode: DiffViewMode;
  commentsByLine: Map<string, TurnReviewComment[]>;
  onDeleteComment: (id: string) => void;
  isActive: boolean;
  registerRef: (el: HTMLDivElement | null) => void;
};

export function FileDiffSection({
  workspacePath,
  file,
  viewMode,
  commentsByLine,
  onDeleteComment,
  isActive,
  registerRef,
}: FileDiffSectionProps) {
  // Collapse state is local - resets when component remounts via key
  const [isCollapsed, setIsCollapsed] = useState(false);

  const relativePath = makePathRelative(workspacePath, file.displayPath);
  const highlighting = useFileHighlighting(file);

  const toggleCollapse = () => setIsCollapsed((prev) => !prev);

  return (
    <div
      ref={registerRef}
      className={cn(
        'scroll-mt-4 overflow-hidden rounded-lg border border-border/60 bg-background shadow-sm transition-shadow',
        isActive ? 'ring-1 ring-primary/60' : ''
      )}
    >
      <FileDiffHeader
        filePath={relativePath}
        isCollapsed={isCollapsed}
        onToggleCollapse={toggleCollapse}
      />
      {!isCollapsed ? (
        viewMode === 'split' ? (
          <SplitDiffView
            fileId={file.id}
            filePath={file.displayPath}
            hunks={file.hunks}
            highlighting={highlighting}
            commentsByLine={commentsByLine}
            onDeleteComment={onDeleteComment}
          />
        ) : (
          <UnifiedDiffView
            fileId={file.id}
            filePath={file.displayPath}
            hunks={file.hunks}
            highlighting={highlighting}
            commentsByLine={commentsByLine}
            onDeleteComment={onDeleteComment}
          />
        )
      ) : null}
    </div>
  );
}
