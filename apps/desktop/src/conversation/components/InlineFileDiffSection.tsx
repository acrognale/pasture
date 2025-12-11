import { ChevronDown } from 'lucide-react';
import { useState } from 'react';
import { cn, makePathRelative } from '~/lib/utils';
import { UnifiedDiffView } from '~/review/components/UnifiedDiffView';
import type { ParsedTurnDiffFile, TurnReviewComment } from '~/review/types';
import { useFileHighlighting } from '~/review/useFileHighlighting';

export type InlineFileDiffSectionProps = {
  workspacePath: string;
  file: ParsedTurnDiffFile;
  commentsByLine: Map<string, TurnReviewComment[]>;
  onDeleteComment: (id: string) => void;
};

export function InlineFileDiffSection({
  workspacePath,
  file,
  commentsByLine,
  onDeleteComment,
}: InlineFileDiffSectionProps) {
  const [isCollapsed, setIsCollapsed] = useState(false);

  const relativePath = makePathRelative(workspacePath, file.displayPath);
  const highlighting = useFileHighlighting(file);

  return (
    <div className="overflow-hidden rounded-md border border-border/60 bg-background">
      <button
        type="button"
        className="flex w-full items-center gap-1.5 bg-muted/30 px-2 py-1.5 text-left text-xs font-medium text-muted-foreground transition-colors hover:bg-muted/50"
        onClick={() => setIsCollapsed((prev) => !prev)}
      >
        <ChevronDown
          className={cn(
            'h-3 w-3 flex-shrink-0 transition-transform',
            isCollapsed && '-rotate-90'
          )}
        />
        <span className="truncate">{relativePath}</span>
      </button>
      {!isCollapsed && (
        <UnifiedDiffView
          fileId={file.id}
          filePath={file.displayPath}
          hunks={file.hunks}
          highlighting={highlighting}
          commentsByLine={commentsByLine}
          onDeleteComment={onDeleteComment}
        />
      )}
    </div>
  );
}
