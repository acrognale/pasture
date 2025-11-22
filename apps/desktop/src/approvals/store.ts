import { createStore } from 'zustand/vanilla';
import type { StoreApi } from 'zustand/vanilla';

import type { ApprovalRequest } from './types';

type ApprovalsState = {
  activeRequest: ApprovalRequest | null;
  queue: ApprovalRequest[];
  seenTurnIds: Set<string>;
  lastNotifiedId: string | null;
};

type ApprovalsActions = {
  enqueue: (request: ApprovalRequest) => void;
  advance: () => void;
  reset: () => void;
  markNotified: (turnId: string) => void;
};

export type ApprovalsStore = StoreApi<ApprovalsState & ApprovalsActions>;

const createInitialState = (): ApprovalsState => ({
  activeRequest: null,
  queue: [],
  seenTurnIds: new Set(),
  lastNotifiedId: null,
});

export const createApprovalsStore = (): ApprovalsStore =>
  createStore<ApprovalsState & ApprovalsActions>((set, _get) => ({
    ...createInitialState(),
    enqueue: (request) =>
      set((state) => {
        if (state.seenTurnIds.has(request.turnId)) {
          return state;
        }

        const nextSeen = new Set(state.seenTurnIds);
        nextSeen.add(request.turnId);

        if (!state.activeRequest) {
          return {
            ...state,
            activeRequest: request,
            seenTurnIds: nextSeen,
          };
        }

        return {
          ...state,
          queue: [...state.queue, request],
          seenTurnIds: nextSeen,
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
    markNotified: (turnId) =>
      set((state) => ({
        ...state,
        lastNotifiedId: turnId,
      })),
  }));
