import { ChevronDown, FilePen, FilePlus, FileX, Folder } from 'lucide-react';
import { useMemo, useState } from 'react';
import { Button } from '~/components/ui/button';
import { cn } from '~/lib/utils';
import type { ParsedTurnDiffFile } from '~/review/types';

type ProcessedFile = {
  file: ParsedTurnDiffFile;
  stats: { added: number; removed: number };
  relativePath: string;
};

type ChangesSidebarTreeContentProps = {
  files: ProcessedFile[];
  onFileClick?: (file: ParsedTurnDiffFile) => void;
  emptyStateTitle?: string;
  emptyStateDescription?: string;
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

type FileTreeNode = {
  name: string;
  path: string;
  children: Map<string, FileTreeNode>;
  file?: {
    file: ParsedTurnDiffFile;
    stats: { added: number; removed: number };
    relativePath: string;
  };
};

function buildFileTree(files: ProcessedFile[]): FileTreeNode {
  const root: FileTreeNode = { name: '', path: '', children: new Map() };

  for (const entry of files) {
    const parts = entry.relativePath.split('/');
    let current = root;

    for (let i = 0; i < parts.length; i++) {
      const part = parts[i];
      const currentPath = parts.slice(0, i + 1).join('/');
      const isFile = i === parts.length - 1;

      if (!current.children.has(part)) {
        current.children.set(part, {
          name: part,
          path: currentPath,
          children: new Map(),
        });
      }

      const node = current.children.get(part)!;
      if (isFile) {
        node.file = {
          file: entry.file,
          stats: entry.stats,
          relativePath: entry.relativePath,
        };
      }
      current = node;
    }
  }

  return root;
}

function collapseTree(node: FileTreeNode): FileTreeNode {
  const collapsedChildren = new Map<string, FileTreeNode>();
  for (const [key, child] of node.children) {
    collapsedChildren.set(key, collapseTree(child));
  }

  const nodeWithCollapsedChildren: FileTreeNode = {
    ...node,
    children: collapsedChildren,
  };

  if (collapsedChildren.size === 1 && !node.file) {
    const [, onlyChild] = [...collapsedChildren][0];
    if (!onlyChild.file) {
      return {
        name: node.name ? `${node.name}/${onlyChild.name}` : onlyChild.name,
        path: onlyChild.path,
        children: onlyChild.children,
        file: onlyChild.file,
      };
    }
  }

  return nodeWithCollapsedChildren;
}

function TreeNode({
  node,
  depth,
  onFileClick,
}: {
  node: FileTreeNode;
  depth: number;
  onFileClick?: (file: ParsedTurnDiffFile) => void;
}) {
  const [isExpanded, setIsExpanded] = useState(true);

  const isDirectory = !node.file && node.children.size > 0;
  const isFile = !!node.file;

  const sortedChildren = [...node.children.values()].sort((a, b) => {
    const aIsDir = !a.file && a.children.size > 0;
    const bIsDir = !b.file && b.children.size > 0;
    if (aIsDir && !bIsDir) return -1;
    if (!aIsDir && bIsDir) return 1;
    return a.name.localeCompare(b.name);
  });

  if (isDirectory) {
    return (
      <div>
        <button
          type="button"
          className="flex w-full items-center gap-1.5 rounded-md px-2 py-1 text-left text-xs text-muted-foreground transition-colors hover:bg-sidebar-accent/40 hover:text-sidebar-accent-foreground"
          style={{ paddingLeft: `${depth * 12 + 8}px` }}
          onClick={() => setIsExpanded((prev) => !prev)}
          title={node.name}
        >
          <ChevronDown
            className={cn(
              'h-3 w-3 shrink-0 transition-transform',
              !isExpanded && '-rotate-90'
            )}
          />
          <Folder className="h-3.5 w-3.5 shrink-0 opacity-70" />
          <span className="truncate">{node.name}</span>
        </button>
        {isExpanded ? (
          <div>
            {sortedChildren.map((child) => (
              <TreeNode
                key={child.path}
                node={child}
                depth={depth + 1}
                onFileClick={onFileClick}
              />
            ))}
          </div>
        ) : null}
      </div>
    );
  }

  if (isFile) {
    const { file, stats, relativePath } = node.file!;
    const status = getFileStatus(file);
    return (
      <button
        type="button"
        className="grid w-full grid-cols-[auto_minmax(0,1fr)_auto] items-start gap-2 overflow-hidden rounded-md px-2 py-2 text-left text-xs transition-colors hover:bg-sidebar-accent/40 hover:text-sidebar-accent-foreground"
        style={{ paddingLeft: `${depth * 12 + 20}px` }}
        onClick={() => onFileClick?.(file)}
        title={relativePath}
      >
        <div className="mt-px">
          <FileStatusIcon status={status} />
        </div>
        <span className="min-w-0 truncate text-foreground">{node.name}</span>
        <span className="flex shrink-0 whitespace-nowrap items-center gap-1.5 text-xs tabular-nums">
          <span className="text-success-foreground">+{stats.added}</span>
          <span className="text-error-foreground">-{stats.removed}</span>
        </span>
      </button>
    );
  }

  return null;
}

export function ChangesSidebarTreeContent({
  files,
  onFileClick,
  emptyStateTitle,
  emptyStateDescription,
  emptyStateAction,
}: ChangesSidebarTreeContentProps) {
  const tree = useMemo(() => collapseTree(buildFileTree(files)), [files]);

  if (files.length === 0) {
    return (
      <div className="px-2 py-4 text-center text-xs text-muted-foreground space-y-3">
        <div className="space-y-1">
          <p>{emptyStateTitle ?? 'No changes yet'}</p>
          <p className="text-xs">
            {emptyStateDescription ??
              'Changes will appear here as files are modified'}
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
      <div className="flex flex-col gap-1">
        {[...tree.children.values()]
          .sort((a, b) => {
            const aIsDir = !a.file && a.children.size > 0;
            const bIsDir = !b.file && b.children.size > 0;
            if (aIsDir && !bIsDir) return -1;
            if (!aIsDir && bIsDir) return 1;
            return a.name.localeCompare(b.name);
          })
          .map((child) => (
            <TreeNode
              key={child.path}
              node={child}
              depth={0}
              onFileClick={onFileClick}
            />
          ))}
      </div>
    </div>
  );
}
