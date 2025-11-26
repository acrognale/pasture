import type { QueryClient } from '@tanstack/react-query';
import type { ThreadSummary } from '~/codex.gen/ThreadSummary';
import {
  normalizeWorkspaceSlashes,
  trimWorkspaceTrailingSeparators,
} from '~/lib/workspaces';

export type ConversationSummary = {
  conversationId: string;
  path: string;
  cwd: string;
  preview: string;
  timestamp?: string | null;
};

export type WorkspaceConversationsState = {
  items: ConversationSummary[];
  nextCursor: string | null;
};

type WorkspaceThreadsState = {
  items: ThreadSummary[];
};

export const normalizeWorkspacePath = (
  value: string | null | undefined
): string | null => {
  if (!value) {
    return null;
  }
  return trimWorkspaceTrailingSeparators(normalizeWorkspaceSlashes(value));
};

export const sortConversationsByTimestamp = (
  items: ConversationSummary[]
): ConversationSummary[] => {
  return [...items].sort((a, b) => {
    if (!a.timestamp && !b.timestamp) {
      return 0;
    }
    if (!a.timestamp) {
      return 1;
    }
    if (!b.timestamp) {
      return -1;
    }
    return b.timestamp.localeCompare(a.timestamp);
  });
};

export const sortThreadsByTimestamp = (
  items: ThreadSummary[]
): ThreadSummary[] => {
  return [...items].sort((a, b) => b.timestamp.localeCompare(a.timestamp));
};

export const filterThreadsForWorkspace = (
  items: ThreadSummary[],
  normalizedWorkspace: string | null
): ThreadSummary[] => {
  if (!normalizedWorkspace) {
    return [];
  }

  return items.filter(
    (item) => normalizeWorkspacePath(item.workspacePath) === normalizedWorkspace
  );
};

export const mapThreadToConversationSummary = (
  thread: ThreadSummary,
  normalizedWorkspace: string | null
): ConversationSummary => {
  const label = thread.title || thread.preview || 'Untitled session';
  return {
    conversationId: thread.currentConversationId,
    path: '',
    cwd: normalizedWorkspace ?? thread.workspacePath,
    preview: label,
    timestamp: thread.timestamp,
  };
};

export const filterSummariesForWorkspace = (
  items: ConversationSummary[],
  normalizedWorkspace: string | null
): ConversationSummary[] => {
  if (!normalizedWorkspace) {
    return [];
  }

  return items.filter(
    (item) => normalizeWorkspacePath(item.cwd) === normalizedWorkspace
  );
};

export const updateConversationTimestamp = (
  queryClient: QueryClient,
  conversationsKey: readonly unknown[],
  conversationId: string,
  timestamp: string
) => {
  queryClient.setQueryData<WorkspaceConversationsState>(
    conversationsKey,
    (state) => {
      if (!state) {
        return state;
      }

      const index = state.items.findIndex(
        (summary) => summary.conversationId === conversationId
      );

      if (index === -1) {
        return state;
      }

      const updated: ConversationSummary = {
        ...state.items[index],
        timestamp,
      };

      const updatedItems = [
        ...state.items.slice(0, index),
        updated,
        ...state.items.slice(index + 1),
      ];

      return {
        ...state,
        items: sortConversationsByTimestamp(updatedItems),
      };
    }
  );
};

export const updateConversationPreview = (
  queryClient: QueryClient,
  conversationsKey: readonly unknown[],
  conversationId: string,
  preview: string,
  timestamp: string
) => {
  queryClient.setQueryData<WorkspaceConversationsState>(
    conversationsKey,
    (state) => {
      if (!state) {
        return state;
      }

      const index = state.items.findIndex(
        (summary) => summary.conversationId === conversationId
      );

      if (index === -1) {
        return state;
      }

      const updated: ConversationSummary = {
        ...state.items[index],
        preview,
        timestamp,
      };

      const updatedItems = [
        ...state.items.slice(0, index),
        updated,
        ...state.items.slice(index + 1),
      ];

      return {
        ...state,
        items: sortConversationsByTimestamp(updatedItems),
      };
    }
  );
};

export const updateThreadPreview = (
  queryClient: QueryClient,
  threadsKey: readonly unknown[],
  threadId: string,
  preview: string,
  timestamp: string
) => {
  queryClient.setQueryData<WorkspaceThreadsState | undefined>(
    threadsKey,
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
        preview,
        timestamp,
      };

      const items = [...state.items];
      items[index] = updated;

      return { ...state, items: sortThreadsByTimestamp(items) };
    }
  );
};

export const updateThreadTitle = (
  queryClient: QueryClient,
  threadsKey: readonly unknown[],
  threadId: string,
  title: string,
  timestamp: string | undefined
) => {
  queryClient.setQueryData<WorkspaceThreadsState | undefined>(
    threadsKey,
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
        title,
        timestamp: timestamp ?? state.items[index].timestamp,
      };

      const items = [...state.items];
      items[index] = updated;

      return { ...state, items: sortThreadsByTimestamp(items) };
    }
  );
};

export const updateThreadTimestamp = (
  queryClient: QueryClient,
  threadsKey: readonly unknown[],
  threadId: string,
  timestamp: string
) => {
  queryClient.setQueryData<WorkspaceThreadsState | undefined>(
    threadsKey,
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
        timestamp,
      };

      const items = [...state.items];
      items[index] = updated;

      return { ...state, items: sortThreadsByTimestamp(items) };
    }
  );
};
