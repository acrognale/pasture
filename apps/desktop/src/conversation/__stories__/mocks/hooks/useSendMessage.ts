import {
  mockCodexControls,
  useMockCodexStore,
} from '~/conversation/__stories__/mocks/state';

type SendMessagePayload = {
  text: string;
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
    mockCodexControls.appendUserMessage(conversationId, payload.text);
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
