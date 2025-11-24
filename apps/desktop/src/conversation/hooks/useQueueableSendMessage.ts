import { useCallback } from 'react';
import { toast } from 'sonner';
import { useAuthState } from '~/auth/useAuthState';

import {
  useConversationIsRunning,
  useConversationQueueActions,
} from '../store/hooks';
import { type SendMessageVariables, useSendMessage } from './useSendMessage';

export const useQueueableSendMessage = (
  workspacePath: string,
  conversationId: string | null | undefined
) => {
  const authState = useAuthState();
  const { queueUserMessage, popQueuedUserMessage } =
    useConversationQueueActions(conversationId ?? null);
  const isRunning = useConversationIsRunning(conversationId ?? null);
  const { sendMessage, mutation } = useSendMessage(
    workspacePath,
    conversationId
  );

  const sendOrQueue = useCallback(
    async ({ text, turnConfig }: SendMessageVariables) => {
      const trimmed = text.trim();
      if (!trimmed) {
        return;
      }
      if (authState.isLoading || authState.data?.requiresAuth) {
        return;
      }

      if (isRunning) {
        queueUserMessage(trimmed);
        return;
      }

      await sendMessage({ text: trimmed, turnConfig });
    },
    [
      authState.data?.requiresAuth,
      authState.isLoading,
      isRunning,
      queueUserMessage,
      sendMessage,
    ]
  );

  const sendNextQueuedIfIdle = useCallback(async () => {
    if (isRunning) {
      return;
    }

    const nextMessage = popQueuedUserMessage();
    if (!nextMessage) {
      return;
    }

    try {
      await sendMessage({ text: nextMessage });
    } catch (error) {
      queueUserMessage(nextMessage);
      const description =
        error instanceof Error ? error.message : 'Please try again.';
      toast.error('Failed to send queued message.', { description });
    }
  }, [isRunning, popQueuedUserMessage, queueUserMessage, sendMessage]);

  return {
    sendOrQueue,
    sendNextQueuedIfIdle,
    mutation,
  };
};
