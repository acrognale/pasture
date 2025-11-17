import { Draft, produce } from 'immer';
import { createStore } from 'zustand/vanilla';
import type { StoreApi } from 'zustand/vanilla';
import type { ConversationEventPayload } from '~/codex.gen/ConversationEventPayload';
import type { ReasoningSummary } from '~/codex.gen/ReasoningSummary';

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
    };
  });
