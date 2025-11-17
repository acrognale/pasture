import {
  type PropsWithChildren,
  createContext,
  useCallback,
  useContext,
  useMemo,
  useRef,
} from 'react';
import { type ApprovalsStore, createApprovalsStore } from '~/approvals/store';
import type { ConversationEventPayload } from '~/codex.gen/ConversationEventPayload';
import { Codex } from '~/codex/client';
import {
  type ConversationStore,
  createConversationStore,
} from '~/conversation/store/store';
import { createWorkspaceKeys } from '~/lib/workspaceKeys';

import { normalizeWorkspacePath } from './conversations';
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
  clearConversationStore: (conversationId: string) => void;
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
  const conversationStoresRef = useRef(new Map<string, ConversationStore>());
  const loadingStatesRef = useRef<
    Map<string, 'idle' | 'loading' | 'loaded' | 'error'>
  >(new Map());
  const fallbackConversationStoreRef = useRef(createConversationStore());

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

  const loadConversation = useCallback(
    async (conversationId: string, options?: { force?: boolean }) => {
      if (!conversationId) {
        return;
      }

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
        const { sessionConfigured, reasoningSummary } =
          await Codex.initializeConversation({ conversationId });

        const events = sessionConfigured.initial_messages
          ? [...sessionConfigured.initial_messages]
          : [];
        // initializeConversation is the sole source of historical events; the live stream starts
        // after the session is configured, so we must ingest the returned messages here.
        events.forEach((event, index) => {
          store.getState().ingestEvent({
            conversationId,
            eventId: `initial::${conversationId}::${index}`,
            event,
          });
        });
        store.getState().setReasoningSummaryPreference(reasoningSummary);

        store.getState().setLoading(false);
        loadingStates.set(conversationId, 'loaded');
      } catch (error) {
        store.getState().reset();
        store.getState().setLoading(false);
        store
          .getState()
          .setError(error instanceof Error ? error : new Error(String(error)));
        loadingStates.set(conversationId, 'error');
      }
    },
    [ensureConversationStore]
  );

  const clearConversationStore = useCallback((conversationId: string) => {
    conversationStoresRef.current.delete(conversationId);
    loadingStatesRef.current.delete(conversationId);
  }, []);

  const value = useMemo<WorkspaceContextValue>(
    () => ({
      workspacePath: metadata.workspacePath,
      normalizedWorkspacePath: metadata.normalizedWorkspacePath,
      keys,
      approvalsStore,
      getConversationStore,
      applyConversationEvent,
      loadConversation,
      clearConversationStore,
    }),
    [
      applyConversationEvent,
      approvalsStore,
      clearConversationStore,
      getConversationStore,
      keys,
      loadConversation,
      metadata,
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
    clearConversationStore,
  } = useWorkspaceContext();

  return {
    getConversationStore,
    applyConversationEvent,
    loadConversation,
    clearConversationStore,
  };
};
