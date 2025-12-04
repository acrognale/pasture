import { FilePen, FilePlus, FileX } from 'lucide-react';
import type { ParsedTurnDiffFile } from '~/review/types';

type ProcessedFile = {
  file: ParsedTurnDiffFile;
  stats: { added: number; removed: number };
  relativePath: string;
};

type ChangesSidebarContentProps = {
  files: ProcessedFile[];
  onFileClick?: (file: ParsedTurnDiffFile) => void;
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
}: ChangesSidebarContentProps) {
  if (files.length === 0) {
    return (
      <div className="flex-1 px-4 py-6 text-center text-xs text-muted-foreground">
        <p>No changes yet</p>
        <p className="mt-2 text-[10px]">
          Changes will appear here as files are modified
        </p>
      </div>
    );
  }

  return (
    <div className="flex-1 overflow-y-auto px-2 py-2">
      <ul className="flex flex-col gap-1">
        {files.map(({ file, stats, relativePath }) => {
          const status = getFileStatus(file);
          const { dir, file: fileName } = splitPath(relativePath);
          return (
            <li key={file.id}>
              <button
                type="button"
                className="flex w-full items-center gap-2 rounded-md px-3 py-2 text-left text-xs bg-background/50 hover:bg-muted/40 transition-colors"
                onClick={() => onFileClick?.(file)}
              >
                <FileStatusIcon status={status} />
                <span
                  className="flex-1 min-w-0 flex items-center gap-1 text-foreground"
                  title={relativePath}
                >
                  {dir ? (
                    <span
                      className="truncate text-muted-foreground"
                      dir="rtl"
                      style={{ unicodeBidi: 'isolate' }}
                    >
                      {dir}
                    </span>
                  ) : null}
                  <span className="shrink-0 font-medium text-foreground">
                    {fileName}
                  </span>
                </span>
                <span className="flex shrink-0 items-center gap-2 text-[10px]">
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
