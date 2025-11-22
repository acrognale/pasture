import { shallow } from 'zustand/shallow';
import { useStoreWithEqualityFn } from 'zustand/traditional';
import { useWorkspaceConversationStores } from '~/workspace';

import type { ConversationStoreState } from './store';

const useConversationSelector = <T>(
  conversationId: string | null,
  selector: (state: ConversationStoreState) => T,
  equalityFn?: (a: T, b: T) => boolean
) => {
  const { getConversationStore } = useWorkspaceConversationStores();
  const store = getConversationStore(conversationId);
  return useStoreWithEqualityFn(store, selector, equalityFn);
};

export const useConversationState = (conversationId: string | null) =>
  useConversationSelector(
    conversationId,
    (state: ConversationStoreState) => state.conversation
  );

export const useConversationActiveTurn = (conversationId: string | null) =>
  useConversationSelector(
    conversationId,
    (state) => {
      const transcript = state.conversation.transcript;
      const activeId = transcript.activeTurnId;
      const activeTurn = activeId ? transcript.turns[activeId] : null;

      return {
        activeTurnStartedAt: activeTurn?.startedAt ?? null,
        statusHeader: state.conversation.statusHeader,
      };
    },
    shallow
  );

export const useConversationIsRunning = (conversationId: string | null) =>
  useConversationSelector(conversationId, (state) => {
    const transcript = state.conversation.transcript;
    const activeId = transcript.activeTurnId;
    const activeTurn = activeId ? transcript.turns[activeId] : null;
    return activeTurn?.status === 'active' && !!activeTurn.startedAt;
  });

export const useConversationTranscript = (conversationId: string | null) =>
  useConversationSelector(
    conversationId,
    (state) => state.conversation.transcript
  );

export const useConversationComposerLimits = (conversationId: string | null) =>
  useConversationSelector(
    conversationId,
    (state) => ({
      contextTokensInWindow: state.conversation.contextTokensInWindow,
      maxContextWindow: state.conversation.maxContextWindow,
    }),
    shallow
  );

export const useConversationLoadState = (conversationId: string | null) =>
  useConversationSelector(
    conversationId,
    (state) => ({
      isLoading: state.conversation.isLoading,
      error: state.conversation.error,
    }),
    shallow
  );

export const useConversationTranscriptTurns = (conversationId: string | null) =>
  useConversationSelector(
    conversationId,
    (state) => ({
      turns: state.conversation.transcript.turns,
      turnOrder: state.conversation.transcript.turnOrder,
    }),
    shallow
  );

export const useConversationTurnDiffHistory = (conversationId: string | null) =>
  useConversationSelector(
    conversationId,
    (state) => state.conversation.transcript.turnDiffHistory
  );

export const useConversationLatestTurnDiff = (conversationId: string | null) =>
  useConversationSelector(
    conversationId,
    (state) => state.conversation.transcript.latestTurnDiff
  );

export const useConversationHasTurnDiffHistory = (
  conversationId: string | null
) =>
  useConversationSelector(
    conversationId,
    (state) => state.conversation.transcript.turnDiffHistory.length > 0
  );
