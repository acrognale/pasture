import type { TranscriptPlanCell } from '@pasture/transcript-ui';
import { shallow } from 'zustand/shallow';
import { useStoreWithEqualityFn } from 'zustand/traditional';
import { useWorkspaceActions } from '~/workspace';

import type { ConversationStoreState } from './store';

const useConversationSelector = <T>(
  conversationId: string | null,
  selector: (state: ConversationStoreState) => T,
  equalityFn?: (a: T, b: T) => boolean
) => {
  const { getConversationStore } = useWorkspaceActions();
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

export const useConversationProviderLock = (conversationId: string | null) =>
  useConversationSelector(
    conversationId,
    (state) => ({
      lockedModelProviderId: state.conversation.lockedModelProviderId,
      currentModelProviderId: state.conversation.currentModelProviderId,
      currentModel: state.conversation.currentModel,
    }),
    shallow
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

export const useConversationTurnDiffByNumber = (
  conversationId: string | null,
  turnNumber: number
) =>
  useConversationSelector(conversationId, (state) =>
    state.conversation.transcript.turnDiffHistory.find(
      (d) => d.turnNumber === turnNumber
    )
  );

export const useConversationQueuedMessages = (conversationId: string | null) =>
  useConversationSelector(
    conversationId,
    (state) => state.queuedUserMessages,
    shallow
  );

export const useConversationQueueActions = (conversationId: string | null) =>
  useConversationSelector(conversationId, (state) => ({
    queueUserMessage: state.queueUserMessage,
    popQueuedUserMessage: state.popQueuedUserMessage,
    clearQueuedUserMessages: state.clearQueuedUserMessages,
  }));

export const useConversationIsSendingUserMessage = (
  conversationId: string | null
) =>
  useConversationSelector(
    conversationId,
    (state) => state.isSendingUserMessage
  );

export const useConversationSendMessageActions = (
  conversationId: string | null
) =>
  useConversationSelector(conversationId, (state) => ({
    setSendingUserMessage: state.setSendingUserMessage,
  }));

export const useLatestPlan = (conversationId: string | null) =>
  useConversationSelector(
    conversationId,
    (state): { plan: TranscriptPlanCell; turnId: string } | null => {
      const { turnOrder, turns } = state.conversation.transcript;
      // Search from most recent turn backwards
      for (let i = turnOrder.length - 1; i >= 0; i--) {
        const turnId = turnOrder[i];
        const turn = turns[turnId];
        if (!turn) continue;
        const planCells = turn.cells.filter((c) => c.kind === 'plan');
        if (planCells.length > 0) {
          return {
            plan: planCells[planCells.length - 1],
            turnId,
          };
        }
      }
      return null;
    },
    shallow
  );
