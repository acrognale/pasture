import type { GetTurnDiffRangeParams } from '@pasture/protocol';
import type { TranscriptTurnDiff } from '@pasture/transcript-ui';
import { useCallback, useEffect, useMemo, useRef } from 'react';
import { makePathRelative } from '~/lib/utils';

import { DraftCommentProvider } from '../DraftCommentContext';
import { useTurnReview } from '../TurnReviewContext';
import { buildSplitDiffRows, groupCommentsByLine, parseUnifiedDiff } from '../diff';
import { useTurnDiffRange, useTurnSnapshots } from '../queries';
import type { ParsedTurnDiff } from '../types';
import { EmptyReviewState } from './EmptyReviewState';
import type { DiffViewMode } from './FileDiffSection';
import { FileDiffSection } from './FileDiffSection';
import { VIRTUALIZED_HUNK_CHUNK_LENGTH } from './VirtualizedHunk';

export type DiffContentSectionProps = {
  workspacePath: string;
  viewMode: DiffViewMode;
  focusFilePath?: string | null;
  focusLineRange?: { start: number; end: number } | null;
  focusRequestId?: number;
  emptyStateMessage?: string;
};

export function DiffContentSection({
  workspacePath,
  viewMode,
  focusFilePath,
  focusLineRange,
  focusRequestId,
  emptyStateMessage,
}: DiffContentSectionProps) {
  const {
    conversationId,
    history,
    baseTurnId,
    targetTurnId,
    rangeKey,
    comments,
    removeComment,
    selectedDiff,
  } = useTurnReview();

  // Server state
  const { snapshotDisabled } = useTurnSnapshots(conversationId);

  // Build history lookup for diff params
  const historyById = useMemo(() => {
    const map = new Map<string, TranscriptTurnDiff>();
    for (const entry of history) {
      map.set(entry.eventId, entry);
    }
    return map;
  }, [history]);

  // Compute diff range params
  const diffRangeParams = useMemo<GetTurnDiffRangeParams | null>(() => {
    if (!conversationId || !targetTurnId || snapshotDisabled) {
      return null;
    }
    const targetEntry = historyById.get(targetTurnId);
    const targetSnapshotEventId = targetEntry?.turnId ?? null;
    if (!targetSnapshotEventId) {
      return null;
    }
    const baseSnapshotEventId =
      baseTurnId === null
        ? null
        : (historyById.get(baseTurnId)?.turnId ?? null);

    return {
      conversationId,
      baseEventId: baseSnapshotEventId,
      targetEventId: targetSnapshotEventId,
    };
  }, [baseTurnId, conversationId, historyById, snapshotDisabled, targetTurnId]);

  // Fetch range diff
  const { parsedDiff: rangeParsedDiff } = useTurnDiffRange(diffRangeParams);

  // Fallback to selectedDiff's unifiedDiff if range diff not available
  const fallbackParsedDiff = useMemo<ParsedTurnDiff | null>(() => {
    if (!selectedDiff) {
      return null;
    }
    const unified = selectedDiff.unifiedDiff ?? '';
    if (!unified.trim()) {
      return null;
    }
    return parseUnifiedDiff(unified);
  }, [selectedDiff]);

  const parsedDiff = rangeParsedDiff ?? fallbackParsedDiff;
  const diffFiles = useMemo(() => parsedDiff?.files ?? [], [parsedDiff]);

  // Computed values
  const commentsByLine = useMemo(
    () => groupCommentsByLine(comments),
    [comments]
  );

  // File navigation
  const fileRefs = useRef(new Map<string, HTMLDivElement>());
  const lastScrolledFile = useRef<string | null>(null);
  const scrollContainerRef = useRef<HTMLDivElement | null>(null);

  const registerRef = useCallback(
    (fileId: string) => (element: HTMLDivElement | null) => {
      if (element) {
        fileRefs.current.set(fileId, element);
      } else {
        fileRefs.current.delete(fileId);
      }
    },
    []
  );

  const scrollToFile = useCallback((fileId: string | null) => {
    if (!fileId) {
      return;
    }
    requestAnimationFrame(() => {
      const node = fileRefs.current.get(fileId);
      if (!node) {
        return;
      }
      if (lastScrolledFile.current === fileId) {
        return;
      }
      lastScrolledFile.current = fileId;
      node.scrollIntoView({ behavior: 'smooth', block: 'start' });
    });
  }, []);

  const normalizeForMatch = useCallback(
    (value: string) => {
      const relative = makePathRelative(workspacePath, value);
      return relative.replace(/^\.?\//, '');
    },
    [workspacePath]
  );

  // Reset scroll tracking when range changes
  useEffect(() => {
    lastScrolledFile.current = null;
  }, [rangeKey]);

  const focusTargetFile = useMemo(() => {
    if (!focusFilePath || !diffFiles.length) {
      return null;
    }
    const normalizedFocus = normalizeForMatch(focusFilePath);
    return (
      diffFiles.find(
        (file) => normalizeForMatch(file.displayPath) === normalizedFocus
      ) ?? null
    );
  }, [diffFiles, focusFilePath, normalizeForMatch]);

  const activeFileId = focusTargetFile?.id ?? diffFiles[0]?.id ?? null;

  const scrollToLineRange = useCallback(
    (
      fileId: string,
      file: (typeof diffFiles)[number],
      lineRange: { start: number; end: number }
    ) => {
      const inRange = (value: number | null) =>
        value != null && value >= lineRange.start && value <= lineRange.end;

      const findTarget = () => {
        for (const hunk of file.hunks) {
          if (viewMode === 'split') {
            const rows = buildSplitDiffRows(hunk.lines);
            for (let rowIndex = 0; rowIndex < rows.length; rowIndex += 1) {
              const row = rows[rowIndex];
              const newLine = row.right?.newNumber ?? null;
              const oldLine = row.left?.oldNumber ?? null;
              if (inRange(newLine)) {
                return { hunkId: hunk.id, rowIndex, prefer: 'new' as const };
              }
              if (inRange(oldLine)) {
                return { hunkId: hunk.id, rowIndex, prefer: 'old' as const };
              }
            }
          } else {
            const lines = hunk.lines.filter((line) => line.kind !== 'metadata');
            for (let rowIndex = 0; rowIndex < lines.length; rowIndex += 1) {
              const line = lines[rowIndex];
              if (inRange(line.newNumber ?? null)) {
                return { hunkId: hunk.id, rowIndex, prefer: 'new' as const };
              }
              if (inRange(line.oldNumber ?? null)) {
                return { hunkId: hunk.id, rowIndex, prefer: 'old' as const };
              }
            }
          }
        }
        return null;
      };

      const target = findTarget();
      if (!target) {
        return;
      }

      // First, scroll the relevant chunk placeholder into view so the line renders.
      const chunkIndex =
        target.rowIndex <= 0
          ? null
          : Math.floor((target.rowIndex - 1) / VIRTUALIZED_HUNK_CHUNK_LENGTH);

      requestAnimationFrame(() => {
        const fileNode = fileRefs.current.get(fileId);
        if (!fileNode) {
          return;
        }

        if (chunkIndex !== null) {
          const chunkNode = fileNode.querySelector<HTMLElement>(
            `[data-virtualized-hunk-id="${target.hunkId}"][data-virtualized-chunk-index="${chunkIndex}"]`
          );
          chunkNode?.scrollIntoView({ behavior: 'smooth', block: 'center' });
        }

        const attemptScrollToStartLine = (remainingAttempts: number) => {
          const startLine = lineRange.start;
          const startNode =
            fileNode.querySelector<HTMLElement>(
              `[data-diff-line="true"][data-diff-new-line="${startLine}"]`
            ) ??
            fileNode.querySelector<HTMLElement>(
              `[data-diff-line="true"][data-diff-old-line="${startLine}"]`
            );

          if (startNode) {
            startNode.scrollIntoView({ behavior: 'smooth', block: 'center' });
            return;
          }

          if (remainingAttempts > 0) {
            window.setTimeout(() => {
              attemptScrollToStartLine(remainingAttempts - 1);
            }, 75);
            return;
          }

          // If we couldn't locate a specific row (e.g., collapsed file / chunk heights still settling),
          // at least ensure the file is in view.
          scrollContainerRef.current?.scrollTo({
            top: fileNode.offsetTop,
            behavior: 'smooth',
          });
        };

        requestAnimationFrame(() => {
          attemptScrollToStartLine(5);
        });
      });
    },
    [viewMode]
  );

  // Apply focus requests (scroll to the requested file/line range).
  useEffect(() => {
    if (!focusTargetFile) {
      return;
    }

    // Always allow re-scrolling to the same file when focus is requested.
    lastScrolledFile.current = null;
    scrollToFile(focusTargetFile.id);

    if (focusLineRange) {
      scrollToLineRange(focusTargetFile.id, focusTargetFile, focusLineRange);
    }
  }, [focusLineRange, focusRequestId, focusTargetFile, scrollToFile, scrollToLineRange]);

  // Keep the active file in view (defaults to first file when no focus is set).
  useEffect(() => {
    scrollToFile(activeFileId);
  }, [activeFileId, scrollToFile]);

  const showPane = diffFiles.length > 0;

  return (
    <div className="flex min-h-0 flex-1">
      {showPane ? (
        <DraftCommentProvider>
          <div
            ref={scrollContainerRef}
            className="flex-1 min-h-0 overflow-y-auto px-6 py-4"
          >
            <div className="flex flex-col gap-4">
              {diffFiles.map((file) => (
                <FileDiffSection
                  key={`${rangeKey}:${file.id}`}
                  workspacePath={workspacePath}
                  file={file}
                  viewMode={viewMode}
                  commentsByLine={commentsByLine}
                  onDeleteComment={removeComment}
                  isActive={activeFileId === file.id}
                  registerRef={registerRef(file.id)}
                  focusLineRange={
                    focusTargetFile &&
                    focusLineRange &&
                    focusTargetFile.id === file.id
                      ? focusLineRange
                      : null
                  }
                />
              ))}
            </div>
          </div>
        </DraftCommentProvider>
      ) : (
        <EmptyReviewState message={emptyStateMessage} />
      )}
    </div>
  );
}
