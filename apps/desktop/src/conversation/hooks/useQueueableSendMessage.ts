import { useCallback } from 'react';
import { toast } from 'sonner';

import {
  useConversationIsRunning,
  useConversationIsSendingUserMessage,
  useConversationQueueActions,
  useConversationSendMessageActions,
} from '../store/hooks';
import {
  type SendMessageVariables,
  formatMessageWithMentions,
  useSendMessage,
} from './useSendMessage';

export const useQueueableSendMessage = (
  workspacePath: string,
  conversationId: string | null | undefined
) => {
  const { queueUserMessage, popQueuedUserMessage } =
    useConversationQueueActions(conversationId ?? null);
  const { setSendingUserMessage } = useConversationSendMessageActions(
    conversationId ?? null
  );
  const isRunning = useConversationIsRunning(conversationId ?? null);
  const isSendingUserMessage = useConversationIsSendingUserMessage(
    conversationId ?? null
  );
  const { sendMessage, mutation } = useSendMessage(
    workspacePath,
    conversationId
  );
  const isMutationPending = mutation.isPending || isSendingUserMessage;

  const sendOrQueue = useCallback(
    async ({ text, attachments, turnConfig }: SendMessageVariables) => {
      const trimmed = text.trim();
      const formattedText = formatMessageWithMentions(trimmed, workspacePath);
      const hasAttachments = (attachments?.length ?? 0) > 0;
      if (!formattedText && !hasAttachments) {
        return;
      }

      if (isRunning || isSendingUserMessage) {
        queueUserMessage({ text: formattedText, attachments });
        return;
      }

      setSendingUserMessage(true);
      try {
        await sendMessage({ text: formattedText, attachments, turnConfig });
      } finally {
        setSendingUserMessage(false);
      }
    },
    [
      isRunning,
      isSendingUserMessage,
      queueUserMessage,
      sendMessage,
      setSendingUserMessage,
      workspacePath,
    ]
  );

  const sendNextQueuedIfIdle = useCallback(async () => {
    if (isRunning || isSendingUserMessage) {
      return;
    }

    const nextMessage = popQueuedUserMessage();
    if (!nextMessage) {
      return;
    }

    setSendingUserMessage(true);
    try {
      await sendMessage(nextMessage);
    } catch (error) {
      queueUserMessage(nextMessage);
      const description =
        error instanceof Error ? error.message : 'Please try again.';
      toast.error('Failed to send queued message.', { description });
    } finally {
      setSendingUserMessage(false);
    }
  }, [
    isRunning,
    isSendingUserMessage,
    popQueuedUserMessage,
    queueUserMessage,
    sendMessage,
    setSendingUserMessage,
  ]);

  return {
    sendOrQueue,
    sendNextQueuedIfIdle,
    mutation: { ...mutation, isPending: isMutationPending },
  };
};
