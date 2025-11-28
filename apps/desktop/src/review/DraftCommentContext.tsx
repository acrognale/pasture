import {
  type ReactNode,
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
} from 'react';

import { useTurnReview } from './TurnReviewContext';
import type { ParsedTurnDiffLine } from './types';

type DraftLineContext = {
  fileId: string;
  hunkId: string;
  filePath: string;
  line: ParsedTurnDiffLine;
};

type DraftCommentContextValue = {
  draftTargetId: string | null;
  draftText: string;
  setDraftText: (text: string) => void;
  startDraft: (context: DraftLineContext) => void;
  cancelDraft: () => void;
  submitDraft: () => boolean;
};

const defaultValue: DraftCommentContextValue = {
  draftTargetId: null,
  draftText: '',
  setDraftText: () => undefined,
  startDraft: () => undefined,
  cancelDraft: () => undefined,
  submitDraft: () => false,
};

const DraftCommentContext =
  createContext<DraftCommentContextValue>(defaultValue);

type DraftCommentProviderProps = {
  children: ReactNode;
};

export function DraftCommentProvider({ children }: DraftCommentProviderProps) {
  const { addComment } = useTurnReview();
  const [draftText, setDraftText] = useState('');
  const [draftContext, setDraftContext] = useState<DraftLineContext | null>(
    null
  );

  const draftTargetId = draftContext?.line.id ?? null;

  const startDraft = useCallback((context: DraftLineContext) => {
    setDraftContext(context);
    setDraftText('');
  }, []);

  const cancelDraft = useCallback(() => {
    setDraftContext(null);
    setDraftText('');
  }, []);

  const submitDraft = useCallback(() => {
    const trimmed = draftText.trim();
    if (!trimmed || !draftContext) {
      return false;
    }

    const { fileId, hunkId, filePath, line } = draftContext;

    addComment({
      fileId,
      hunkId,
      lineId: line.id,
      filePath,
      lineKind: line.kind,
      lineText: line.text,
      linePrefix: line.prefix,
      oldLineNumber: line.oldNumber,
      newLineNumber: line.newNumber,
      text: trimmed,
    });

    setDraftContext(null);
    setDraftText('');
    return true;
  }, [addComment, draftContext, draftText]);

  const value = useMemo<DraftCommentContextValue>(
    () => ({
      draftTargetId,
      draftText,
      setDraftText,
      startDraft,
      cancelDraft,
      submitDraft,
    }),
    [draftTargetId, draftText, startDraft, cancelDraft, submitDraft]
  );

  return (
    <DraftCommentContext.Provider value={value}>
      {children}
    </DraftCommentContext.Provider>
  );
}

export const useDraftComment = () => {
  return useContext(DraftCommentContext);
};
