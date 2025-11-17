import { ChevronLeft, ChevronRight } from 'lucide-react';
import { useMemo, useState } from 'react';
import { cn, makePathRelative } from '~/lib/utils';

import type { ParsedTurnDiffFile } from '../types';

export type FileSidebarProps = {
  workspacePath: string;
  files: ParsedTurnDiffFile[];
  selectedFileId: string | null;
  fileDiffStats: Map<string, { added: number; removed: number }>;
  commentsByFile: Map<string, number>;
  onFileSelect: (fileId: string) => void;
};

export function FileSidebar({
  workspacePath,
  files,
  selectedFileId,
  fileDiffStats,
  commentsByFile,
  onFileSelect,
}: FileSidebarProps) {
  const [isCollapsed, setIsCollapsed] = useState(false);

  const processedFiles = useMemo(
    () =>
      files.map((file) => ({
        file,
        stats: fileDiffStats.get(file.id) ?? { added: 0, removed: 0 },
        commentTotal: commentsByFile.get(file.id) ?? 0,
        relativePath: makePathRelative(workspacePath, file.displayPath),
      })),
    [commentsByFile, fileDiffStats, files, workspacePath]
  );

  return (
    <aside
      className={cn(
        'hidden md:flex flex-col border-r border-border/60 bg-muted/20 transition-all duration-200',
        isCollapsed ? 'w-12' : 'w-72'
      )}
    >
      <div
        className={cn(
          'flex items-center gap-2 px-5 py-3 text-xs font-semibold uppercase tracking-wide text-muted-foreground',
          isCollapsed && 'justify-center px-0'
        )}
      >
        {!isCollapsed ? <span>Files</span> : null}
        <button
          type="button"
          className={cn(
            'shrink-0 rounded-md p-1 text-muted-foreground transition-colors hover:bg-muted/50 hover:text-foreground',
            !isCollapsed && 'ml-auto'
          )}
          onClick={() => setIsCollapsed((prev) => !prev)}
          aria-label={isCollapsed ? 'Expand sidebar' : 'Collapse sidebar'}
        >
          {isCollapsed ? (
            <ChevronRight className="h-4 w-4" />
          ) : (
            <ChevronLeft className="h-4 w-4" />
          )}
        </button>
      </div>
      {!isCollapsed ? (
        <div className="flex-1 overflow-y-auto px-2 py-2">
          {processedFiles.length > 0 ? (
            <ul className="flex flex-col gap-1">
              {processedFiles.map(
                ({ file, stats, commentTotal, relativePath }) => {
                  const isActive = selectedFileId === file.id;
                  return (
                    <li key={file.id}>
                      <button
                        type="button"
                        className={cn(
                          'flex w-full items-center justify-between gap-2 rounded-md px-3 py-2 text-left text-xs transition-colors',
                          isActive
                            ? 'bg-background text-foreground shadow-sm'
                            : 'text-muted-foreground hover:bg-muted/50 hover:text-foreground'
                        )}
                        onClick={() => onFileSelect(file.id)}
                      >
                        <span
                          className="truncate text-left"
                          style={{ direction: 'rtl', unicodeBidi: 'plaintext' }}
                        >
                          {relativePath}
                        </span>
                        <span className="flex items-center gap-2 text-[10px]">
                          <span className="text-success-foreground">
                            +{stats.added}
                          </span>
                          <span className="text-error-foreground">
                            -{stats.removed}
                          </span>
                          {commentTotal > 0 ? (
                            <span className="rounded-full bg-primary/10 px-2 py-0.5 text-primary">
                              {commentTotal}
                            </span>
                          ) : null}
                        </span>
                      </button>
                    </li>
                  );
                }
              )}
            </ul>
          ) : (
            <div className="px-3 py-4 text-xs text-muted-foreground">
              Diffs will appear after the agent makes changes.
            </div>
          )}
        </div>
      ) : null}
    </aside>
  );
}
