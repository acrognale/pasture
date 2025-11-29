import {
  mockCodexControls,
  useMockCodexStore,
} from '~/conversation/__stories__/mocks/state';
import type { MessageAttachment } from '~/conversation/types';

type SendMessagePayload = {
  text: string;
  attachments?: MessageAttachment[];
  turnConfig?: Record<string, unknown>;
};

export const useSendMessage = (
  _workspacePath?: string,
  conversationId?: string | null
) => {
  const isPending = useMockCodexStore((state) => state.mutationPending);

  const sendMessage = (payload: SendMessagePayload): Promise<void> => {
    if (!conversationId) {
      return Promise.resolve();
    }
    mockCodexControls.appendUserMessage(
      conversationId,
      payload.text,
      payload.attachments
    );
    return Promise.resolve();
  };

  return {
    sendMessage,
    sendMessageAsync: sendMessage,
    mutation: {
      isPending,
      mutate: (payload: SendMessagePayload) => {
        void sendMessage(payload);
      },
      mutateAsync: sendMessage,
    },
  };
};
