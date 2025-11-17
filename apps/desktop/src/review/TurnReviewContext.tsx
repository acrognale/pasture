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
import type {
  GetTurnDiffRangeParams,
  ListTurnSnapshotsResponse,
} from '~/codex.gen';
import { Codex } from '~/codex/client';
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

type DiffCacheEntry = {
  raw: string;
  parsed: ParsedTurnDiff | null;
  resolved: boolean;
};

type RangeDiffFetchResult =
  | {
      kind: 'success';
      diff: string;
    }
  | {
      kind: 'error';
      message: string;
      retryable: boolean;
    };

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

const RANGE_DIFF_RETRY_DELAY_MS = 1500;

const hashString = (input: string): string => {
  let hash = 0;
  for (let index = 0; index < input.length; index += 1) {
    hash = (hash * 31 + input.charCodeAt(index)) | 0;
  }
  return hash.toString();
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

const TurnReviewContext = createContext<TurnReviewContextValue | null>(null);

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
  const [diffCache, setDiffCache] = useState<Record<string, DiffCacheEntry>>(
    {}
  );
  const [snapshotData, setSnapshotData] =
    useState<ListTurnSnapshotsResponse | null>(null);
  const [rangeDiffResult, setRangeDiffResult] =
    useState<RangeDiffFetchResult | null>(null);
  const [rangeDiffReloadKey, setRangeDiffReloadKey] = useState(0);

  const snapshotRequestRef = useRef(0);
  const lastSnapshotRefreshKeyRef = useRef<string | null>(null);
  const lastSnapshotRefreshRawRef = useRef<string | null>(null);
  const autoFollowingTurnNumber = useRef<number | null>(null);

  const refreshSnapshots = useCallback(async () => {
    if (!conversationId) {
      setSnapshotData(null);
      return;
    }
    const requestId = snapshotRequestRef.current + 1;
    snapshotRequestRef.current = requestId;
    try {
      const response = await Codex.listTurnSnapshots({ conversationId });
      if (snapshotRequestRef.current === requestId) {
        setSnapshotData(response);
      }
    } catch (error) {
      console.debug('[TurnReview] Failed to load snapshot metadata', error);
      if (snapshotRequestRef.current === requestId) {
        setSnapshotData({
          disabled: true,
          baseCommitId: null,
          snapshots: [],
        });
      }
    }
  }, [conversationId]);

  useEffect(() => {
    void refreshSnapshots();
  }, [refreshSnapshots, history.length]);

  useEffect(() => {
    setCommentState({});
    setDiffCache({});
    setBaseTurnIdState(null);
    setTargetTurnId(null);
    setSelectedFileId(null);
    lastSnapshotRefreshKeyRef.current = null;
    lastSnapshotRefreshRawRef.current = null;
    autoFollowingTurnNumber.current = null;
  }, [conversationId]);

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

  const selectedDiffRevision = useMemo(() => {
    if (!selectedDiff) {
      return null;
    }
    const unified = selectedDiff.unifiedDiff ?? '';
    return `${selectedDiff.eventId ?? 'event'}::${selectedDiff.timestamp ?? ''}::${hashString(unified)}`;
  }, [selectedDiff]);

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

  const turnSnapshots = useMemo<ReadonlyMap<string, string>>(() => {
    if (!snapshotData) {
      return new Map();
    }
    const entries = new Map<string, string>();
    for (const descriptor of snapshotData.snapshots) {
      entries.set(descriptor.eventId, descriptor.commitId);
    }
    return entries;
  }, [snapshotData]);

  const baselineSnapshotId = snapshotData?.baseCommitId ?? null;
  const snapshotDisabled = snapshotData?.disabled ?? false;

  const diffRangeInput = useMemo<GetTurnDiffRangeParams | null>(() => {
    if (!conversationId || !targetTurnId || snapshotDisabled) {
      return null;
    }
    return {
      conversationId,
      baseEventId: baseTurnId,
      targetEventId: targetTurnId,
    };
  }, [baseTurnId, conversationId, snapshotDisabled, targetTurnId]);

  const extractErrorMessage = (error: unknown): string => {
    if (error instanceof Error) {
      return error.message;
    }
    if (typeof error === 'string') {
      return error;
    }
    try {
      return JSON.stringify(error);
    } catch {
      return 'Unknown error';
    }
  };

  const isSnapshotUnavailableError = (message: string): boolean =>
    message.toLowerCase().includes('snapshot data unavailable');

  useEffect(() => {
    if (!diffRangeInput) {
      setRangeDiffResult(null);
      return;
    }
    let cancelled = false;
    void (async () => {
      try {
        const response = await Codex.getTurnDiffRange(diffRangeInput);
        if (!cancelled) {
          setRangeDiffResult({
            kind: 'success',
            diff: response.unifiedDiff ?? '',
          });
        }
      } catch (error) {
        console.debug('[TurnReview] Failed to load diff range', error);
        const message = extractErrorMessage(error);
        if (!cancelled) {
          setRangeDiffResult({
            kind: 'error',
            message,
            retryable: isSnapshotUnavailableError(message),
          });
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [
    diffRangeInput,
    selectedDiffRevision,
    snapshotDisabled,
    rangeDiffReloadKey,
  ]);

  useEffect(() => {
    if (
      !rangeDiffResult ||
      rangeDiffResult.kind !== 'error' ||
      !rangeDiffResult.retryable
    ) {
      return;
    }
    const timer = window.setTimeout(() => {
      setRangeDiffReloadKey((value) => value + 1);
    }, RANGE_DIFF_RETRY_DELAY_MS);
    return () => {
      window.clearTimeout(timer);
    };
  }, [rangeDiffResult]);

  const rangeKey = useMemo(() => {
    if (!targetTurnId) {
      return null;
    }
    return `${baseTurnId ?? '__BASELINE__'}::${targetTurnId}`;
  }, [baseTurnId, targetTurnId]);

  const diffRevisionKey = useMemo(() => {
    if (!targetTurnId || !selectedDiffRevision) {
      return null;
    }
    return `${targetTurnId}::${selectedDiffRevision}`;
  }, [selectedDiffRevision, targetTurnId]);

  useEffect(() => {
    if (!diffRevisionKey) {
      return;
    }
    if (!rangeDiffResult || rangeDiffResult.kind !== 'success') {
      return;
    }
    setDiffCache((prev) => {
      const existing = prev[diffRevisionKey];
      if (
        existing &&
        existing.resolved &&
        existing.raw === rangeDiffResult.diff
      ) {
        return prev;
      }
      const parsed =
        rangeDiffResult.diff.trim().length > 0
          ? parseUnifiedDiff(rangeDiffResult.diff)
          : null;
      return {
        ...prev,
        [diffRevisionKey]: {
          raw: rangeDiffResult.diff,
          parsed,
          resolved: true,
        },
      };
    });
  }, [diffRevisionKey, rangeDiffResult]);

  useEffect(() => {
    if (!rangeKey || snapshotDisabled) {
      return;
    }
    if (!rangeDiffResult || rangeDiffResult.kind !== 'success') {
      return;
    }
    if (
      lastSnapshotRefreshKeyRef.current === rangeKey &&
      lastSnapshotRefreshRawRef.current === rangeDiffResult.diff
    ) {
      return;
    }
    lastSnapshotRefreshKeyRef.current = rangeKey;
    lastSnapshotRefreshRawRef.current = rangeDiffResult.diff;
    void refreshSnapshots();
  }, [rangeDiffResult, rangeKey, refreshSnapshots, snapshotDisabled]);

  const parsedDiff = useMemo<ParsedTurnDiff | null>(() => {
    if (diffRevisionKey) {
      const cache = diffCache[diffRevisionKey];
      if (cache && cache.resolved) {
        return cache.parsed;
      }
    }
    return fallbackParsedDiff;
  }, [diffCache, diffRevisionKey, fallbackParsedDiff]);

  const lineLookup = useMemo(() => buildLineLookup(parsedDiff), [parsedDiff]);

  const comments = useMemo<readonly TurnReviewComment[]>(() => {
    if (!rangeKey) {
      return [];
    }
    return commentState[rangeKey] ?? [];
  }, [commentState, rangeKey]);

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

  useEffect(() => {
    setSelectedFileId(null);
  }, [diffRevisionKey]);

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
  const context = useContext(TurnReviewContext);
  if (!context) {
    throw new Error('useTurnReview must be used within a TurnReviewProvider');
  }
  return context;
};
