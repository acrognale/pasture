import type { MessageComment } from '@pasture/protocol';
import type {
  CreateMessageCommentParams,
  SetMessageCommentsSubmittedParams,
  UpdateMessageCommentParams,
} from '@pasture/protocol';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useMemo } from 'react';
import { Codex } from '~/codex/client';
import { createWorkspaceKeys } from '~/lib/workspaceKeys';

export type NewMessageCommentInput = Omit<
  CreateMessageCommentParams,
  'conversationId' | 'id'
> & { id?: string };

const buildQueryKey = (
  workspacePath: string,
  conversationId: string | null | undefined
) => {
  const keys = createWorkspaceKeys(workspacePath);
  const resolved = conversationId ?? '__inactive__';
  return keys.messageComments(resolved);
};

export const useMessageCommentsQuery = (
  workspacePath: string,
  conversationId: string | null | undefined
) => {
  const queryKey = useMemo(
    () => buildQueryKey(workspacePath, conversationId),
    [workspacePath, conversationId]
  );

  return useQuery({
    queryKey,
    enabled: Boolean(workspacePath && conversationId),
    queryFn: async () => {
      if (!conversationId) return [] as MessageComment[];
      const { comments } = await Codex.listMessageComments({
        conversationId,
      });
      return comments;
    },
    staleTime: 5 * 60 * 1000,
    placeholderData: [] as MessageComment[],
  });
};

export const useCreateMessageCommentMutation = (
  workspacePath: string,
  conversationId: string | null | undefined
) => {
  const queryClient = useQueryClient();
  const queryKey = useMemo(
    () => buildQueryKey(workspacePath, conversationId),
    [workspacePath, conversationId]
  );

  return useMutation({
    mutationFn: async (input: NewMessageCommentInput) => {
      if (!conversationId) {
        throw new Error('conversationId is required to create a comment');
      }
      const resolvedConversationId = conversationId as string;
      const { comment } = await Codex.createMessageComment({
        ...input,
        conversationId: resolvedConversationId,
        id: input.id ?? null,
      });
      return comment;
    },
    onSuccess: (comment) => {
      queryClient.setQueryData<MessageComment[] | undefined>(
        queryKey,
        (prev) => {
          if (!prev) return [comment];
          const existingIndex = prev.findIndex(
            (item) => item.id === comment.id
          );
          if (existingIndex === -1) {
            return [...prev, comment];
          }
          const next = [...prev];
          next[existingIndex] = comment;
          return next;
        }
      );
    },
  });
};

export const useUpdateMessageCommentMutation = (
  workspacePath: string,
  conversationId: string | null | undefined
) => {
  const queryClient = useQueryClient();
  const queryKey = useMemo(
    () => buildQueryKey(workspacePath, conversationId),
    [workspacePath, conversationId]
  );

  return useMutation({
    mutationFn: (params: UpdateMessageCommentParams) =>
      Codex.updateMessageComment(params),
    onSuccess: (_data, variables) => {
      queryClient.setQueryData<MessageComment[] | undefined>(
        queryKey,
        (prev) => {
          if (!prev) return prev;
          return prev.map((comment) =>
            comment.id === variables.id
              ? {
                  ...comment,
                  commentText:
                    variables.commentText?.trim() ?? comment.commentText,
                  isSubmitted: variables.isSubmitted ?? comment.isSubmitted,
                }
              : comment
          );
        }
      );
    },
  });
};

export const useSetMessageCommentsSubmittedMutation = (
  workspacePath: string,
  conversationId: string | null | undefined
) => {
  const queryClient = useQueryClient();
  const queryKey = useMemo(
    () => buildQueryKey(workspacePath, conversationId),
    [workspacePath, conversationId]
  );

  return useMutation({
    mutationFn: (params: SetMessageCommentsSubmittedParams) =>
      Codex.setMessageCommentsSubmitted(params),
    onSuccess: (_data, variables) => {
      const idSet = new Set(variables.ids);
      queryClient.setQueryData<MessageComment[] | undefined>(
        queryKey,
        (prev) => {
          if (!prev) return prev;
          return prev.map((comment) =>
            idSet.has(comment.id)
              ? { ...comment, isSubmitted: variables.isSubmitted }
              : comment
          );
        }
      );
    },
  });
};

export const useDeleteMessageCommentMutation = (
  workspacePath: string,
  conversationId: string | null | undefined
) => {
  const queryClient = useQueryClient();
  const queryKey = useMemo(
    () => buildQueryKey(workspacePath, conversationId),
    [workspacePath, conversationId]
  );

  return useMutation({
    mutationFn: (id: string) => Codex.deleteMessageComment({ id }),
    onSuccess: (_data, id) => {
      queryClient.setQueryData<MessageComment[] | undefined>(
        queryKey,
        (prev) => {
          if (!prev) return prev;
          return prev.filter((comment) => comment.id !== id);
        }
      );
    },
  });
};
