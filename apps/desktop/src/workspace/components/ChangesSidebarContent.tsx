import { FilePen, FilePlus, FileX } from 'lucide-react';
import { Button } from '~/components/ui/button';
import type { ParsedTurnDiffFile } from '~/review/types';

type ProcessedFile = {
  file: ParsedTurnDiffFile;
  stats: { added: number; removed: number };
  relativePath: string;
};

type ChangesSidebarContentProps = {
  files: ProcessedFile[];
  onFileClick?: (file: ParsedTurnDiffFile) => void;
  emptyStateAction?: {
    label: string;
    onClick: () => void;
  };
};

type FileStatus = 'added' | 'deleted' | 'modified';

function getFileStatus(file: ParsedTurnDiffFile): FileStatus {
  if (file.oldPath === null && file.newPath !== null) {
    return 'added';
  }
  if (file.oldPath !== null && file.newPath === null) {
    return 'deleted';
  }
  return 'modified';
}

function FileStatusIcon({ status }: { status: FileStatus }) {
  switch (status) {
    case 'added':
      return (
        <FilePlus
          className="h-3.5 w-3.5 text-success-foreground"
          aria-label="Added"
        />
      );
    case 'deleted':
      return (
        <FileX
          className="h-3.5 w-3.5 text-error-foreground"
          aria-label="Deleted"
        />
      );
    case 'modified':
      return (
        <FilePen
          className="h-3.5 w-3.5 text-foreground"
          aria-label="Modified"
        />
      );
  }
}

function splitPath(path: string): { dir: string; file: string } {
  const lastSlash = path.lastIndexOf('/');
  if (lastSlash === -1) {
    return { dir: '', file: path };
  }
  return {
    dir: path.slice(0, lastSlash + 1),
    file: path.slice(lastSlash + 1),
  };
}

export function ChangesSidebarContent({
  files,
  onFileClick,
  emptyStateAction,
}: ChangesSidebarContentProps) {
  if (files.length === 0) {
    return (
      <div className="px-2 py-4 text-center text-xs text-muted-foreground space-y-3">
        <div className="space-y-1">
          <p>No changes yet</p>
          <p className="text-[10px]">
            Changes will appear here as files are modified
          </p>
        </div>
        {emptyStateAction ? (
          <Button
            type="button"
            size="sm"
            variant="outline"
            className="h-7 text-xs"
            onClick={emptyStateAction.onClick}
          >
            {emptyStateAction.label}
          </Button>
        ) : null}
      </div>
    );
  }

  return (
    <div className="px-0 py-2">
      <ul className="flex flex-col gap-1">
        {files.map(({ file, stats, relativePath }) => {
          const status = getFileStatus(file);
          const { dir, file: fileName } = splitPath(relativePath);
          return (
            <li key={file.id}>
              <button
                type="button"
                className="grid w-full grid-cols-[auto_minmax(0,1fr)_auto] items-start gap-2 overflow-hidden rounded-md px-2 py-2 text-left text-xs transition-colors hover:bg-sidebar-accent/40 hover:text-sidebar-accent-foreground"
                onClick={() => onFileClick?.(file)}
              >
                <div className="mt-px">
                  <FileStatusIcon status={status} />
                </div>
                <span
                  className="min-w-0 overflow-hidden flex flex-col"
                  title={relativePath}
                >
                  <span className="truncate font-medium text-foreground">
                    {fileName}
                  </span>
                  {dir ? (
                    <span className="truncate text-[10px] text-muted-foreground">
                      {dir.slice(0, -1)}
                    </span>
                  ) : null}
                </span>
                <span className="flex shrink-0 whitespace-nowrap items-center gap-1.5 text-[10px] tabular-nums">
                  <span className="text-success-foreground">
                    +{stats.added}
                  </span>
                  <span className="text-error-foreground">
                    -{stats.removed}
                  </span>
                </span>
              </button>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
