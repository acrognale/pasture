import { useEffect, useMemo, useState } from 'react';
import { useThreadVersionGroups, useWorkspaceActions } from '~/workspace';

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

type UseMessageVersionsResult = {
  versions: MessageVersionEntry[];
  activeConversationId: string | null;
  isLoading: boolean;
  selectVersion: (targetConversationId: string) => Promise<string | null>;
};

export const useMessageVersions = ({
  conversationId,
  nthUserMessage,
}: UseMessageVersionsParams): UseMessageVersionsResult => {
  const {
    getThreadIdForConversation,
    getThreadConversationId,
    switchConversation,
  } = useWorkspaceActions();
  const [threadId, setThreadId] = useState<string | null>(() =>
    getThreadIdForConversation(conversationId)
  );
  useEffect(() => {
    setThreadId(getThreadIdForConversation(conversationId));
  }, [conversationId, getThreadIdForConversation]);
  const [isSwitching, setIsSwitching] = useState(false);
  const { groups, currentConversationId, query } = useThreadVersionGroups(
    threadId ?? null
  );

  const versions = useMemo(() => {
    if (!threadId || nthUserMessage == null) {
      return [];
    }
    const items = groups.get(nthUserMessage) ?? [];
    return items.map((conversation) => ({
      conversationId: conversation.id,
      createdAt: conversation.createdAt,
      forkedFromConversationId: conversation.parentConversationId ?? null,
      forkedFromNthUserMessage: conversation.forkedAtNthUserMessage ?? null,
    }));
  }, [groups, nthUserMessage, threadId]);

  const activeConversationId = useMemo(
    () =>
      threadId ? getThreadConversationId(threadId) : currentConversationId,
    [currentConversationId, getThreadConversationId, threadId]
  );

  const selectVersion = async (targetConversationId: string) => {
    if (!threadId || !targetConversationId) {
      return null;
    }
    try {
      setIsSwitching(true);
      const resolvedConversationId = await switchConversation(
        threadId,
        targetConversationId
      );
      return resolvedConversationId;
    } finally {
      setIsSwitching(false);
    }
  };

  return {
    versions,
    activeConversationId,
    isLoading: query.isLoading || query.isFetching || isSwitching,
    selectVersion,
  };
};
