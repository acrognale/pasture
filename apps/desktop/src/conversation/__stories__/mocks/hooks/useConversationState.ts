import { useMockCodexStore } from '~/conversation/__stories__/mocks/state';
import {
  type ConversationState,
  createInitialConversationState,
} from '~/conversation/store/reducer';
import { useWorkspaceConversationStores } from '~/workspace';

export const useConversationState = (
  conversationId: string | null
): ConversationState =>
  useMockCodexStore((state) => {
    if (!conversationId) {
      return createInitialConversationState();
    }
    const entry = state.entries[conversationId];
    return entry?.state ?? createInitialConversationState();
  });

export const useConversationStores = () => useWorkspaceConversationStores();
