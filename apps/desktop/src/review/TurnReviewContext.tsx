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
import type { TranscriptTurnDiff } from '~/conversation/transcript/types';

import type { TurnReviewComment } from './types';

type TurnReviewContextValue = {
  // Pass-through data
  conversationId: string | null;
  history: readonly TranscriptTurnDiff[];
  latestDiff: TranscriptTurnDiff | null;

  // Selection state
  baseTurnId: string | null;
  setBaseTurnId: (id: string | null) => void;
  targetTurnId: string | null;
  selectDiffByEventId: (eventId: string) => void;

  // Computed
  rangeKey: string | null;
  selectedDiff: TranscriptTurnDiff | null;

  // Comments
  comments: readonly TurnReviewComment[];
  addComment: (
    comment: Omit<TurnReviewComment, 'id' | 'createdAt'>
  ) => TurnReviewComment;
  updateComment: (id: string, text: string) => void;
  removeComment: (id: string) => void;
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
  conversationId: null,
  history: [],
  latestDiff: null,
  baseTurnId: null,
  setBaseTurnId: () => undefined,
  targetTurnId: null,
  selectDiffByEventId: () => undefined,
  rangeKey: null,
  selectedDiff: null,
  comments: [],
  addComment: () => {
    throw new Error('TurnReviewProvider not mounted');
  },
  updateComment: () => undefined,
  removeComment: () => undefined,
};

const TurnReviewContext = createContext<TurnReviewContextValue>(
  defaultTurnReviewContext
);

export function TurnReviewProvider({
  conversationId,
  latestDiff,
  history,
  children,
}: TurnReviewProviderProps) {
  const [baseTurnId, setBaseTurnIdState] = useState<string | null>(null);
  const [targetTurnId, setTargetTurnId] = useState<string | null>(null);
  const [commentState, setCommentState] = useState<
    Record<string, TurnReviewComment[]>
  >({});

  const autoFollowingTurnNumber = useRef<number | null>(null);

  // Reset local state when conversation changes
  useEffect(() => {
    setCommentState({});
    setBaseTurnIdState(null);
    setTargetTurnId(null);
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

  const rangeKey = useMemo(() => {
    if (!targetTurnId) {
      return null;
    }
    return `${baseTurnId ?? '__BASELINE__'}::${targetTurnId}`;
  }, [baseTurnId, targetTurnId]);

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

  const addComment = useCallback(
    (input: Omit<TurnReviewComment, 'id' | 'createdAt'>): TurnReviewComment => {
      const comment: TurnReviewComment = {
        ...input,
        id: makeCommentId(),
        createdAt: new Date().toISOString(),
      };
      if (rangeKey) {
        setCommentState((prev) => {
          const current = prev[rangeKey] ?? [];
          return {
            ...prev,
            [rangeKey]: [...current, comment],
          };
        });
      }
      return comment;
    },
    [rangeKey]
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

  const selectDiffByEventId = useCallback((eventId: string) => {
    setTargetTurnId(eventId);
  }, []);

  const setBaseTurnId = useCallback((eventId: string | null) => {
    setBaseTurnIdState(eventId);
  }, []);

  const contextValue = useMemo<TurnReviewContextValue>(
    () => ({
      conversationId,
      history,
      latestDiff,
      baseTurnId,
      setBaseTurnId,
      targetTurnId,
      selectDiffByEventId,
      rangeKey,
      selectedDiff,
      comments,
      addComment,
      updateComment,
      removeComment,
    }),
    [
      conversationId,
      history,
      latestDiff,
      baseTurnId,
      setBaseTurnId,
      targetTurnId,
      selectDiffByEventId,
      rangeKey,
      selectedDiff,
      comments,
      addComment,
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
