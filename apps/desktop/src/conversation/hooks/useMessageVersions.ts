import { useEffect, useMemo, useState } from 'react';
import { useWorkspaceConversationStores } from '~/workspace';

export type MessageVersionEntry = {
  conversationId: string;
  createdAt: string;
  forkedFromConversationId: string | null;
  forkedFromNthUserMessage: number | null;
};

type UseMessageVersionsParams = {
  conversationId: string;
  nthUserMessage?: number;
};

export const useMessageVersions = ({
  conversationId,
  nthUserMessage,
}: UseMessageVersionsParams) => {
  const {
    getThreadIdForConversation,
    getThreadConversationId,
    getThreadVersionGroups,
    loadThreadRollouts,
    switchThreadConversation,
  } = useWorkspaceConversationStores();
  const [isLoading, setIsLoading] = useState(false);
  const threadId = useMemo(
    () => getThreadIdForConversation(conversationId),
    [conversationId, getThreadIdForConversation]
  );

  useEffect(() => {
    if (!threadId || nthUserMessage == null) {
      return;
    }

    let cancelled = false;
    const run = async () => {
      try {
        setIsLoading(true);
        await loadThreadRollouts(threadId);
      } finally {
        if (!cancelled) {
          setIsLoading(false);
        }
      }
    };

    void run();

    return () => {
      cancelled = true;
    };
  }, [loadThreadRollouts, nthUserMessage, threadId]);

  const versions = useMemo<MessageVersionEntry[]>(() => {
    if (!threadId || nthUserMessage == null) {
      return [];
    }
    const groups = getThreadVersionGroups(threadId);
    const items = groups?.get(nthUserMessage) ?? [];
    return items.map((rollout) => ({
      conversationId: rollout.conversationId,
      createdAt: rollout.createdAt,
      forkedFromConversationId: rollout.forkedFromConversationId ?? null,
      forkedFromNthUserMessage: rollout.forkedFromNthUserMessage ?? null,
    }));
  }, [getThreadVersionGroups, nthUserMessage, threadId]);

  const activeConversationId = useMemo(
    () => (threadId ? getThreadConversationId(threadId) : null),
    [getThreadConversationId, threadId]
  );

  const selectVersion = async (targetConversationId: string) => {
    if (!threadId || !targetConversationId) {
      return null;
    }
    try {
      setIsLoading(true);
      const resolvedConversationId = await switchThreadConversation(
        threadId,
        targetConversationId
      );
      return resolvedConversationId;
    } finally {
      setIsLoading(false);
    }
  };

  return {
    versions,
    activeConversationId,
    isLoading,
    selectVersion,
  };
};
