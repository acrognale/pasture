import type { QueryClient } from '@tanstack/react-query';
import type { ConversationSummary } from '~/codex.gen/ConversationSummary';
import type { ListConversationsResponse } from '~/codex.gen/ListConversationsResponse';
import {
  normalizeWorkspaceSlashes,
  trimWorkspaceTrailingSeparators,
} from '~/lib/workspaces';

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
  queryClient.setQueryData<ListConversationsResponse>(
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
  queryClient.setQueryData<ListConversationsResponse>(
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
