import type { MessageVersionEntry } from '@pasture/transcript-ui';
import { useEffect, useMemo, useState } from 'react';
import {
  getForksAtMessage,
  useWorkspaceActions,
  useWorkspaceThreadConversations,
} from '~/workspace';

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
  const { conversations, currentConversationId, query } =
    useWorkspaceThreadConversations(threadId ?? null);

  const versions = useMemo(() => {
    if (!threadId || nthUserMessage == null) {
      return [];
    }
    const currentConversation = conversations.find(
      (c) => c.id === conversationId
    );
    if (!currentConversation) {
      return [];
    }
    const forks = getForksAtMessage(
      currentConversation,
      nthUserMessage,
      conversations
    );
    return forks.map((conversation) => ({
      conversationId: conversation.id,
      createdAt: conversation.createdAt,
      parentConversationId: conversation.parentConversationId ?? null,
      forkedAtNthUserMessage: conversation.forkedAtNthUserMessage ?? null,
    }));
  }, [conversationId, conversations, nthUserMessage, threadId]);

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
