import type { GetTurnDiffRangeParams } from '@pasture/protocol';
import type { TranscriptTurnDiff } from '@pasture/transcript-ui';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import { DraftCommentProvider } from '../DraftCommentContext';
import { useTurnReview } from '../TurnReviewContext';
import { groupCommentsByLine, parseUnifiedDiff } from '../diff';
import { useTurnDiffRange, useTurnSnapshots } from '../queries';
import type { ParsedTurnDiff } from '../types';
import { EmptyReviewState } from './EmptyReviewState';
import type { DiffViewMode } from './FileDiffSection';
import { FileDiffSection } from './FileDiffSection';

export type DiffContentSectionProps = {
  workspacePath: string;
  viewMode: DiffViewMode;
  focusFilePath?: string | null;
  onFocusFilePathConsumed?: () => void;
};

export function DiffContentSection({
  workspacePath,
  viewMode,
  focusFilePath,
  onFocusFilePathConsumed,
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

  const [selectedFileId, setSelectedFileId] = useState<string | null>(null);

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

  // Reset scroll tracking when range changes
  useEffect(() => {
    lastScrolledFile.current = null;
  }, [rangeKey]);

  // Auto-select first file when diff changes
  useEffect(() => {
    if (!diffFiles.length) {
      if (selectedFileId !== null) {
        // eslint-disable-next-line react-hooks/set-state-in-effect
        setSelectedFileId(null);
      }
      return;
    }
    if (
      !selectedFileId ||
      !diffFiles.some((file) => file.id === selectedFileId)
    ) {
      const firstFile = diffFiles[0];
      if (firstFile) {
        setSelectedFileId(firstFile.id);
      }
    }
  }, [diffFiles, selectedFileId]);

  // Focus a specific file when requested (e.g., from ChangesSidebar)
  useEffect(() => {
    if (!focusFilePath || !diffFiles.length) {
      return;
    }

    const target = diffFiles.find((file) => file.displayPath === focusFilePath);
    if (target) {
      if (target.id !== selectedFileId) {
        // eslint-disable-next-line react-hooks/set-state-in-effect
        setSelectedFileId(target.id);
      } else {
        // File is already selected, but we still need to scroll to it
        // Reset lastScrolledFile to allow scrolling to the same file again
        lastScrolledFile.current = null;
        scrollToFile(target.id);
      }
    }

    // Clear the focus path so clicking the same file again will work
    onFocusFilePathConsumed?.();
  }, [
    diffFiles,
    focusFilePath,
    onFocusFilePathConsumed,
    scrollToFile,
    selectedFileId,
  ]);

  // Scroll to selected file
  useEffect(() => {
    scrollToFile(selectedFileId);
  }, [selectedFileId, scrollToFile]);

  const showPane = diffFiles.length > 0;

  return (
    <div className="flex min-h-0 flex-1">
      {showPane ? (
        <DraftCommentProvider>
          <div className="flex-1 min-h-0 overflow-y-auto px-6 py-4">
            <div className="flex flex-col gap-4">
              {diffFiles.map((file) => (
                <FileDiffSection
                  key={`${rangeKey}:${file.id}`}
                  workspacePath={workspacePath}
                  file={file}
                  viewMode={viewMode}
                  commentsByLine={commentsByLine}
                  onDeleteComment={removeComment}
                  isActive={selectedFileId === file.id}
                  registerRef={registerRef(file.id)}
                />
              ))}
            </div>
          </div>
        </DraftCommentProvider>
      ) : (
        <EmptyReviewState />
      )}
    </div>
  );
}
