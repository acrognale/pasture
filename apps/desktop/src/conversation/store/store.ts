import type { ConversationEventPayload } from '@pasture/protocol';
import type { ReasoningSummary } from '@pasture/protocol';
import { Draft, produce } from 'immer';
import { createStore } from 'zustand/vanilla';
import type { StoreApi } from 'zustand/vanilla';

import type { QueuedUserMessage } from '../types';
import {
  type ConversationControllerOptions,
  type ConversationControllerState,
  type ConversationEventContext,
  type ConversationSideEffect,
  setReasoningSummaryPreference as applyReasoningSummaryPreference,
  createConversationControllerState,
  drainConversationSideEffects,
  getConversationEventsAsJsonl,
  ingestConversationEvent,
} from './reducer';

type ConversationStoreActions = {
  ingestEvent: (payload: ConversationEventPayload) => void;
  setLoading: (isLoading: boolean) => void;
  setError: (error: Error | null) => void;
  setReasoningSummaryPreference: (preference: ReasoningSummary | null) => void;
  reset: () => void;
  drainSideEffects: () => ConversationSideEffect[];
  getEventsAsJsonl: () => string;
  getEventCount: () => number;
  queueUserMessage: (message: QueuedUserMessage) => void;
  popQueuedUserMessage: () => QueuedUserMessage | null;
  clearQueuedUserMessages: () => void;
  setSendingUserMessage: (isSending: boolean) => void;
  attachHandoffDestination: (params: {
    threadId: string;
    conversationId: string;
    goal: string | null;
    title: string | null;
  }) => void;
};

export type ConversationStoreState = ConversationControllerState &
  ConversationStoreActions;

export type ConversationStore = StoreApi<ConversationStoreState>;

export const createConversationStore = (
  options?: ConversationControllerOptions
): ConversationStore =>
  createStore<ConversationStoreState>((set, get) => {
    const context: ConversationEventContext = { execDecoders: {} };

    const updateData = (
      updater: (draft: Draft<ConversationControllerState>) => void
    ) => {
      set((state) =>
        produce(state, (draft) => {
          updater(draft as Draft<ConversationControllerState>);
        })
      );
    };

    const resetExecDecoders = () => {
      Object.keys(context.execDecoders).forEach((key) => {
        delete context.execDecoders[key];
      });
    };

    return {
      ...createConversationControllerState(options),
      ingestEvent: (payload) =>
        set((state) => ingestConversationEvent(state, payload, context)),
      setLoading: (isLoading: boolean) =>
        updateData((draft) => {
          draft.conversation.isLoading = isLoading;
        }),
      setError: (error: Error | null) =>
        updateData((draft) => {
          draft.conversation.error = error;
        }),
      setReasoningSummaryPreference: (preference) =>
        updateData((draft) => {
          applyReasoningSummaryPreference(draft, preference);
        }),
      reset: () => {
        resetExecDecoders();
        set((_state) => createConversationControllerState(options));
      },
      drainSideEffects: () => {
        const { nextState, sideEffects } = drainConversationSideEffects(get());
        set((_state) => nextState);
        return sideEffects;
      },
      getEventsAsJsonl: () => getConversationEventsAsJsonl(get()),
      getEventCount: () => get().ingestedEvents.length,
      queueUserMessage: (message: QueuedUserMessage) =>
        updateData((draft) => {
          const trimmed = message.text.trim();
          const hasAttachments = (message.attachments?.length ?? 0) > 0;
          if (trimmed || hasAttachments) {
            const attachments = message.attachments?.map((attachment) => ({
              ...attachment,
            }));
            draft.queuedUserMessages.push({
              text: trimmed,
              attachments,
            });
          }
        }),
      popQueuedUserMessage: () => {
        let nextMessage: QueuedUserMessage | null = null;
        updateData((draft) => {
          const removed = draft.queuedUserMessages.shift();
          if (removed) {
            nextMessage = {
              text: removed.text,
              attachments: removed.attachments?.map((attachment) => ({
                ...attachment,
              })),
            };
          } else {
            nextMessage = null;
          }
        });
        return nextMessage;
      },
      clearQueuedUserMessages: () =>
        updateData((draft) => {
          draft.queuedUserMessages = [];
        }),
      setSendingUserMessage: (isSending: boolean) =>
        updateData((draft) => {
          draft.isSendingUserMessage = isSending;
        }),
      attachHandoffDestination: ({ threadId, conversationId, goal, title }) =>
        updateData((draft) => {
          const transcript = draft.conversation.transcript;
          const turnOrder = transcript.turnOrder;
          for (let i = turnOrder.length - 1; i >= 0; i -= 1) {
            const turnId = turnOrder[i];
            const turn = transcript.turns[turnId];
            if (!turn) continue;
            for (let j = turn.cells.length - 1; j >= 0; j -= 1) {
              const cell = turn.cells[j];
              if (cell.kind !== 'handoff') {
                continue;
              }
              if (
                cell.targetThreadId &&
                cell.targetConversationId
              ) {
                continue;
              }
              cell.targetThreadId = threadId;
              cell.targetConversationId = conversationId;
              if (!cell.goal && goal) {
                cell.goal = goal;
              }
              if (!cell.title && title) {
                cell.title = title;
              }
              return;
            }
          }
        }),
    };
  });
