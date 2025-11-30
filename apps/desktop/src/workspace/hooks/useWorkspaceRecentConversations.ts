import { useMemo } from 'react';
import type { ThreadSummary } from '~/codex.gen/ThreadSummary';

import {
  useWorkspaceRecentThreads,
  useWorkspaceThreadConversationIds,
} from '../WorkspaceProvider';
import { useWorkspaceThreads } from './useWorkspaceThreads';

export type RecentConversationItem = {
  threadId: string;
  conversationId: string;
  title: string | null;
  preview: string;
  timestamp: string;
  workspacePath: string;
  conversationCount: number;
};

const mapThread = (thread: ThreadSummary): RecentConversationItem => ({
  threadId: thread.threadId,
  conversationId: thread.currentConversationId,
  title: thread.title,
  preview: thread.preview,
  timestamp: thread.timestamp,
  workspacePath: thread.workspacePath,
  conversationCount: thread.conversationCount,
});

export const useWorkspaceRecentConversations = (): RecentConversationItem[] => {
  const recentThreadIds = useWorkspaceRecentThreads();
  const threads = useWorkspaceThreads();
  const threadConversationIds = useWorkspaceThreadConversationIds();

  return useMemo(() => {
    const loadedThreadIds = new Set(
      Object.keys(threadConversationIds ?? {}).filter(
        (id) => threadConversationIds[id]
      )
    );

    const threadById = new Map(
      threads.items
        .filter((thread) => loadedThreadIds.has(thread.threadId))
        .map((thread) => [thread.threadId, thread])
    );

    const ordered: RecentConversationItem[] = [];
    for (const threadId of recentThreadIds) {
      const thread = threadById.get(threadId);
      if (thread) {
        ordered.push(mapThread(thread));
      }
    }

    return ordered;
  }, [recentThreadIds, threadConversationIds, threads.items]);
};
