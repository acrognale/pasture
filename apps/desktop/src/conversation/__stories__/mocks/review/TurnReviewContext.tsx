import type { ReactNode } from 'react';
import { createContext, useContext, useMemo } from 'react';
import type { TranscriptTurnDiff } from '~/conversation/transcript/types';

type TurnReviewContextValue = {
  diff: null;
  diffEventId: string | null;
  selectedDiff: TranscriptTurnDiff | null;
  history: readonly TranscriptTurnDiff[];
  selectDiffByEventId: (eventId: string | null) => void;
  baseTurnId: string | null;
  setBaseTurnId: (eventId: string | null) => void;
  targetTurnId: string | null;
  snapshotDisabled: boolean;
  baselineSnapshotId: string | null;
  turnSnapshots: ReadonlyMap<string, string>;
  selectedFileId: string | null;
  setSelectedFileId: (id: string | null) => void;
  comments: never[];
  addComment: () => null;
  updateComment: () => void;
  removeComment: () => void;
  getLineReference: () => undefined;
  conversationId: string | null;
  buildFeedbackPrompt: () => string | null;
};

const defaultValue: TurnReviewContextValue = {
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

const TurnReviewContext = createContext<TurnReviewContextValue>(defaultValue);

type TurnReviewProviderProps = {
  conversationId: string | null;
  latestDiff: TranscriptTurnDiff | null;
  history: readonly TranscriptTurnDiff[];
  children: ReactNode;
};

export const TurnReviewProvider = ({
  conversationId,
  history,
  children,
}: TurnReviewProviderProps) => {
  const value = useMemo<TurnReviewContextValue>(
    () => ({
      ...defaultValue,
      conversationId,
      history,
    }),
    [conversationId, history]
  );
  return (
    <TurnReviewContext.Provider value={value}>
      {children}
    </TurnReviewContext.Provider>
  );
};

export const useTurnReview = () => useContext(TurnReviewContext);
