import type { MessageComment } from '@pasture/protocol';
import {
  type ReactNode,
  createContext,
  useCallback,
  useContext,
  useMemo,
} from 'react';

import {
  useCreateMessageCommentMutation,
  useDeleteMessageCommentMutation,
  useMessageCommentsQuery,
  useSetMessageCommentsSubmittedMutation,
  useUpdateMessageCommentMutation,
} from './hooks';

type MessageCommentContextValue = {
  conversationId: string | null;
  comments: readonly MessageComment[];
  commentsByCell: Map<string, MessageComment[]>;
  addComment: (
    input: Omit<MessageComment, 'id' | 'createdAt'>
  ) => MessageComment;
  markCommentsSubmitted: (ids: string[]) => void;
  updateComment: (id: string, commentText: string) => void;
  removeComment: (id: string) => void;
};

type MessageCommentProviderProps = {
  conversationId: string;
  workspacePath: string;
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
  markCommentsSubmitted: () => undefined,
  updateComment: () => undefined,
  removeComment: () => undefined,
};

const MessageCommentContext =
  createContext<MessageCommentContextValue>(defaultValue);

export function MessageCommentProvider({
  conversationId,
  workspacePath,
  children,
}: MessageCommentProviderProps) {
  const commentsQuery = useMessageCommentsQuery(workspacePath, conversationId);
  const comments = useMemo(
    () => commentsQuery.data ?? [],
    [commentsQuery.data]
  );

  const createMutation = useCreateMessageCommentMutation(
    workspacePath,
    conversationId
  );
  const updateMutation = useUpdateMessageCommentMutation(
    workspacePath,
    conversationId
  );
  const setSubmittedMutation = useSetMessageCommentsSubmittedMutation(
    workspacePath,
    conversationId
  );
  const deleteMutation = useDeleteMessageCommentMutation(
    workspacePath,
    conversationId
  );

  const commentsByCell = useMemo(() => {
    const map = new Map<string, MessageComment[]>();
    for (const comment of comments) {
      const existing = map.get(comment.cellId) ?? [];
      map.set(comment.cellId, [...existing, comment]);
    }
    return map;
  }, [comments]);

  const addComment = useCallback(
    (input: Omit<MessageComment, 'id' | 'createdAt'>): MessageComment => {
      const comment: MessageComment = {
        ...input,
        id: makeCommentId(),
        createdAt: new Date().toISOString(),
        isSubmitted: false,
      };
      createMutation.mutate({
        ...input,
        id: comment.id,
      });
      return comment;
    },
    [createMutation]
  );

  const markCommentsSubmitted = useCallback(
    (ids: string[]) => {
      setSubmittedMutation.mutate({ ids, isSubmitted: true });
    },
    [setSubmittedMutation]
  );

  const updateComment = useCallback(
    (id: string, commentText: string) => {
      const trimmed = commentText.trim();
      updateMutation.mutate({ id, commentText: trimmed, isSubmitted: null });
    },
    [updateMutation]
  );

  const removeComment = useCallback(
    (id: string) => {
      deleteMutation.mutate(id);
    },
    [deleteMutation]
  );

  const value = useMemo<MessageCommentContextValue>(
    () => ({
      conversationId,
      comments,
      commentsByCell,
      addComment,
      markCommentsSubmitted,
      updateComment,
      removeComment,
    }),
    [
      conversationId,
      comments,
      commentsByCell,
      addComment,
      markCommentsSubmitted,
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
