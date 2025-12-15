import { useQueryClient } from '@tanstack/react-query';
import {
  type PropsWithChildren,
  createContext,
  useContext,
  useMemo,
} from 'react';
import { useStore } from 'zustand';
import { type ApprovalsStore, createApprovalsStore } from '~/approvals/store';
import { createWorkspaceKeys } from '~/lib/workspaceKeys';
import { useRepoDiffAutoRefresh } from '~/review/useRepoDiffAutoRefresh';

import { normalizeWorkspacePath } from './conversations';
import {
  type WorkspaceStore,
  type WorkspaceStoreActions,
  createWorkspaceStore,
} from './store';

type WorkspaceContextValue = {
  workspacePath: string;
  normalizedWorkspacePath: string | null;
  keys: ReturnType<typeof createWorkspaceKeys>;
  approvalsStore: ApprovalsStore;
  workspaceStore: WorkspaceStore;
};

const WorkspaceContext = createContext<WorkspaceContextValue | null>(null);

type WorkspaceProviderProps = PropsWithChildren<{
  workspacePath: string;
}>;

export const WorkspaceProvider = ({
  workspacePath,
  children,
}: WorkspaceProviderProps) => {
  const queryClient = useQueryClient();

  useRepoDiffAutoRefresh(workspacePath);

  const normalizedWorkspacePath = useMemo(
    () => normalizeWorkspacePath(workspacePath),
    [workspacePath]
  );
  const keys = useMemo(
    () => createWorkspaceKeys(workspacePath),
    [workspacePath]
  );
  const approvalsStore = useMemo(() => {
    void workspacePath;
    return createApprovalsStore();
  }, [workspacePath]);

  const workspaceStore = useMemo(
    () =>
      createWorkspaceStore({
        workspacePath,
        normalizedWorkspacePath,
        keys,
        queryClient,
      }),
    [workspacePath, normalizedWorkspacePath, keys, queryClient]
  );

  const value = useMemo<WorkspaceContextValue>(
    () => ({
      workspacePath,
      normalizedWorkspacePath,
      keys,
      approvalsStore,
      workspaceStore,
    }),
    [
      workspacePath,
      normalizedWorkspacePath,
      keys,
      approvalsStore,
      workspaceStore,
    ]
  );

  return (
    <WorkspaceContext.Provider value={value}>
      {children}
    </WorkspaceContext.Provider>
  );
};

const useWorkspaceContext = () => {
  const ctx = useContext(WorkspaceContext);
  if (!ctx)
    throw new Error('WorkspaceProvider is missing in the component tree.');
  return ctx;
};

const useWorkspaceStore = () => useWorkspaceContext().workspaceStore;

export const useWorkspaceActions = (): WorkspaceStoreActions => {
  const store = useWorkspaceStore();
  return useStore(store, (state) => state.actions);
};

export const useWorkspaceOpenThreads = () => {
  const store = useWorkspaceStore();
  return useStore(store, (state) => state.openThreadIds);
};

export const useWorkspaceRecentThreads = () => {
  const store = useWorkspaceStore();
  return useStore(store, (state) => state.recentThreadIds);
};

export const useWorkspaceThreadConversationId = (threadId: string | null) => {
  const store = useWorkspaceStore();
  return useStore(
    store,
    (state) => (threadId ? state.threadConversationIds[threadId] : null) ?? null
  );
};

export const useWorkspaceThreadConversationIds = () => {
  const store = useWorkspaceStore();
  return useStore(store, (state) => state.threadConversationIds);
};

export const useWorkspace = () => {
  const { workspacePath, normalizedWorkspacePath } = useWorkspaceContext();
  return { workspacePath, normalizedWorkspacePath };
};

export const useWorkspaceKeys = () => useWorkspaceContext().keys;

export const useWorkspaceApprovalsStore = () =>
  useWorkspaceContext().approvalsStore;
