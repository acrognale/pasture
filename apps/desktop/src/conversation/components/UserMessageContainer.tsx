import { UserMessage } from '@pasture/transcript-ui';
import { useMemo, useState } from 'react';
import { toast } from 'sonner';
import { Codex } from '~/codex/client';
import { buildInputItems } from '~/conversation/hooks/useSendMessage';
import type { TranscriptUserMessageCell } from '@pasture/transcript-ui';
import type { MessageAttachment } from '~/conversation/types';
import { formatTimestampClock } from '~/lib/time';
import { copyToClipboard } from '~/lib/utils';
import { useWorkspaceActions } from '~/workspace';

import { useMessageVersions } from '../hooks/useMessageVersions';

type UserMessageContainerProps = {
  cell: TranscriptUserMessageCell;
  conversationId: string;
  nthUserMessage?: number;
  onConversationForked?: (conversationId: string) => void;
};

export function UserMessageContainer({
  cell,
  conversationId,
  nthUserMessage,
  onConversationForked,
}: UserMessageContainerProps) {
  const message = cell.message ?? '';
  const timestamp = formatTimestampClock(cell.timestamp);
  const messageAttachments: MessageAttachment[] = useMemo(
    () =>
      (cell.images ?? []).map((path) => ({
        type: 'localImage' as const,
        path,
      })),
    [cell.images]
  );

  const [isActionPending, setIsActionPending] = useState(false);
  const { forkConversation, getThreadIdForConversation } =
    useWorkspaceActions();
  const {
    versions,
    activeConversationId,
    isLoading: versionsLoading,
    selectVersion,
  } = useMessageVersions({ conversationId, nthUserMessage });

  const handleCopy = async () => {
    if (!message) {
      return;
    }
    const success = await copyToClipboard(message);
    if (success) {
      toast.success('Copied to clipboard');
    } else {
      toast.error('Failed to copy to clipboard');
    }
  };

  const handleRetry = async () => {
    if (nthUserMessage == null) {
      toast.error('Unable to retry this message.');
      return;
    }
    const threadId = getThreadIdForConversation(conversationId);
    if (!threadId) {
      toast.error('Thread not found for this conversation.');
      return;
    }

    try {
      setIsActionPending(true);
      console.log('[UserMessage] retry from message', {
        conversationId,
        threadId,
        nthUserMessage,
        text: message,
      });
      const forkedConversationId = await forkConversation(
        threadId,
        conversationId,
        nthUserMessage
      );
      if (forkedConversationId) {
        console.log('[UserMessage] retry forked conversation', {
          forkedConversationId,
        });
        onConversationForked?.(forkedConversationId);
        const items = buildInputItems(message, messageAttachments);
        await Codex.sendUserMessage({
          conversationId: forkedConversationId,
          items,
          model: null,
          reasoningEffort: null,
          summary: null,
          sandbox: null,
          approvalPolicy: null,
        });
        console.log('[UserMessage] retry send complete', {
          forkedConversationId,
        });
      }
    } catch (error) {
      console.error('[UserMessage] retry failed', error);
      const description =
        error instanceof Error ? error.message : 'Please try again.';
      toast.error('Failed to retry message.', { description });
    } finally {
      setIsActionPending(false);
    }
  };

  const handleEdit = async (newMessage: string) => {
    if (nthUserMessage == null) {
      toast.error('Unable to edit this message.');
      return;
    }
    const threadId = getThreadIdForConversation(conversationId);
    if (!threadId) {
      toast.error('Thread not found for this conversation.');
      return;
    }

    try {
      setIsActionPending(true);
      console.log('[UserMessage] edit from message', {
        conversationId,
        threadId,
        nthUserMessage,
        text: newMessage,
      });
      const forkedConversationId = await forkConversation(
        threadId,
        conversationId,
        nthUserMessage
      );
      if (forkedConversationId) {
        console.log('[UserMessage] edit forked conversation', {
          forkedConversationId,
        });
        onConversationForked?.(forkedConversationId);
        const items = buildInputItems(newMessage, messageAttachments);
        await Codex.sendUserMessage({
          conversationId: forkedConversationId,
          items,
          model: null,
          reasoningEffort: null,
          summary: null,
          sandbox: null,
          approvalPolicy: null,
        });
        console.log('[UserMessage] edit send complete', {
          forkedConversationId,
        });
      }
    } catch (error) {
      console.error('[UserMessage] edit failed', error);
      const description =
        error instanceof Error ? error.message : 'Please try again.';
      toast.error('Failed to edit message.', { description });
    } finally {
      setIsActionPending(false);
    }
  };

  const handleSelectVersion = (targetConversationId: string) => {
    void selectVersion(targetConversationId).then((resolved) => {
      if (resolved) {
        onConversationForked?.(resolved);
      }
    });
  };

  return (
    <UserMessage
      cell={cell}
      timestamp={timestamp}
      versions={versions}
      activeConversationId={activeConversationId}
      isVersionsLoading={versionsLoading}
      onSelectVersion={handleSelectVersion}
      onCopy={handleCopy}
      onRetry={handleRetry}
      onEdit={handleEdit}
      isActionPending={isActionPending}
    />
  );
}
