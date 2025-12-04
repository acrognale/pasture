import type { TranscriptTurnDiff } from '@pasture/transcript-ui';
import { useEffect, useMemo } from 'react';

import { useTurnReview } from '../TurnReviewContext';
import { useTurnSnapshots } from '../queries';
import { RangeSelector } from './RangeSelector';

export function RangeSelectorSection() {
  const {
    conversationId,
    history,
    baseTurnId,
    targetTurnId,
    setBaseTurnId,
    selectDiffByEventId,
    selectedDiff,
  } = useTurnReview();

  const { snapshotDisabled, baselineSnapshotId, turnSnapshots } =
    useTurnSnapshots(conversationId);

  // Build history lookup
  const historyById = useMemo(() => {
    const map = new Map<string, TranscriptTurnDiff>();
    for (const entry of history) {
      map.set(entry.eventId, entry);
    }
    return map;
  }, [history]);

  // Compute base candidates (turns before target that have snapshots)
  const baseCandidates = useMemo(() => {
    if (!targetTurnId) {
      return [];
    }
    const ordered = [...history].sort((a, b) => a.turnNumber - b.turnNumber);
    const targetIndex = ordered.findIndex(
      (entry) => entry.eventId === targetTurnId
    );
    if (targetIndex <= 0) {
      return [];
    }
    return ordered.slice(0, targetIndex).filter((entry) => {
      const snapshotKey = entry.turnId ?? entry.eventId;
      return turnSnapshots.has(snapshotKey);
    });
  }, [history, targetTurnId, turnSnapshots]);

  // Auto-select base turn when needed
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

  // Compute labels
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

  const baseDropdownDisabled =
    snapshotDisabled || (!baselineSnapshotId && baseCandidates.length === 0);

  const hasBaseChoices =
    Boolean(baselineSnapshotId) || baseCandidates.length > 0;

  return (
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
  );
}
