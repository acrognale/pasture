import { ChevronDown, ChevronLeft, ChevronRight, Folder } from 'lucide-react';
import { useMemo, useState } from 'react';
import { cn, makePathRelative } from '~/lib/utils';

import type { ParsedTurnDiffFile } from '../types';

type FileStats = { added: number; removed: number };

type FileTreeNode = {
  name: string;
  path: string;
  children: Map<string, FileTreeNode>;
  file?: {
    id: string;
    stats: FileStats;
    commentTotal: number;
    relativePath: string;
    parsedFile: ParsedTurnDiffFile;
  };
};

function buildFileTree(
  files: Array<{
    file: ParsedTurnDiffFile;
    stats: FileStats;
    commentTotal: number;
    relativePath: string;
  }>
): FileTreeNode {
  const root: FileTreeNode = { name: '', path: '', children: new Map() };

  for (const { file, stats, commentTotal, relativePath } of files) {
    const parts = relativePath.split('/');
    let current = root;

    for (let i = 0; i < parts.length; i++) {
      const part = parts[i];
      const isFile = i === parts.length - 1;
      const currentPath = parts.slice(0, i + 1).join('/');

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
          id: file.id,
          stats,
          commentTotal,
          relativePath,
          parsedFile: file,
        };
      }
      current = node;
    }
  }

  return root;
}

// Collapse single-child directory chains (e.g., "apps/desktop/src" instead of nested)
function collapseTree(node: FileTreeNode): FileTreeNode {
  // First, recursively collapse all children
  const collapsedChildren = new Map<string, FileTreeNode>();

  for (const [key, child] of node.children) {
    collapsedChildren.set(key, collapseTree(child));
  }

  const nodeWithCollapsedChildren: FileTreeNode = {
    ...node,
    children: collapsedChildren,
  };

  // Now check if THIS node should be collapsed with its only child
  // Only collapse if: we have exactly one child, we're not a file, and the child is not a file
  if (collapsedChildren.size === 1 && !node.file) {
    const [, onlyChild] = [...collapsedChildren][0];
    // Only collapse if the child is a pure directory (no file attached)
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
  selectedFileId,
  onFileSelect,
}: {
  node: FileTreeNode;
  depth: number;
  selectedFileId: string | null;
  onFileSelect: (fileId: string) => void;
}) {
  const [isExpanded, setIsExpanded] = useState(true);
  const isDirectory = !node.file && node.children.size > 0;
  const isFile = !!node.file;
  const isActive = node.file?.id === selectedFileId;

  const sortedChildren = [...node.children.values()].sort((a, b) => {
    // Directories first, then files
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
          className="flex w-full items-center gap-1.5 rounded-md px-2 py-1 text-left text-xs text-muted-foreground transition-colors hover:bg-muted/50 hover:text-foreground"
          style={{ paddingLeft: `${depth * 12 + 8}px` }}
          onClick={() => setIsExpanded(!isExpanded)}
        >
          <ChevronDown
            className={cn(
              'h-3 w-3 shrink-0 transition-transform',
              !isExpanded && '-rotate-90'
            )}
          />
          <Folder className="h-3.5 w-3.5 shrink-0 text-muted-foreground/70" />
          <span className="truncate">{node.name}</span>
        </button>
        {isExpanded && (
          <div>
            {sortedChildren.map((child) => (
              <TreeNode
                key={child.path}
                node={child}
                depth={depth + 1}
                selectedFileId={selectedFileId}
                onFileSelect={onFileSelect}
              />
            ))}
          </div>
        )}
      </div>
    );
  }

  if (isFile) {
    const { stats, commentTotal } = node.file!;
    return (
      <button
        type="button"
        className={cn(
          'flex w-full items-center justify-between gap-2 rounded-md px-2 py-1 text-left text-xs transition-colors',
          isActive
            ? 'bg-brand-muted text-brand'
            : 'text-muted-foreground hover:bg-muted/50 hover:text-foreground'
        )}
        style={{ paddingLeft: `${depth * 12 + 28}px` }}
        onClick={() => onFileSelect(node.file!.id)}
        title={node.file!.relativePath}
      >
        <span
          className={cn(
            'truncate',
            isActive ? 'text-foreground' : 'text-foreground/80'
          )}
        >
          {node.name}
        </span>
        <span className="flex shrink-0 items-center gap-1.5 text-[10px]">
          <span className="text-success-foreground">+{stats.added}</span>
          <span className="text-error-foreground">-{stats.removed}</span>
          {commentTotal > 0 && (
            <span className="rounded-full bg-primary/10 px-1.5 py-0.5 text-primary">
              {commentTotal}
            </span>
          )}
        </span>
      </button>
    );
  }

  return null;
}

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

  const fileTree = useMemo(() => {
    const processedFiles = files.map((file) => ({
      file,
      stats: fileDiffStats.get(file.id) ?? { added: 0, removed: 0 },
      commentTotal: commentsByFile.get(file.id) ?? 0,
      relativePath: makePathRelative(workspacePath, file.displayPath),
    }));
    const tree = buildFileTree(processedFiles);
    return collapseTree(tree);
  }, [commentsByFile, fileDiffStats, files, workspacePath]);

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
        <div className="flex-1 overflow-y-auto px-1 py-2">
          {fileTree.children.size > 0 ? (
            <div className="flex flex-col">
              {[...fileTree.children.values()]
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
                    selectedFileId={selectedFileId}
                    onFileSelect={onFileSelect}
                  />
                ))}
            </div>
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
