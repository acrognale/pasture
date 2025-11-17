import {
  type PropsWithChildren,
  createContext,
  useContext,
  useEffect,
  useMemo,
} from 'react';
import { createApprovalsStore } from '~/approvals/store';
import type { ApprovalsStore } from '~/approvals/store';
import type { ConversationSummary } from '~/codex.gen/ConversationSummary';
import { createInitialConversationState } from '~/conversation/store/reducer';
import { createWorkspaceKeys } from '~/lib/workspaceKeys';
import {
  normalizeWorkspacePath as baseNormalizeWorkspacePath,
  sortConversationsByTimestamp as baseSortConversationsByTimestamp,
  updateConversationPreview as baseUpdateConversationPreview,
  updateConversationTimestamp as baseUpdateConversationTimestamp,
} from '~/workspace/conversations';

import { mockCodexControls, mockCodexStore, useMockCodexStore } from './state';
import type { ConversationEntry } from './state';

type WorkspaceContextValue = {
  workspacePath: string;
  normalizedWorkspacePath: string | null;
  keys: ReturnType<typeof createWorkspaceKeys>;
  approvalsStore: ApprovalsStore;
};

const WorkspaceContext = createContext<WorkspaceContextValue | null>(null);

type WorkspaceProviderProps = PropsWithChildren<{
  workspacePath: string;
}>;

export const WorkspaceProvider = ({
  workspacePath,
  children,
}: WorkspaceProviderProps) => {
  const normalizedWorkspacePath = workspacePath || null;
  const keys = useMemo(
    () => createWorkspaceKeys(workspacePath),
    [workspacePath]
  );
  const approvalsStore = useMemo(() => createApprovalsStore(), []);

  useEffect(() => {
    mockCodexControls.setWorkspacePath(workspacePath);
  }, [workspacePath]);

  const value = useMemo<WorkspaceContextValue>(
    () => ({
      workspacePath,
      normalizedWorkspacePath,
      keys,
      approvalsStore,
    }),
    [approvalsStore, keys, normalizedWorkspacePath, workspacePath]
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
  const getConversationStore = (conversationId: string | null) => ({
    getState: () => {
      const stateSnapshot = mockCodexStore.getState();
      const entry: ConversationEntry | null = conversationId
        ? (stateSnapshot.entries[conversationId] ?? null)
        : null;
      const conversation = entry?.state ?? createInitialConversationState();
      return {
        data: {
          conversation,
        },
        getEventsAsJsonl: () => entry?.eventsJsonl ?? '',
        getEventCount: () => entry?.eventCount ?? 0,
      };
    },
  });

  return {
    getConversationStore,
    applyConversationEvent: () => null,
    applyOptimisticConversationEvent: () => () => undefined,
    loadConversation: () => Promise.resolve(),
    clearConversationStore: () => undefined,
  };
};

export type WorkspaceConversationsState = {
  items: ConversationSummary[];
  nextCursor: string | null;
};

export const useWorkspaceConversations = () => {
  const conversations = useMockCodexStore((state) => state.conversations);
  return {
    items: conversations,
    query: {
      data: { items: conversations, nextCursor: null },
      isLoading: false,
      isFetching: false,
      isPending: false,
    },
    hasMore: false,
    loadMore: () => Promise.resolve(),
    isLoadingMore: false,
  };
};

export function normalizeWorkspacePath(path: string) {
  return baseNormalizeWorkspacePath(path);
}

export function sortConversationsByTimestamp(list: ConversationSummary[]) {
  return baseSortConversationsByTimestamp(list);
}

export function updateConversationPreview(
  ...args: Parameters<typeof baseUpdateConversationPreview>
) {
  return baseUpdateConversationPreview(...args);
}

export function updateConversationTimestamp(
  ...args: Parameters<typeof baseUpdateConversationTimestamp>
) {
  return baseUpdateConversationTimestamp(...args);
}
