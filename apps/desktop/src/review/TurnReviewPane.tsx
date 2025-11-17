import { useEffect, useMemo, useState } from 'react';

import { useTurnReview } from './TurnReviewContext';
import { EmptyReviewState } from './components/EmptyReviewState';
import type { DiffViewMode } from './components/FileDiffSection';
import { FileDiffSection } from './components/FileDiffSection';
import { FileSidebar } from './components/FileSidebar';
import { RangeSelector } from './components/RangeSelector';
import { TurnReviewHeader } from './components/TurnReviewHeader';
import {
  buildFileDiffStats,
  groupCommentsByFile,
  groupCommentsByLine,
} from './diff-utils';
import {
  useDiffRangeSelection,
  useDraftComment,
  useFileCollapse,
  useFileNavigation,
} from './hooks';

type TurnReviewPaneProps = {
  workspacePath: string;
  onRequestFeedback?: (prompt: string) => void;
  disabled?: boolean;
  onClose?: () => void;
};

const getInitialViewMode = (): DiffViewMode => {
  if (typeof window === 'undefined') {
    return 'split';
  }
  return window.innerWidth < 1220 ? 'unified' : 'split';
};

export function TurnReviewPane({
  workspacePath,
  onRequestFeedback,
  disabled,
  onClose,
}: TurnReviewPaneProps) {
  const review = useTurnReview();
  const {
    diff,
    comments,
    selectedDiff,
    baselineSnapshotId,
    baseTurnId,
    setBaseTurnId,
    targetTurnId,
    selectDiffByEventId,
    snapshotDisabled,
    selectedFileId,
    setSelectedFileId,
    removeComment,
    addComment,
    buildFeedbackPrompt,
  } = review;
  const diffFiles = useMemo(() => diff?.files ?? [], [diff]);
  const commentCount = comments.length;
  const [viewMode, setViewMode] = useState<DiffViewMode>(getInitialViewMode);
  const [userSetViewMode, setUserSetViewMode] = useState(false);

  const fileDiffStats = useMemo(
    () => buildFileDiffStats(diffFiles),
    [diffFiles]
  );
  const commentsByLine = useMemo(
    () => groupCommentsByLine(comments),
    [comments]
  );
  const commentsByFile = useMemo(
    () => groupCommentsByFile(comments),
    [comments]
  );

  const { collapsedFiles, toggleFileCollapse, resetCollapsedFiles } =
    useFileCollapse();
  const {
    draftTargetId,
    draftText,
    setDraftText,
    startDraft,
    resetDraft,
    submitDraft,
  } = useDraftComment();
  const {
    baseCandidates,
    baseDropdownDisabled,
    hasBaseChoices,
    baseSelectionLabel,
    baseSelectionTimestamp,
    patchsetSelectionLabel,
    patchsetSelectionTimestamp,
    patchsetOptions,
    rangeKey,
  } = useDiffRangeSelection();
  const { registerRef, scrollToFile, handleFileSelect, resetScrollTracking } =
    useFileNavigation(selectedFileId);

  useEffect(() => {
    resetDraft();
    resetCollapsedFiles();
    resetScrollTracking();
  }, [rangeKey, resetCollapsedFiles, resetDraft, resetScrollTracking]);

  useEffect(() => {
    if (!diffFiles.length) {
      if (selectedFileId !== null) {
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
  }, [diffFiles, selectedFileId, setSelectedFileId]);

  useEffect(() => {
    scrollToFile(selectedFileId);
  }, [selectedFileId, scrollToFile]);

  useEffect(() => {
    if (userSetViewMode) {
      return;
    }

    const handleResize = () => {
      const shouldBeUnified = window.innerWidth < 1220;
      const newMode: DiffViewMode = shouldBeUnified ? 'unified' : 'split';
      if (newMode !== viewMode) {
        setViewMode(newMode);
      }
    };

    window.addEventListener('resize', handleResize);
    return () => {
      window.removeEventListener('resize', handleResize);
    };
  }, [userSetViewMode, viewMode]);

  const handleViewModeChange = (mode: DiffViewMode) => {
    setViewMode(mode);
    setUserSetViewMode(true);
  };

  const handleSubmitDraft = (lineId: string) => {
    submitDraft(lineId, addComment);
  };

  const showPane = diffFiles.length > 0;
  const canBuildFeedback = commentCount > 0;
  const turnNumber = selectedDiff?.turnNumber;

  return (
    <div className="flex h-full w-full flex-col bg-background text-foreground text-transcript-code leading-transcript-code">
      <div className="border-b border-border/60 px-6 py-4">
        <TurnReviewHeader
          showPane={showPane}
          commentCount={commentCount}
          turnNumber={turnNumber}
          viewMode={viewMode}
          onViewModeChange={handleViewModeChange}
          canBuildFeedback={canBuildFeedback}
          disabled={disabled}
          onGiveFeedback={() => {
            const prompt = buildFeedbackPrompt();
            if (prompt) {
              onRequestFeedback?.(prompt);
            }
            onClose?.();
          }}
          onClose={onClose}
        />
        <RangeSelector
          baseSelectionLabel={baseSelectionLabel}
          baseSelectionTimestamp={baseSelectionTimestamp}
          baseDropdownDisabled={baseDropdownDisabled}
          hasBaseChoices={hasBaseChoices}
          baselineSnapshotId={baselineSnapshotId}
          baseTurnId={baseTurnId}
          setBaseTurnId={setBaseTurnId}
          baseCandidates={baseCandidates}
          patchsetSelectionLabel={patchsetSelectionLabel}
          patchsetSelectionTimestamp={patchsetSelectionTimestamp}
          patchsetOptions={patchsetOptions}
          targetTurnId={targetTurnId}
          selectDiffByEventId={selectDiffByEventId}
          snapshotDisabled={snapshotDisabled}
        />
      </div>
      <div className="flex min-h-0 flex-1">
        <FileSidebar
          workspacePath={workspacePath}
          files={diffFiles}
          selectedFileId={selectedFileId}
          fileDiffStats={fileDiffStats}
          commentsByFile={commentsByFile}
          onFileSelect={(fileId) => handleFileSelect(fileId, setSelectedFileId)}
        />
        {showPane ? (
          <div className="flex-1 min-h-0 overflow-y-auto px-6 py-4">
            <div className="flex flex-col gap-4">
              {diffFiles.map((file) => (
                <FileDiffSection
                  key={file.id}
                  workspacePath={workspacePath}
                  file={file}
                  viewMode={viewMode}
                  commentsByLine={commentsByLine}
                  draftTargetId={draftTargetId}
                  draftText={draftText}
                  onStartDraft={startDraft}
                  onCancelDraft={resetDraft}
                  onSubmitDraft={handleSubmitDraft}
                  setDraftText={setDraftText}
                  onDeleteComment={removeComment}
                  isCollapsed={
                    collapsedFiles.has(file.id) && selectedFileId !== file.id
                  }
                  onToggleCollapse={() => toggleFileCollapse(file.id)}
                  isActive={selectedFileId === file.id}
                  registerRef={registerRef(file.id)}
                />
              ))}
            </div>
          </div>
        ) : (
          <EmptyReviewState />
        )}
      </div>
    </div>
  );
}
