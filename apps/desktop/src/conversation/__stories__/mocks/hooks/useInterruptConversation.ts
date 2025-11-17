import {
  mockCodexControls,
  useMockCodexStore,
} from '~/conversation/__stories__/mocks/state';

export const useInterruptConversation = (_conversationId: string | null) => {
  const isPending = useMockCodexStore((state) => state.interruptPending);

  const interruptConversation = (): Promise<void> => {
    mockCodexControls.setInterruptPending(true);
    setTimeout(() => {
      mockCodexControls.setInterruptPending(false);
    }, 500);
    return Promise.resolve();
  };

  return {
    interruptConversation,
    isPending,
  };
};
