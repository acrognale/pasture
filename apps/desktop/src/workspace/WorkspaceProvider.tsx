import { useQueryClient } from '@tanstack/react-query';
import {
  type PropsWithChildren,
  createContext,
  useCallback,
  useContext,
  useMemo,
  useRef,
  useState,
} from 'react';
import { type ApprovalsStore, createApprovalsStore } from '~/approvals/store';
import type { ConversationEventPayload } from '~/codex.gen/ConversationEventPayload';
import type { ListThreadRolloutsResponse } from '~/codex.gen/ListThreadRolloutsResponse';
import { Codex } from '~/codex/client';
import {
  type ConversationStore,
  createConversationStore,
} from '~/conversation/store/store';
import { createWorkspaceKeys } from '~/lib/workspaceKeys';

import { normalizeWorkspacePath } from './conversations';
import type { WorkspaceThreadsState } from './hooks/useWorkspaceThreads';
import type { WorkspaceMetadata } from './types';

type WorkspaceContextValue = {
  workspacePath: string;
  normalizedWorkspacePath: string | null;
  keys: ReturnType<typeof createWorkspaceKeys>;
  approvalsStore: ApprovalsStore;
  getConversationStore: (conversationId: string | null) => ConversationStore;
  applyConversationEvent: (
    payload: ConversationEventPayload
  ) => ConversationStore | null;
  loadConversation: (
    conversationId: string,
    options?: { force?: boolean }
  ) => Promise<void>;
  loadThread: (
    threadId: string,
    options?: { force?: boolean }
  ) => Promise<string | null>;
  forkThread: (
    threadId: string,
    baseConversationId: string,
    nthUserMessage: number
  ) => Promise<string | null>;
  getThreadConversationId: (threadId: string) => string | null;
  getThreadIdForConversation: (conversationId: string) => string | null;
  switchThreadConversation: (
    threadId: string,
    conversationId: string
  ) => Promise<string | null>;
  clearConversationStore: (conversationId: string) => void;
  openConversationIds: string[];
  closeConversation: (conversationId: string) => void;
  openThreadIds: string[];
  closeThread: (threadId: string) => void;
};

const WorkspaceContext = createContext<WorkspaceContextValue | null>(null);

type WorkspaceProviderProps = PropsWithChildren<{
  workspacePath: string;
}>;

export const WorkspaceProvider = ({
  workspacePath,
  children,
}: WorkspaceProviderProps) => {
  const normalizedWorkspacePath = useMemo(
    () => normalizeWorkspacePath(workspacePath),
    [workspacePath]
  );
  const metadata = useMemo<WorkspaceMetadata>(
    () => ({ workspacePath, normalizedWorkspacePath }),
    [workspacePath, normalizedWorkspacePath]
  );
  const keys = useMemo(
    () => createWorkspaceKeys(workspacePath),
    [workspacePath]
  );
  const approvalsStore = useMemo(() => {
    void workspacePath;
    return createApprovalsStore();
  }, [workspacePath]);
  const queryClient = useQueryClient();
  const conversationStoresRef = useRef(new Map<string, ConversationStore>());
  const loadingStatesRef = useRef<
    Map<string, 'idle' | 'loading' | 'loaded' | 'error'>
  >(new Map());
  const fallbackConversationStoreRef = useRef(createConversationStore());
  const openConversationIdsRef = useRef<Set<string>>(new Set());
  const [openConversationIds, setOpenConversationIds] = useState<string[]>([]);
  const openThreadIdsRef = useRef<Set<string>>(new Set());
  const [openThreadIds, setOpenThreadIds] = useState<string[]>([]);
  const threadConversationMapRef = useRef<Map<string, string>>(new Map());
  const conversationToThreadMapRef = useRef<Map<string, string>>(new Map());
  const threadLoadingStatesRef = useRef<
    Map<string, 'idle' | 'loading' | 'loaded' | 'error'>
  >(new Map());

  const syncOpenConversationIds = useCallback(() => {
    setOpenConversationIds(Array.from(openConversationIdsRef.current));
  }, []);

  const markConversationOpen = useCallback(
    (conversationId: string) => {
      if (!conversationId) {
        return;
      }
      if (openConversationIdsRef.current.has(conversationId)) {
        return;
      }
      openConversationIdsRef.current.add(conversationId);
      syncOpenConversationIds();
    },
    [syncOpenConversationIds]
  );

  const closeConversation = useCallback(
    (conversationId: string) => {
      if (!conversationId) {
        return;
      }
      if (!openConversationIdsRef.current.has(conversationId)) {
        return;
      }
      openConversationIdsRef.current.delete(conversationId);
      syncOpenConversationIds();
    },
    [syncOpenConversationIds]
  );

  const syncOpenThreadIds = useCallback(() => {
    setOpenThreadIds(Array.from(openThreadIdsRef.current));
  }, []);

  const clearConversationStore = useCallback(
    (conversationId: string) => {
      conversationStoresRef.current.delete(conversationId);
      loadingStatesRef.current.delete(conversationId);
      conversationToThreadMapRef.current.delete(conversationId);
      closeConversation(conversationId);
    },
    [closeConversation]
  );

  const markThreadOpen = useCallback(
    (threadId: string) => {
      if (!threadId) {
        return;
      }
      if (openThreadIdsRef.current.has(threadId)) {
        return;
      }
      openThreadIdsRef.current.add(threadId);
      syncOpenThreadIds();
    },
    [syncOpenThreadIds]
  );

  const closeThread = useCallback(
    (threadId: string) => {
      if (!threadId) {
        return;
      }
      const conversationId = threadConversationMapRef.current.get(threadId);
      threadConversationMapRef.current.delete(threadId);
      if (conversationId) {
        conversationToThreadMapRef.current.delete(conversationId);
      }
      if (openThreadIdsRef.current.has(threadId)) {
        openThreadIdsRef.current.delete(threadId);
        syncOpenThreadIds();
      }
      if (conversationId) {
        closeConversation(conversationId);
        clearConversationStore(conversationId);
      }
    },
    [clearConversationStore, closeConversation, syncOpenThreadIds]
  );

  const ensureConversationStore = useCallback((conversationId: string) => {
    if (!conversationId) {
      throw new Error('conversationId is required');
    }
    let store = conversationStoresRef.current.get(conversationId);
    if (!store) {
      store = createConversationStore({ conversationId });
      conversationStoresRef.current.set(conversationId, store);
    }
    return store;
  }, []);

  const getConversationStore = useCallback(
    (conversationId: string | null) => {
      if (!conversationId) {
        return fallbackConversationStoreRef.current;
      }
      return ensureConversationStore(conversationId);
    },
    [ensureConversationStore]
  );

  const applyConversationEvent = useCallback(
    (payload: ConversationEventPayload) => {
      if (!payload.conversationId) {
        return null;
      }
      const store = ensureConversationStore(payload.conversationId);
      store.getState().ingestEvent(payload);
      return store;
    },
    [ensureConversationStore]
  );

  const hydrateConversationStore = useCallback(
    (
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
    },
    [ensureConversationStore]
  );

  const loadThread = useCallback(
    async (threadId: string, options?: { force?: boolean }) => {
      if (!threadId) {
        return null;
      }

      markThreadOpen(threadId);

      const loadingStates = threadLoadingStatesRef.current;
      const status = loadingStates.get(threadId);
      const mappedConversation = threadConversationMapRef.current.get(threadId);
      if (!options?.force && status === 'loading') {
        return mappedConversation ?? null;
      }
      if (!options?.force && status === 'loaded' && mappedConversation) {
        return mappedConversation;
      }

      loadingStates.set(threadId, 'loading');

      try {
        const { sessionConfigured, reasoningSummary } =
          await Codex.initializeThread({
            threadId,
            workspacePath,
          });

        const conversationId = sessionConfigured.session_id;
        threadConversationMapRef.current.set(threadId, conversationId);
        conversationToThreadMapRef.current.set(conversationId, threadId);
        markConversationOpen(conversationId);
        loadingStatesRef.current.set(conversationId, 'loaded');

        const store = hydrateConversationStore(
          conversationId,
          sessionConfigured,
          reasoningSummary
        );
        store.getState().setLoading(false);
        loadingStates.set(threadId, 'loaded');
        return conversationId;
      } catch (error) {
        loadingStates.set(threadId, 'error');
        throw error;
      }
    },
    [
      hydrateConversationStore,
      markConversationOpen,
      markThreadOpen,
      workspacePath,
    ]
  );

  const forkThread = useCallback(
    async (
      threadId: string,
      baseConversationId: string,
      nthUserMessage: number
    ) => {
      if (!threadId || !baseConversationId) {
        return null;
      }

      markThreadOpen(threadId);
      const threadLoadingStates = threadLoadingStatesRef.current;

      try {
        threadLoadingStates.set(threadId, 'loading');
        const {
          conversationId,
          sessionConfigured,
          reasoningSummary,
          rolloutPath,
          baseConversationId: forkBaseConversationId,
          nthUserMessage: forkNthUserMessage,
          createdAt,
        } = await Codex.forkThread({
          workspacePath,
          threadId,
          baseConversationId,
          nthUserMessage,
          options: null,
        });

        threadConversationMapRef.current.set(threadId, conversationId);
        conversationToThreadMapRef.current.set(conversationId, threadId);
        markConversationOpen(conversationId);
        loadingStatesRef.current.set(conversationId, 'loaded');
        const store = hydrateConversationStore(
          conversationId,
          sessionConfigured,
          reasoningSummary
        );
        store.getState().setLoading(false);
        threadLoadingStates.set(threadId, 'loaded');
        queryClient.setQueryData<WorkspaceThreadsState | undefined>(
          keys.threads(),
          (state) => {
            if (!state) {
              return state;
            }
            const index = state.items.findIndex(
              (thread) => thread.threadId === threadId
            );
            if (index === -1) {
              return state;
            }
            const updated = {
              ...state.items[index],
              currentConversationId: conversationId,
              rolloutCount: (state.items[index]?.rolloutCount ?? 0) + 1,
              timestamp: createdAt,
            };
            const items = [...state.items];
            items[index] = updated;
            return { ...state, items };
          }
        );
        queryClient.setQueryData<ListThreadRolloutsResponse | undefined>(
          keys.threadRollouts(threadId),
          (state) => {
            const rollouts = state?.rollouts ?? [];
            const existingIndex = rollouts.findIndex(
              (item) => item.conversationId === conversationId
            );
            const nextRollouts =
              existingIndex === -1
                ? [
                    ...rollouts,
                    {
                      conversationId,
                      rolloutPath,
                      createdAt,
                      label: null,
                      forkedFromConversationId: forkBaseConversationId,
                      forkedFromNthUserMessage: forkNthUserMessage,
                    },
                  ]
                : [
                    ...rollouts.slice(0, existingIndex),
                    {
                      conversationId,
                      rolloutPath,
                      createdAt,
                      label: null,
                      forkedFromConversationId: forkBaseConversationId,
                      forkedFromNthUserMessage: forkNthUserMessage,
                    },
                    ...rollouts.slice(existingIndex + 1),
                  ];

            return {
              threadId,
              currentConversationId: conversationId,
              rollouts: nextRollouts,
            };
          }
        );
        return conversationId;
      } catch (error) {
        threadLoadingStates.set(threadId, 'error');
        throw error;
      }
    },
    [
      hydrateConversationStore,
      markConversationOpen,
      markThreadOpen,
      queryClient,
      workspacePath,
      keys,
    ]
  );

  const switchThreadConversation = useCallback(
    async (threadId: string, conversationId: string) => {
      if (!threadId || !conversationId) {
        return null;
      }

      markThreadOpen(threadId);
      const threadLoadingStates = threadLoadingStatesRef.current;
      try {
        threadLoadingStates.set(threadId, 'loading');
        const {
          conversationId: resolvedConversationId,
          sessionConfigured,
          reasoningSummary,
        } = await Codex.switchThreadRollout({
          workspacePath,
          threadId,
          conversationId,
        });

        const conversationIdStr = resolvedConversationId;
        threadConversationMapRef.current.set(threadId, conversationIdStr);
        conversationToThreadMapRef.current.set(conversationIdStr, threadId);
        markConversationOpen(conversationIdStr);
        const loadingStates = loadingStatesRef.current;
        const hasLoadedStore =
          !!conversationStoresRef.current.get(conversationIdStr) &&
          loadingStates.get(conversationIdStr) === 'loaded';

        let sessionToHydrate = sessionConfigured;
        let reasoningToHydrate = reasoningSummary;

        if (!hasLoadedStore && !sessionToHydrate) {
          // The runtime may already have this conversation active and omit initial
          // messages. In that case, explicitly re-initialize the thread to hydrate
          // the transcript for the target conversation.
          const init = await Codex.initializeThread({
            threadId,
            workspacePath,
          });
          sessionToHydrate = init.sessionConfigured;
          reasoningToHydrate = init.reasoningSummary;
        }

        if (!hasLoadedStore && sessionToHydrate && reasoningToHydrate) {
          loadingStates.set(conversationIdStr, 'loading');
          const store = hydrateConversationStore(
            conversationIdStr,
            sessionToHydrate,
            reasoningToHydrate
          );
          store.getState().setLoading(false);
          loadingStates.set(conversationIdStr, 'loaded');
        } else {
          loadingStates.set(conversationIdStr, 'loaded');
        }

        threadLoadingStates.set(threadId, 'loaded');

        const timestamp = new Date().toISOString();
        queryClient.setQueryData<WorkspaceThreadsState | undefined>(
          keys.threads(),
          (state) => {
            if (!state) {
              return state;
            }
            const index = state.items.findIndex(
              (thread) => thread.threadId === threadId
            );
            if (index === -1) {
              return state;
            }
            const updated = {
              ...state.items[index],
              currentConversationId: conversationIdStr,
              timestamp,
            };
            const items = [...state.items];
            items[index] = updated;
            return { ...state, items };
          }
        );
        queryClient.setQueryData<ListThreadRolloutsResponse | undefined>(
          keys.threadRollouts(threadId),
          (state) =>
            state
              ? { ...state, currentConversationId: conversationIdStr }
              : state
        );

        return conversationIdStr;
      } catch (error) {
        threadLoadingStates.set(threadId, 'error');
        throw error;
      }
    },
    [
      hydrateConversationStore,
      markConversationOpen,
      markThreadOpen,
      workspacePath,
      queryClient,
      keys,
    ]
  );

  const loadConversation = useCallback(
    async (conversationId: string, options?: { force?: boolean }) => {
      if (!conversationId) {
        return;
      }

      markConversationOpen(conversationId);

      const loadingStates = loadingStatesRef.current;
      const status = loadingStates.get(conversationId);
      if (!options?.force && (status === 'loading' || status === 'loaded')) {
        return;
      }

      loadingStates.set(conversationId, 'loading');
      const store = ensureConversationStore(conversationId);
      store.getState().reset();
      store.getState().setLoading(true);
      store.getState().setError(null);

      try {
        const threadId = conversationToThreadMapRef.current.get(conversationId);
        if (!threadId) {
          throw new Error('Conversation is not associated with a thread');
        }

        const resolvedConversationId = await loadThread(threadId, {
          force: options?.force,
        });

        if (resolvedConversationId) {
          loadingStates.set(resolvedConversationId, 'loaded');
        }
      } catch (error) {
        store.getState().reset();
        store.getState().setLoading(false);
        store
          .getState()
          .setError(error instanceof Error ? error : new Error(String(error)));
        loadingStates.set(conversationId, 'error');
      }
    },
    [ensureConversationStore, loadThread, markConversationOpen]
  );

  const value = useMemo<WorkspaceContextValue>(
    () => ({
      workspacePath: metadata.workspacePath,
      normalizedWorkspacePath: metadata.normalizedWorkspacePath,
      keys,
      approvalsStore,
      getConversationStore,
      applyConversationEvent,
      loadConversation,
      loadThread,
      forkThread,
      switchThreadConversation,
      getThreadConversationId: (threadId: string) =>
        threadConversationMapRef.current.get(threadId) ?? null,
      getThreadIdForConversation: (conversationId: string) =>
        conversationToThreadMapRef.current.get(conversationId) ?? null,
      clearConversationStore,
      openConversationIds,
      openThreadIds,
      closeConversation,
      closeThread,
    }),
    [
      applyConversationEvent,
      approvalsStore,
      closeThread,
      closeConversation,
      clearConversationStore,
      getConversationStore,
      keys,
      loadConversation,
      loadThread,
      forkThread,
      switchThreadConversation,
      metadata,
      openConversationIds,
      openThreadIds,
    ]
  );

  return (
    <WorkspaceContext.Provider value={value}>
      {children}
    </WorkspaceContext.Provider>
  );
};

const useWorkspaceContext = () => {
  const context = useContext(WorkspaceContext);
  if (!context) {
    throw new Error('WorkspaceProvider is missing in the component tree.');
  }
  return context;
};

export const useWorkspace = () => {
  const { workspacePath, normalizedWorkspacePath } = useWorkspaceContext();
  return { workspacePath, normalizedWorkspacePath };
};

export const useWorkspaceKeys = () => useWorkspaceContext().keys;

export const useWorkspaceApprovalsStore = () =>
  useWorkspaceContext().approvalsStore;

export const useWorkspaceConversationStores = () => {
  const {
    getConversationStore,
    applyConversationEvent,
    loadConversation,
    loadThread,
    forkThread,
    switchThreadConversation,
    getThreadIdForConversation,
    clearConversationStore,
    closeConversation,
    getThreadConversationId,
  } = useWorkspaceContext();

  return {
    getConversationStore,
    applyConversationEvent,
    loadConversation,
    loadThread,
    forkThread,
    switchThreadConversation,
    getThreadIdForConversation,
    clearConversationStore,
    closeConversation,
    getThreadConversationId,
  };
};

export const useWorkspaceOpenConversations = () =>
  useWorkspaceContext().openConversationIds;

export const useWorkspaceThreadsContext = () => {
  const {
    loadThread,
    forkThread,
    switchThreadConversation,
    getThreadConversationId,
    openThreadIds,
    closeThread,
  } = useWorkspaceContext();

  return {
    loadThread,
    forkThread,
    switchThreadConversation,
    getThreadConversationId,
    openThreadIds,
    closeThread,
  };
};

export const useWorkspaceOpenThreads = () =>
  useWorkspaceContext().openThreadIds;
