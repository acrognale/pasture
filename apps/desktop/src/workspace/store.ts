import type { ConversationEventPayload } from '@pasture/protocol';
import type { QueryClient } from '@tanstack/react-query';
import { produce } from 'immer';
import { createStore } from 'zustand/vanilla';
import type { StoreApi } from 'zustand/vanilla';
import { Codex } from '~/codex/client';
import {
  type ConversationStore,
  createConversationStore,
} from '~/conversation/store/store';
import { inferModelProviderId } from '~/lib/providerInference';
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
      sessionConfigured: Awaited<
        ReturnType<typeof Codex.initializeThread>
      >['sessionConfigured'],
      reasoningSummary: Awaited<
        ReturnType<typeof Codex.initializeThread>
      >['reasoningSummary']
    ) => {
      const store = ensureConversationStore(conversationId);
      store.getState().reset();
      store.getState().setLoading(true);
      store.getState().setError(null);
      if (sessionConfigured) {
        store.setState((state) =>
          produce(state, (draft) => {
            draft.conversation.currentModel = sessionConfigured.model ?? null;
            draft.conversation.currentModelProviderId =
              sessionConfigured.model_provider_id ??
              inferModelProviderId(sessionConfigured.model ?? undefined) ??
              null;
          })
        );
      }

      const events = sessionConfigured?.initial_messages
        ? [...sessionConfigured.initial_messages]
        : [];

      if (import.meta.env.DEV) {
        const typeCounts = new Map<string, number>();
        for (const event of events) {
          typeCounts.set(event.type, (typeCounts.get(event.type) ?? 0) + 1);
        }
        console.debug('[Workspace] Hydrating initial messages', {
          conversationId,
          rolloutPath: sessionConfigured.rollout_path,
          messageCount: events.length,
          types: Object.fromEntries(typeCounts.entries()),
        });
      }
      type BufferedEvent = { event: (typeof events)[number]; index: number };
      type BufferedTurn = {
        events: BufferedEvent[];
        explicitTurnId: string | null;
        hasUserMessage: boolean;
      };

      const turns: BufferedTurn[] = [];
      let current: BufferedTurn | null = null;

      const pushCurrent = () => {
        if (current && current.events.length > 0) {
          turns.push(current);
        }
        current = null;
      };

      events.forEach((event, index) => {
        const isUserMessage = event.type === 'user_message';

        if (isUserMessage && current?.hasUserMessage) {
          pushCurrent();
          current = null;
        }

        if (!current) {
          current = { events: [], explicitTurnId: null, hasUserMessage: false };
        }

        if (isUserMessage) {
          current.hasUserMessage = true;
        }

        if (
          'turn_id' in event &&
          typeof event.turn_id === 'string' &&
          !current.explicitTurnId
        ) {
          // User messages define turn boundaries in persisted history. If any
          // event within this buffered user turn carries a backend turn_id,
          // adopt the first one so the frontend turn matches Codex history.
          current.explicitTurnId = event.turn_id;
        }

        current.events.push({ event, index });
      });

      pushCurrent();

      turns.forEach((turn, turnIndex) => {
        const turnId =
          turn.explicitTurnId ??
          `initial::${conversationId}::${turnIndex.toString()}`;
        turn.events.forEach(({ event, index }) => {
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
      });
      store.getState().setReasoningSummaryPreference(reasoningSummary);

      // Mark historical turns as completed so the transcript UI can collapse
      // intermediate cells. Initial messages omit task lifecycle events, so
      // turns would otherwise remain "active" after replay.
      store.setState((state) =>
        produce(state, (draft) => {
          const transcript = draft.conversation.transcript;
          transcript.turnOrder.forEach((id) => {
            const turn = transcript.turns[id];
            if (turn && turn.status === 'active') {
              turn.status = 'completed';
            }
          });
          transcript.activeTurnId = null;
        })
      );

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
        // Even if the thread is already loaded, touching it should
        // update its position in the MRU-style recent list so the
        // recent conversation switcher cycles by last access time.
        touchRecentThread(threadId);
        return mappedConversation;
      }

      threadLoading.set(threadId, 'loading');

      try {
        const { conversationId, sessionConfigured, reasoningSummary } =
          await Codex.initializeThread({
            threadId,
            workspacePath: deps.workspacePath,
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

        if (!hasLoadedStore && reasoningToHydrate) {
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
