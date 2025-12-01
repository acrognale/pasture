import {
  type ReactNode,
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from 'react';

import type { MessageComment } from './types';

type MessageCommentContextValue = {
  conversationId: string | null;
  comments: readonly MessageComment[];
  commentsByCell: Map<string, MessageComment[]>;
  addComment: (
    input: Omit<MessageComment, 'id' | 'createdAt'>
  ) => MessageComment;
  updateComment: (id: string, commentText: string) => void;
  removeComment: (id: string) => void;
};

type MessageCommentProviderProps = {
  conversationId: string;
  children: ReactNode;
};

const makeCommentId = () => {
  if (
    typeof crypto !== 'undefined' &&
    typeof crypto.randomUUID === 'function'
  ) {
    return crypto.randomUUID();
  }
  return `msg-comment-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
};

const defaultValue: MessageCommentContextValue = {
  conversationId: null,
  comments: [],
  commentsByCell: new Map(),
  addComment: () => {
    throw new Error('MessageCommentProvider not mounted');
  },
  updateComment: () => undefined,
  removeComment: () => undefined,
};

const MessageCommentContext =
  createContext<MessageCommentContextValue>(defaultValue);

export function MessageCommentProvider({
  conversationId,
  children,
}: MessageCommentProviderProps) {
  const [state, setState] = useState<MessageComment[]>([]);

  // Reset comments when conversation changes
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setState([]);
  }, [conversationId]);

  const commentsByCell = useMemo(() => {
    const map = new Map<string, MessageComment[]>();
    for (const comment of state) {
      const existing = map.get(comment.cellId) ?? [];
      map.set(comment.cellId, [...existing, comment]);
    }
    return map;
  }, [state]);

  const addComment = useCallback(
    (input: Omit<MessageComment, 'id' | 'createdAt'>): MessageComment => {
      const comment: MessageComment = {
        ...input,
        id: makeCommentId(),
        createdAt: new Date().toISOString(),
      };
      setState((prev) => [...prev, comment]);
      return comment;
    },
    []
  );

  const updateComment = useCallback((id: string, commentText: string) => {
    const trimmed = commentText.trim();
    setState((prev) =>
      prev.map((comment) =>
        comment.id === id ? { ...comment, commentText: trimmed } : comment
      )
    );
  }, []);

  const removeComment = useCallback((id: string) => {
    setState((prev) => prev.filter((comment) => comment.id !== id));
  }, []);

  const value = useMemo<MessageCommentContextValue>(
    () => ({
      conversationId,
      comments: state,
      commentsByCell,
      addComment,
      updateComment,
      removeComment,
    }),
    [
      conversationId,
      state,
      commentsByCell,
      addComment,
      updateComment,
      removeComment,
    ]
  );

  return (
    <MessageCommentContext.Provider value={value}>
      {children}
    </MessageCommentContext.Provider>
  );
}

export const useMessageComments = () => {
  return useContext(MessageCommentContext);
};
