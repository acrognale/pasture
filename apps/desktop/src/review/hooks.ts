import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { TranscriptTurnDiff } from '~/conversation/transcript/types';

import { useTurnReview } from './TurnReviewContext';

export const useBaseCandidates = (): TranscriptTurnDiff[] => {
  const { history, targetTurnId, turnSnapshots } = useTurnReview();

  return useMemo(() => {
    if (!targetTurnId) {
      return [];
    }
    const snapshots = turnSnapshots;
    const ordered = [...history].sort((a, b) => a.turnNumber - b.turnNumber);
    const targetIndex = ordered.findIndex(
      (entry) => entry.eventId === targetTurnId
    );
    if (targetIndex <= 0) {
      return [];
    }
    return ordered
      .slice(0, targetIndex)
      .filter((entry) => snapshots.has(entry.eventId));
  }, [history, targetTurnId, turnSnapshots]);
};

export const useFileNavigation = (selectedFileId: string | null) => {
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

  const handleFileSelect = useCallback(
    (fileId: string, setSelectedFileId: (value: string | null) => void) => {
      if (selectedFileId !== fileId) {
        setSelectedFileId(fileId);
      }
      requestAnimationFrame(() => {
        const node = fileRefs.current.get(fileId);
        if (!node) {
          return;
        }
        lastScrolledFile.current = fileId;
        node.scrollIntoView({ behavior: 'smooth', block: 'start' });
      });
    },
    [selectedFileId]
  );

  const resetScrollTracking = useCallback(() => {
    lastScrolledFile.current = null;
  }, []);

  return {
    registerRef,
    scrollToFile,
    handleFileSelect,
    resetScrollTracking,
  };
};

export const useDraftComment = () => {
  const [draftTargetId, setDraftTargetId] = useState<string | null>(null);
  const [draftText, setDraftText] = useState('');

  const startDraft = useCallback((lineId: string) => {
    setDraftTargetId(lineId);
    setDraftText('');
  }, []);

  const resetDraft = useCallback(() => {
    setDraftTargetId(null);
    setDraftText('');
  }, []);

  const submitDraft = useCallback(
    (
      lineId: string,
      addComment: (input: { lineId: string; text: string }) => unknown
    ) => {
      const text = draftText.trim();
      if (!text) {
        return false;
      }
      const created = addComment({ lineId, text });
      if (created) {
        resetDraft();
        return true;
      }
      return false;
    },
    [draftText, resetDraft]
  );

  return {
    draftTargetId,
    draftText,
    setDraftText,
    startDraft,
    resetDraft,
    submitDraft,
  };
};

export const useFileCollapse = () => {
  const [collapsedFiles, setCollapsedFiles] = useState<Set<string>>(new Set());

  const toggleFileCollapse = useCallback((fileId: string) => {
    setCollapsedFiles((previous) => {
      const next = new Set(previous);
      if (next.has(fileId)) {
        next.delete(fileId);
      } else {
        next.add(fileId);
      }
      return next;
    });
  }, []);

  const resetCollapsedFiles = useCallback(() => {
    setCollapsedFiles(new Set());
  }, []);

  return {
    collapsedFiles,
    toggleFileCollapse,
    resetCollapsedFiles,
  };
};

export const useDiffRangeSelection = () => {
  const {
    history,
    snapshotDisabled,
    baselineSnapshotId,
    baseTurnId,
    targetTurnId,
    setBaseTurnId,
    selectedDiff,
  } = useTurnReview();
  const historyById = useMemo(() => {
    const map = new Map<string, TranscriptTurnDiff>();
    for (const entry of history) {
      map.set(entry.eventId, entry);
    }
    return map;
  }, [history]);
  const baseCandidates = useBaseCandidates();

  const baseDropdownDisabled = useMemo(
    () =>
      snapshotDisabled || (!baselineSnapshotId && baseCandidates.length === 0),
    [snapshotDisabled, baselineSnapshotId, baseCandidates.length]
  );

  const hasBaseChoices = useMemo(
    () => Boolean(baselineSnapshotId) || baseCandidates.length > 0,
    [baselineSnapshotId, baseCandidates.length]
  );

  const baseSelectionLabel = useMemo(() => {
    if (!baseTurnId) {
      return 'Workspace start';
    }
    const entry = historyById.get(baseTurnId);
    if (!entry) {
      return 'Workspace start';
    }
    return `Turn ${entry.turnNumber}`;
  }, [baseTurnId, historyById]);

  const baseSelectionTimestamp = useMemo(() => {
    if (!baseTurnId) {
      return null;
    }
    const entry = historyById.get(baseTurnId);
    return entry?.timestamp ?? null;
  }, [baseTurnId, historyById]);

  const patchsetSelectionLabel = useMemo(() => {
    if (targetTurnId) {
      const entry = historyById.get(targetTurnId);
      if (entry) {
        return `Turn ${entry.turnNumber}`;
      }
    }
    return selectedDiff ? `Turn ${selectedDiff.turnNumber}` : 'Latest changes';
  }, [historyById, selectedDiff, targetTurnId]);

  const patchsetSelectionTimestamp = useMemo(() => {
    const entry = targetTurnId ? historyById.get(targetTurnId) : selectedDiff;
    return entry?.timestamp ?? null;
  }, [historyById, selectedDiff, targetTurnId]);

  const patchsetOptions = useMemo(
    () => [...history].sort((a, b) => b.turnNumber - a.turnNumber),
    [history]
  );

  const rangeKey = useMemo(() => {
    if (!targetTurnId) {
      return null;
    }
    return `${baseTurnId ?? '__BASELINE__'}::${targetTurnId}`;
  }, [baseTurnId, targetTurnId]);

  useEffect(() => {
    if (!targetTurnId) {
      if (baseTurnId !== null) {
        setBaseTurnId(null);
      }
      return;
    }

    const optionIds = new Set(baseCandidates.map((entry) => entry.eventId));
    if (baseTurnId && !optionIds.has(baseTurnId)) {
      if (baselineSnapshotId) {
        setBaseTurnId(null);
        return;
      }
      const fallbackEntry = baseCandidates[baseCandidates.length - 1];
      if (fallbackEntry) {
        setBaseTurnId(fallbackEntry.eventId);
      }
      return;
    }

    if (baseTurnId === null && !baselineSnapshotId) {
      const fallbackEntry = baseCandidates[baseCandidates.length - 1];
      if (fallbackEntry) {
        setBaseTurnId(fallbackEntry.eventId);
      }
    }
  }, [
    baseCandidates,
    baseTurnId,
    baselineSnapshotId,
    setBaseTurnId,
    targetTurnId,
  ]);

  return {
    historyById,
    baseCandidates,
    baseDropdownDisabled,
    hasBaseChoices,
    baseSelectionLabel,
    baseSelectionTimestamp,
    patchsetSelectionLabel,
    patchsetSelectionTimestamp,
    patchsetOptions,
    rangeKey,
  };
};
