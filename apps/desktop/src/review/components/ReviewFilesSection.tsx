import type { GetRepoDiffParams, GetTurnDiffRangeParams } from '@pasture/protocol';
import type { TranscriptTurnDiff } from '@pasture/transcript-ui';
import { useEffect, useMemo, useState } from 'react';

import { useTurnReview } from '../TurnReviewContext';
import { buildFileDiffStats, parseUnifiedDiff } from '../diff';
import { EMPTY_REVIEW_COMMENTS, useReviewComments } from '../commentsStore';
import type { ParsedTurnDiff, ParsedTurnDiffFile } from '../types';
import { makeRepoReviewKey, makeTurnReviewKey } from '../reviewKeys';
import { useTurnDiffRange, useTurnSnapshots } from '../queries';
import { EmptyReviewState } from './EmptyReviewState';
import { FileSidebar } from './FileSidebar';

export type TurnReviewFilesSectionProps = {
  workspacePath: string;
  focusFilePath?: string | null;
  onFocusFilePathConsumed?: () => void;
  emptyStateMessage?: string;
  onOpenFile?: (request: {
    reviewKey: string;
    file: ParsedTurnDiffFile;
    baseEventId: string | null;
    targetEventId: string;
    commentableLines: number[];
  }) => void;
};

function buildCommentableLines(file: ParsedTurnDiffFile): number[] {
  const lines = new Set<number>();
  for (const hunk of file.hunks) {
    for (const line of hunk.lines) {
      if (line.kind === 'addition' && line.newNumber != null) {
        lines.add(line.newNumber);
      }
    }
  }
  return [...lines].sort((a, b) => a - b);
}

export function TurnReviewFilesSection({
  workspacePath,
  focusFilePath,
  onFocusFilePathConsumed,
  emptyStateMessage,
  onOpenFile,
}: TurnReviewFilesSectionProps) {
  const {
    conversationId,
    history,
    baseTurnId,
    targetTurnId,
    selectedDiff,
  } = useTurnReview();

  const [selectedFileId, setSelectedFileId] = useState<string | null>(null);

  // Server state
  const { snapshotDisabled } = useTurnSnapshots(conversationId);

  const historyById = useMemo(() => {
    const map = new Map<string, TranscriptTurnDiff>();
    for (const entry of history) {
      map.set(entry.eventId, entry);
    }
    return map;
  }, [history]);

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

  const { parsedDiff: rangeParsedDiff } = useTurnDiffRange(diffRangeParams);

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

  useEffect(() => {
    if (!diffFiles.length) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setSelectedFileId(null);
      return;
    }
    if (!selectedFileId || !diffFiles.some((file) => file.id === selectedFileId)) {
      setSelectedFileId(diffFiles[0]?.id ?? null);
    }
  }, [diffFiles, selectedFileId]);

  useEffect(() => {
    if (!focusFilePath || !diffFiles.length) {
      return;
    }
    const target = diffFiles.find((file) => file.displayPath === focusFilePath);
    if (target) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setSelectedFileId(target.id);
    }
    onFocusFilePathConsumed?.();
  }, [diffFiles, focusFilePath, onFocusFilePathConsumed]);

  const reviewKey = useMemo(() => {
    if (!conversationId) {
      return null;
    }
    if (diffRangeParams?.targetEventId) {
      return makeTurnReviewKey({
        conversationId,
        baseEventId: diffRangeParams.baseEventId ?? null,
        targetEventId: diffRangeParams.targetEventId,
      });
    }
    if (!targetTurnId) {
      return null;
    }
    return makeTurnReviewKey({
      conversationId,
      baseEventId: baseTurnId,
      targetEventId: targetTurnId,
    });
  }, [baseTurnId, conversationId, diffRangeParams, targetTurnId]);

  const commentsForReview = useReviewComments((state) =>
    reviewKey
      ? (state.commentsByReviewKey[reviewKey] ?? EMPTY_REVIEW_COMMENTS)
      : EMPTY_REVIEW_COMMENTS
  );

  const fileDiffStats = useMemo(() => buildFileDiffStats(diffFiles), [diffFiles]);
  const commentsByFileId = useMemo(() => {
    const counts = new Map<string, number>();
    const totalsByPath = new Map<string, number>();
    for (const comment of commentsForReview) {
      totalsByPath.set(
        comment.filePath,
        (totalsByPath.get(comment.filePath) ?? 0) + 1
      );
    }
    for (const file of diffFiles) {
      const total = totalsByPath.get(file.displayPath) ?? 0;
      if (total > 0) {
        counts.set(file.id, total);
      }
    }
    return counts;
  }, [commentsForReview, diffFiles]);

  if (!diffFiles.length || !reviewKey) {
    return <EmptyReviewState message={emptyStateMessage} />;
  }

  return (
    <div className="flex min-h-0 flex-1">
      <FileSidebar
        workspacePath={workspacePath}
        files={diffFiles}
        selectedFileId={selectedFileId}
        fileDiffStats={fileDiffStats}
        commentsByFile={commentsByFileId}
        onFileSelect={(fileId) => {
          setSelectedFileId(fileId);
          const file = diffFiles.find((candidate) => candidate.id === fileId);
          if (!file) {
            return;
          }
          if (!diffRangeParams?.targetEventId) {
            return;
          }
          onOpenFile?.({
            reviewKey,
            file,
            baseEventId: diffRangeParams.baseEventId ?? null,
            targetEventId: diffRangeParams.targetEventId,
            commentableLines: buildCommentableLines(file),
          });
        }}
      />
      <div className="flex-1 min-h-0">
        <EmptyReviewState message="Select a file to review." />
      </div>
    </div>
  );
}

export type RepoReviewFilesSectionProps = {
  workspacePath: string;
  repoParams: GetRepoDiffParams;
  focusFilePath?: string | null;
  onFocusFilePathConsumed?: () => void;
  emptyStateMessage?: string;
  onOpenFile?: (request: {
    reviewKey: string;
    file: ParsedTurnDiffFile;
    repoParams: GetRepoDiffParams;
    commentableLines: number[];
  }) => void;
};

export function RepoReviewFilesSection({
  workspacePath,
  repoParams,
  focusFilePath,
  onFocusFilePathConsumed,
  emptyStateMessage,
  onOpenFile,
}: RepoReviewFilesSectionProps) {
  const { selectedDiff } = useTurnReview();
  const [selectedFileId, setSelectedFileId] = useState<string | null>(null);

  const parsedDiff = useMemo<ParsedTurnDiff | null>(() => {
    const unified = selectedDiff?.unifiedDiff ?? '';
    if (!unified.trim()) {
      return null;
    }
    return parseUnifiedDiff(unified);
  }, [selectedDiff]);

  const diffFiles = useMemo(() => parsedDiff?.files ?? [], [parsedDiff]);

  useEffect(() => {
    if (!diffFiles.length) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setSelectedFileId(null);
      return;
    }
    if (!selectedFileId || !diffFiles.some((file) => file.id === selectedFileId)) {
      setSelectedFileId(diffFiles[0]?.id ?? null);
    }
  }, [diffFiles, selectedFileId]);

  useEffect(() => {
    if (!focusFilePath || !diffFiles.length) {
      return;
    }
    const target = diffFiles.find((file) => file.displayPath === focusFilePath);
    if (target) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setSelectedFileId(target.id);
    }
    onFocusFilePathConsumed?.();
  }, [diffFiles, focusFilePath, onFocusFilePathConsumed]);

  const reviewKey = useMemo(() => makeRepoReviewKey(repoParams), [repoParams]);

  const commentsForReview = useReviewComments(
    (state) => state.commentsByReviewKey[reviewKey] ?? EMPTY_REVIEW_COMMENTS
  );

  const fileDiffStats = useMemo(() => buildFileDiffStats(diffFiles), [diffFiles]);
  const commentsByFileId = useMemo(() => {
    const counts = new Map<string, number>();
    const totalsByPath = new Map<string, number>();
    for (const comment of commentsForReview) {
      totalsByPath.set(
        comment.filePath,
        (totalsByPath.get(comment.filePath) ?? 0) + 1
      );
    }
    for (const file of diffFiles) {
      const total = totalsByPath.get(file.displayPath) ?? 0;
      if (total > 0) {
        counts.set(file.id, total);
      }
    }
    return counts;
  }, [commentsForReview, diffFiles]);

  if (!diffFiles.length) {
    return <EmptyReviewState message={emptyStateMessage} />;
  }

  return (
    <div className="flex min-h-0 flex-1">
      <FileSidebar
        workspacePath={workspacePath}
        files={diffFiles}
        selectedFileId={selectedFileId}
        fileDiffStats={fileDiffStats}
        commentsByFile={commentsByFileId}
        onFileSelect={(fileId) => {
          setSelectedFileId(fileId);
          const file = diffFiles.find((candidate) => candidate.id === fileId);
          if (!file) {
            return;
          }
          onOpenFile?.({
            reviewKey,
            repoParams,
            file,
            commentableLines: buildCommentableLines(file),
          });
        }}
      />
      <div className="flex-1 min-h-0">
        <EmptyReviewState message="Select a file to review." />
      </div>
    </div>
  );
}
