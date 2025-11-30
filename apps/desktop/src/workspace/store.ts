import type { QueryClient } from '@tanstack/react-query';
import { createStore } from 'zustand/vanilla';
import type { StoreApi } from 'zustand/vanilla';
import type { ConversationEventPayload } from '~/codex.gen/ConversationEventPayload';
import { Codex } from '~/codex/client';
import {
  type ConversationStore,
  createConversationStore,
} from '~/conversation/store/store';
import { createWorkspaceKeys } from '~/lib/workspaceKeys';

import { updateThreadOnFork, updateThreadOnSwitch } from './thread-cache';

type LoadingState = 'idle' | 'loading' | 'loaded' | 'error';

export type WorkspaceStoreActions = {
  getConversationStore: (conversationId: string | null) => ConversationStore;
  clearConversationStore: (conversationId: string) => void;
  applyConversationEvent: (
    payload: ConversationEventPayload
  ) => ConversationStore | null;
  getThreadConversationId: (threadId: string) => string | null;
  getThreadIdForConversation: (conversationId: string) => string | null;
  loadThread: (
    threadId: string,
    options?: { force?: boolean }
  ) => Promise<string | null>;
  forkConversation: (
    threadId: string,
    baseConversationId: string,
    nthUserMessage: number
  ) => Promise<string | null>;
  switchConversation: (
    threadId: string,
    conversationId: string
  ) => Promise<string | null>;
  markThreadOpen: (threadId: string) => void;
  closeThread: (threadId: string) => void;
};

export type WorkspaceStoreState = {
  openThreadIds: string[];
  threadConversationIds: Record<string, string>;
  recentThreadIds: string[];
  actions: WorkspaceStoreActions;
};

export type WorkspaceStoreDeps = {
  workspacePath: string;
  normalizedWorkspacePath: string | null;
  keys: ReturnType<typeof createWorkspaceKeys>;
  queryClient: QueryClient;
};

export type WorkspaceStore = StoreApi<WorkspaceStoreState>;

export const createWorkspaceStore = (
  deps: WorkspaceStoreDeps
): WorkspaceStore => {
  const conversationStores = new Map<string, ConversationStore>();
  const fallbackConversationStore = createConversationStore();
  const conversationLoading = new Map<string, LoadingState>();
  const threadLoading = new Map<string, LoadingState>();
  const threadConversationMap = new Map<string, string>();
  const conversationToThreadMap = new Map<string, string>();
  const openThreadIdsSet = new Set<string>();
  const recentThreadIds: string[] = [];

  return createStore<WorkspaceStoreState>((set) => {
    const syncOpenThreadIds = () =>
      set({ openThreadIds: Array.from(openThreadIdsSet) });

    const syncThreadConversationIds = () => {
      const entries = Array.from(threadConversationMap.entries());
      const next: Record<string, string> = {};
      for (const [threadId, conversationId] of entries) {
        next[threadId] = conversationId;
      }
      set({ threadConversationIds: next });
    };

    const syncRecentThreadIds = () => {
      set({ recentThreadIds: [...recentThreadIds] });
    };

    const touchRecentThread = (threadId: string) => {
      if (!threadId) {
        return;
      }
      const existingIndex = recentThreadIds.indexOf(threadId);
      if (existingIndex !== -1) {
        recentThreadIds.splice(existingIndex, 1);
      }
      recentThreadIds.unshift(threadId);
      if (recentThreadIds.length > 30) {
        recentThreadIds.pop();
      }
      syncRecentThreadIds();
    };

    const removeRecentThread = (threadId: string) => {
      const existingIndex = recentThreadIds.indexOf(threadId);
      if (existingIndex === -1) {
        return;
      }
      recentThreadIds.splice(existingIndex, 1);
      syncRecentThreadIds();
    };

    const ensureConversationStore = (conversationId: string) => {
      if (!conversationId) {
        throw new Error('conversationId is required');
      }
      let store = conversationStores.get(conversationId);
      if (!store) {
        store = createConversationStore({ conversationId });
        conversationStores.set(conversationId, store);
      }
      return store;
    };

    const clearConversationStore = (conversationId: string) => {
      conversationStores.delete(conversationId);
      conversationLoading.delete(conversationId);
      conversationToThreadMap.delete(conversationId);
    };

    const markThreadOpen = (threadId: string) => {
      if (!threadId || openThreadIdsSet.has(threadId)) {
        return;
      }
      openThreadIdsSet.add(threadId);
      syncOpenThreadIds();
    };

    const closeThread = (threadId: string) => {
      if (!threadId) {
        return;
      }
      const conversationId = threadConversationMap.get(threadId);
      threadConversationMap.delete(threadId);
      if (conversationId) {
        conversationToThreadMap.delete(conversationId);
      }
      if (openThreadIdsSet.has(threadId)) {
        openThreadIdsSet.delete(threadId);
        syncOpenThreadIds();
      }
      removeRecentThread(threadId);
      if (conversationId) {
        clearConversationStore(conversationId);
      }
      syncThreadConversationIds();
    };

    const applyConversationEvent = (payload: ConversationEventPayload) => {
      if (!payload.conversationId) {
        return null;
      }
      const store = ensureConversationStore(payload.conversationId);
      store.getState().ingestEvent(payload);
      return store;
    };

    const hydrateConversationStore = (
      conversationId: string,
      sessionConfigured: NonNullable<
        Awaited<ReturnType<typeof Codex.initializeThread>>
      >['sessionConfigured'],
      reasoningSummary: Awaited<
        ReturnType<typeof Codex.initializeThread>
      >['reasoningSummary']
    ) => {
      const store = ensureConversationStore(conversationId);
      store.getState().reset();
      store.getState().setLoading(true);
      store.getState().setError(null);

      const events = sessionConfigured.initial_messages
        ? [...sessionConfigured.initial_messages]
        : [];
      events.forEach((event, index) => {
        const turnId =
          'turn_id' in event && typeof event.turn_id === 'string'
            ? event.turn_id
            : `initial::${conversationId}::${index}`;
        const eventId =
          (event as { event_id?: string }).event_id ??
          `${turnId}::${index.toString()}`;
        store.getState().ingestEvent({
          conversationId,
          turnId,
          eventId,
          event,
          timestamp: new Date().toISOString(),
        });
      });
      store.getState().setReasoningSummaryPreference(reasoningSummary);
      store.getState().setLoading(false);
      return store;
    };

    const loadThread = async (
      threadId: string,
      options?: { force?: boolean }
    ) => {
      if (!threadId) {
        return null;
      }

      markThreadOpen(threadId);

      const status = threadLoading.get(threadId);
      const mappedConversation = threadConversationMap.get(threadId);
      if (!options?.force && status === 'loading') {
        return mappedConversation ?? null;
      }
      if (!options?.force && status === 'loaded' && mappedConversation) {
        return mappedConversation;
      }

      threadLoading.set(threadId, 'loading');

      try {
        const { sessionConfigured, reasoningSummary } =
          await Codex.initializeThread({
            threadId,
            workspacePath: deps.workspacePath,
          });

        const conversationId = sessionConfigured.session_id;
        threadConversationMap.set(threadId, conversationId);
        conversationToThreadMap.set(conversationId, threadId);
        conversationLoading.set(conversationId, 'loaded');

        const store = hydrateConversationStore(
          conversationId,
          sessionConfigured,
          reasoningSummary
        );
        store.getState().setLoading(false);
        threadLoading.set(threadId, 'loaded');
        touchRecentThread(threadId);
        syncThreadConversationIds();
        return conversationId;
      } catch (error) {
        threadLoading.set(threadId, 'error');
        throw error;
      }
    };

    const forkThread = async (
      threadId: string,
      baseConversationId: string,
      nthUserMessage: number
    ) => {
      if (!threadId || !baseConversationId) {
        return null;
      }

      markThreadOpen(threadId);

      try {
        threadLoading.set(threadId, 'loading');
        const {
          conversationId,
          sessionConfigured,
          reasoningSummary,
          rolloutPath,
          baseConversationId: parentConversationId,
          nthUserMessage: forkedAtNthUserMessage,
          createdAt,
        } = await Codex.forkConversation({
          workspacePath: deps.workspacePath,
          threadId,
          baseConversationId,
          nthUserMessage,
          options: null,
        });

        threadConversationMap.set(threadId, conversationId);
        conversationToThreadMap.set(conversationId, threadId);
        conversationLoading.set(conversationId, 'loaded');
        const store = hydrateConversationStore(
          conversationId,
          sessionConfigured,
          reasoningSummary
        );
        store.getState().setLoading(false);
        threadLoading.set(threadId, 'loaded');
        touchRecentThread(threadId);
        updateThreadOnFork(deps.queryClient, deps.keys, {
          threadId,
          conversationId,
          rolloutPath,
          createdAt,
          parentConversationId,
          forkedAtNthUserMessage,
        });
        syncThreadConversationIds();
        return conversationId;
      } catch (error) {
        threadLoading.set(threadId, 'error');
        throw error;
      }
    };

    const switchThreadConversation = async (
      threadId: string,
      conversationId: string
    ) => {
      if (!threadId || !conversationId) {
        return null;
      }

      markThreadOpen(threadId);

      try {
        threadLoading.set(threadId, 'loading');
        const {
          conversationId: resolvedConversationId,
          sessionConfigured,
          reasoningSummary,
        } = await Codex.switchConversation({
          workspacePath: deps.workspacePath,
          threadId,
          conversationId,
        });

        const conversationIdStr = resolvedConversationId;
        threadConversationMap.set(threadId, conversationIdStr);
        conversationToThreadMap.set(conversationIdStr, threadId);
        const hasLoadedStore =
          !!conversationStores.get(conversationIdStr) &&
          conversationLoading.get(conversationIdStr) === 'loaded';

        let sessionToHydrate = sessionConfigured;
        let reasoningToHydrate = reasoningSummary;

        if (!hasLoadedStore && !sessionToHydrate) {
          const init = await Codex.initializeThread({
            threadId,
            workspacePath: deps.workspacePath,
          });
          sessionToHydrate = init.sessionConfigured;
          reasoningToHydrate = init.reasoningSummary;
        }

        if (!hasLoadedStore && sessionToHydrate && reasoningToHydrate) {
          conversationLoading.set(conversationIdStr, 'loading');
          const store = hydrateConversationStore(
            conversationIdStr,
            sessionToHydrate,
            reasoningToHydrate
          );
          store.getState().setLoading(false);
          conversationLoading.set(conversationIdStr, 'loaded');
        } else {
          conversationLoading.set(conversationIdStr, 'loaded');
        }

        threadLoading.set(threadId, 'loaded');
        touchRecentThread(threadId);
        syncThreadConversationIds();
        updateThreadOnSwitch(deps.queryClient, deps.keys, {
          threadId,
          conversationId: conversationIdStr,
        });

        return conversationIdStr;
      } catch (error) {
        threadLoading.set(threadId, 'error');
        throw error;
      }
    };

    const actions: WorkspaceStoreActions = {
      getConversationStore: (conversationId: string | null) => {
        if (!conversationId) {
          return fallbackConversationStore;
        }
        return ensureConversationStore(conversationId);
      },
      clearConversationStore,
      applyConversationEvent,
      getThreadConversationId: (threadId: string) =>
        threadConversationMap.get(threadId) ?? null,
      getThreadIdForConversation: (conversationId: string) =>
        conversationToThreadMap.get(conversationId) ?? null,
      loadThread,
      forkConversation: forkThread,
      switchConversation: switchThreadConversation,
      markThreadOpen,
      closeThread,
    };

    return {
      openThreadIds: Array.from(openThreadIdsSet),
      threadConversationIds: {},
      recentThreadIds: [],
      actions,
    };
  });
};
