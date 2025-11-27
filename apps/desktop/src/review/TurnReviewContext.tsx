/* eslint-disable react-hooks/set-state-in-effect */
import {
  type ReactNode,
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import type { GetTurnDiffRangeParams } from '~/codex.gen';
import type { TranscriptTurnDiff } from '~/conversation/transcript/types';

import { parseUnifiedDiff } from './diff-parser';
import type {
  ParsedTurnDiff,
  ParsedTurnDiffFile,
  ParsedTurnDiffHunk,
  ParsedTurnDiffLine,
  TurnReviewComment,
  TurnReviewCommentInput,
} from './types';
import { useTurnDiffRange } from './use-turn-diff-range';
import { useTurnSnapshots } from './use-turn-snapshots';

type TurnReviewContextValue = {
  diff: ParsedTurnDiff | null;
  diffEventId: string | null;
  selectedDiff: TranscriptTurnDiff | null;
  history: readonly TranscriptTurnDiff[];
  selectDiffByEventId: (eventId: string) => void;
  baseTurnId: string | null;
  setBaseTurnId: (eventId: string | null) => void;
  targetTurnId: string | null;
  snapshotDisabled: boolean;
  baselineSnapshotId: string | null;
  turnSnapshots: ReadonlyMap<string, string>;
  selectedFileId: string | null;
  setSelectedFileId: (id: string | null) => void;
  comments: readonly TurnReviewComment[];
  addComment: (input: TurnReviewCommentInput) => TurnReviewComment | null;
  updateComment: (id: string, text: string) => void;
  removeComment: (id: string) => void;
  getLineReference: (lineId: string) => DiffLineReference | undefined;
  conversationId: string | null;
  buildFeedbackPrompt: () => string | null;
};

type DiffLineReference = {
  file: ParsedTurnDiffFile;
  hunk: ParsedTurnDiffHunk;
  line: ParsedTurnDiffLine;
};

type TurnReviewProviderProps = {
  conversationId: string | null;
  latestDiff: TranscriptTurnDiff | null;
  history: readonly TranscriptTurnDiff[];
  children: ReactNode;
};

const makeCommentId = () => {
  if (
    typeof crypto !== 'undefined' &&
    typeof crypto.randomUUID === 'function'
  ) {
    return crypto.randomUUID();
  }
  return `comment-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
};

const defaultTurnReviewContext: TurnReviewContextValue = {
  diff: null,
  diffEventId: null,
  selectedDiff: null,
  history: [],
  selectDiffByEventId: () => undefined,
  baseTurnId: null,
  setBaseTurnId: () => undefined,
  targetTurnId: null,
  snapshotDisabled: true,
  baselineSnapshotId: null,
  turnSnapshots: new Map(),
  selectedFileId: null,
  setSelectedFileId: () => undefined,
  comments: [],
  addComment: () => null,
  updateComment: () => undefined,
  removeComment: () => undefined,
  getLineReference: () => undefined,
  conversationId: null,
  buildFeedbackPrompt: () => null,
};

const TurnReviewContext = createContext<TurnReviewContextValue>(
  defaultTurnReviewContext
);

const buildLineLookup = (
  diff: ParsedTurnDiff | null
): Map<string, DiffLineReference> => {
  const lookup = new Map<string, DiffLineReference>();
  if (!diff) {
    return lookup;
  }
  for (const file of diff.files) {
    for (const hunk of file.hunks) {
      for (const line of hunk.lines) {
        lookup.set(line.id, { file, hunk, line });
      }
    }
  }
  return lookup;
};

export function TurnReviewProvider({
  conversationId,
  latestDiff,
  history,
  children,
}: TurnReviewProviderProps) {
  const [baseTurnId, setBaseTurnIdState] = useState<string | null>(null);
  const [targetTurnId, setTargetTurnId] = useState<string | null>(null);
  const [selectedFileId, setSelectedFileId] = useState<string | null>(null);
  const [commentState, setCommentState] = useState<
    Record<string, TurnReviewComment[]>
  >({});

  const autoFollowingTurnNumber = useRef<number | null>(null);

  // Server state via react-query
  const { snapshotDisabled, baselineSnapshotId, turnSnapshots } =
    useTurnSnapshots(conversationId);

  // Reset local state when conversation changes
  useEffect(() => {
    setCommentState({});
    setBaseTurnIdState(null);
    setTargetTurnId(null);
    setSelectedFileId(null);
    autoFollowingTurnNumber.current = null;
  }, [conversationId]);

  // Auto-follow latest turn
  useEffect(() => {
    if (!history.length) {
      setTargetTurnId(null);
      autoFollowingTurnNumber.current = null;
      return;
    }

    const currentId = targetTurnId;
    const latest = history[history.length - 1];
    const currentEntry = currentId
      ? history.find((entry) => entry.eventId === currentId)
      : null;

    if (
      !currentId ||
      (currentEntry &&
        autoFollowingTurnNumber.current !== null &&
        currentEntry.turnNumber === autoFollowingTurnNumber.current)
    ) {
      setTargetTurnId(latest.eventId);
      autoFollowingTurnNumber.current = latest.turnNumber;
      return;
    }

    if (!currentEntry) {
      setTargetTurnId(latest.eventId);
      autoFollowingTurnNumber.current = latest.turnNumber;
      return;
    }

    autoFollowingTurnNumber.current = null;
  }, [history, targetTurnId]);

  // Validate baseTurnId against targetTurnId
  useEffect(() => {
    if (!history.length || !targetTurnId) {
      if (baseTurnId !== null) {
        setBaseTurnIdState(null);
      }
      return;
    }
    if (!baseTurnId) {
      return;
    }
    const baseIndex = history.findIndex(
      (entry) => entry.eventId === baseTurnId
    );
    const targetIndex = history.findIndex(
      (entry) => entry.eventId === targetTurnId
    );
    if (baseIndex === -1 || targetIndex === -1 || baseIndex > targetIndex) {
      setBaseTurnIdState(null);
    }
  }, [baseTurnId, history, targetTurnId]);

  const historyById = useMemo(() => {
    const map = new Map<string, TranscriptTurnDiff>();
    for (const entry of history) {
      map.set(entry.eventId, entry);
    }
    return map;
  }, [history]);

  const selectedDiff = useMemo<TranscriptTurnDiff | null>(() => {
    if (!targetTurnId) {
      return latestDiff ?? null;
    }
    return (
      history.find((entry) => entry.eventId === targetTurnId) ??
      latestDiff ??
      null
    );
  }, [history, latestDiff, targetTurnId]);

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

  // Use range diff if available, otherwise fall back to the selected diff's unified diff
  const parsedDiff = rangeParsedDiff ?? fallbackParsedDiff;

  const rangeKey = useMemo(() => {
    if (!targetTurnId) {
      return null;
    }
    return `${baseTurnId ?? '__BASELINE__'}::${targetTurnId}`;
  }, [baseTurnId, targetTurnId]);

  const lineLookup = useMemo(() => buildLineLookup(parsedDiff), [parsedDiff]);

  const comments = useMemo<readonly TurnReviewComment[]>(() => {
    if (!rangeKey) {
      return [];
    }
    return commentState[rangeKey] ?? [];
  }, [commentState, rangeKey]);

  // Initialize comment state for new ranges
  useEffect(() => {
    if (!rangeKey) {
      return;
    }
    setCommentState((prev) => {
      if (prev[rangeKey]) {
        return prev;
      }
      return {
        ...prev,
        [rangeKey]: [],
      };
    });
  }, [rangeKey]);

  // Reset selected file when diff changes
  useEffect(() => {
    setSelectedFileId(null);
  }, [parsedDiff]);

  const addComment = useCallback(
    (input: TurnReviewCommentInput): TurnReviewComment | null => {
      if (!rangeKey || !parsedDiff) {
        return null;
      }
      const reference = lineLookup.get(input.lineId);
      if (!reference) {
        return null;
      }
      const trimmed = input.text.trim();
      if (!trimmed.length) {
        return null;
      }
      const comment: TurnReviewComment = {
        id: makeCommentId(),
        fileId: reference.file.id,
        hunkId: reference.hunk.id,
        lineId: reference.line.id,
        filePath: reference.file.displayPath,
        lineKind: reference.line.kind,
        oldLineNumber: reference.line.oldNumber,
        newLineNumber: reference.line.newNumber,
        text: trimmed,
        createdAt: new Date().toISOString(),
      };
      setCommentState((prev) => {
        const current = prev[rangeKey] ?? [];
        return {
          ...prev,
          [rangeKey]: [...current, comment],
        };
      });
      return comment;
    },
    [lineLookup, parsedDiff, rangeKey]
  );

  const updateComment = useCallback(
    (id: string, text: string) => {
      if (!rangeKey) {
        return;
      }
      const trimmed = text.trim();
      setCommentState((prev) => {
        const current = prev[rangeKey] ?? [];
        return {
          ...prev,
          [rangeKey]: current.map((comment) =>
            comment.id === id
              ? {
                  ...comment,
                  text: trimmed,
                }
              : comment
          ),
        };
      });
    },
    [rangeKey]
  );

  const removeComment = useCallback(
    (id: string) => {
      if (!rangeKey) {
        return;
      }
      setCommentState((prev) => {
        const current = prev[rangeKey] ?? [];
        return {
          ...prev,
          [rangeKey]: current.filter((comment) => comment.id !== id),
        };
      });
    },
    [rangeKey]
  );

  const diffEventId = targetTurnId;

  const buildFeedbackPrompt = useCallback((): string | null => {
    if (!comments.length) {
      return null;
    }
    const segments = comments.map((comment) => {
      const reference = lineLookup.get(comment.lineId);
      const line = reference?.line;
      const lineLabel = (() => {
        if (comment.newLineNumber != null) {
          return `line ${comment.newLineNumber}`;
        }
        if (comment.oldLineNumber != null) {
          return `removed line ${comment.oldLineNumber}`;
        }
        return 'unspecified line';
      })();
      const snippet =
        line && line.kind !== 'metadata' && line.text.trim().length
          ? `\n    Context: ${line.prefix}${line.text}`
          : '';
      return `- ${comment.filePath} (${lineLabel}): ${comment.text}${snippet}`;
    });
    const turnLabel = selectedDiff
      ? `turn ${selectedDiff.turnNumber}`
      : 'this turn';
    return `Here is my consolidated review of ${turnLabel}:\n${segments.join('\n')}\n\nPlease address each comment before continuing.`;
  }, [comments, lineLookup, selectedDiff]);

  const selectDiffByEventId = useCallback((eventId: string) => {
    setTargetTurnId(eventId);
  }, []);

  const handleSetBaseTurnId = useCallback((eventId: string | null) => {
    setBaseTurnIdState(eventId);
  }, []);

  const contextValue = useMemo<TurnReviewContextValue>(
    () => ({
      diff: parsedDiff,
      diffEventId,
      selectedDiff,
      history,
      selectDiffByEventId,
      baseTurnId,
      setBaseTurnId: handleSetBaseTurnId,
      targetTurnId,
      snapshotDisabled,
      baselineSnapshotId,
      turnSnapshots,
      selectedFileId,
      setSelectedFileId,
      comments,
      addComment,
      updateComment,
      removeComment,
      getLineReference: (lineId) => lineLookup.get(lineId),
      conversationId,
      buildFeedbackPrompt,
    }),
    [
      addComment,
      baselineSnapshotId,
      baseTurnId,
      buildFeedbackPrompt,
      comments,
      conversationId,
      diffEventId,
      handleSetBaseTurnId,
      history,
      lineLookup,
      parsedDiff,
      selectedDiff,
      selectedFileId,
      setSelectedFileId,
      snapshotDisabled,
      targetTurnId,
      turnSnapshots,
      selectDiffByEventId,
      updateComment,
      removeComment,
    ]
  );

  return (
    <TurnReviewContext.Provider value={contextValue}>
      {children}
    </TurnReviewContext.Provider>
  );
}

export const useTurnReview = () => {
  return useContext(TurnReviewContext);
};
