import {
  type ReactNode,
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
} from 'react';

import { useMessageComments } from './MessageCommentContext';
import type { DraftTarget } from './types';

type MessageCommentDraftContextValue = {
  draftTarget: DraftTarget | null;
  draftCommentText: string;
  setDraftCommentText: (value: string) => void;
  startDraft: (target: DraftTarget) => void;
  cancelDraft: () => void;
  submitDraft: () => boolean;
};

const defaultValue: MessageCommentDraftContextValue = {
  draftTarget: null,
  draftCommentText: '',
  setDraftCommentText: () => undefined,
  startDraft: () => undefined,
  cancelDraft: () => undefined,
  submitDraft: () => false,
};

const MessageCommentDraftContext =
  createContext<MessageCommentDraftContextValue>(defaultValue);

type ProviderProps = {
  children: ReactNode;
};

export function MessageCommentDraftProvider({ children }: ProviderProps) {
  const { addComment } = useMessageComments();
  const [draftTarget, setDraftTarget] = useState<DraftTarget | null>(null);
  const [draftCommentText, setDraftCommentText] = useState('');

  const startDraft = useCallback((target: DraftTarget) => {
    setDraftTarget(target);
    setDraftCommentText('');
  }, []);

  const cancelDraft = useCallback(() => {
    setDraftTarget(null);
    setDraftCommentText('');
  }, []);

  const submitDraft = useCallback(() => {
    const trimmed = draftCommentText.trim();
    if (!trimmed || !draftTarget) {
      return false;
    }

    addComment({
      conversationId: draftTarget.conversationId,
      cellId: draftTarget.cellId,
      selectionText: draftTarget.selectionText,
      selectionPreview: draftTarget.selectionPreview,
      selectionStartOffset: draftTarget.selectionStartOffset,
      selectionEndOffset: draftTarget.selectionEndOffset,
      selectionBlockIndex: draftTarget.selectionBlockIndex,
      commentText: trimmed,
    });

    setDraftTarget(null);
    setDraftCommentText('');
    return true;
  }, [addComment, draftCommentText, draftTarget]);

  const value = useMemo<MessageCommentDraftContextValue>(
    () => ({
      draftTarget,
      draftCommentText,
      setDraftCommentText,
      startDraft,
      cancelDraft,
      submitDraft,
    }),
    [draftTarget, draftCommentText, startDraft, cancelDraft, submitDraft]
  );

  return (
    <MessageCommentDraftContext.Provider value={value}>
      {children}
    </MessageCommentDraftContext.Provider>
  );
}

export const useMessageCommentDraft = () => {
  return useContext(MessageCommentDraftContext);
};
