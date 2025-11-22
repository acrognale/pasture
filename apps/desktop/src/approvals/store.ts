import { createStore } from 'zustand/vanilla';
import type { StoreApi } from 'zustand/vanilla';

import type { ApprovalRequest } from './types';

type ApprovalsState = {
  activeRequest: ApprovalRequest | null;
  queue: ApprovalRequest[];
  seenEventIds: Set<string>;
  lastNotifiedEventId: string | null;
};

type ApprovalsActions = {
  enqueue: (request: ApprovalRequest) => void;
  advance: () => void;
  reset: () => void;
  markNotified: (eventId: string) => void;
};

export type ApprovalsStore = StoreApi<ApprovalsState & ApprovalsActions>;

const createInitialState = (): ApprovalsState => ({
  activeRequest: null,
  queue: [],
  seenEventIds: new Set(),
  lastNotifiedEventId: null,
});

export const createApprovalsStore = (): ApprovalsStore =>
  createStore<ApprovalsState & ApprovalsActions>((set, _get) => ({
    ...createInitialState(),
    enqueue: (request) =>
      set((state) => {
        if (state.seenEventIds.has(request.eventId)) {
          return state;
        }

        const nextSeen = new Set(state.seenEventIds);
        nextSeen.add(request.eventId);

        if (!state.activeRequest) {
          return {
            ...state,
            activeRequest: request,
            seenEventIds: nextSeen,
          };
        }

        return {
          ...state,
          queue: [...state.queue, request],
          seenEventIds: nextSeen,
        };
      }),
    advance: () =>
      set((state) => {
        const [next, ...rest] = state.queue;
        return {
          ...state,
          activeRequest: next ?? null,
          queue: rest,
        };
      }),
    reset: () => set(() => createInitialState()),
    markNotified: (eventId) =>
      set((state) => ({
        ...state,
        lastNotifiedEventId: eventId,
      })),
  }));
