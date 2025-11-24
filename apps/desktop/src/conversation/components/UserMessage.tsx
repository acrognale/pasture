import {
  CopyIcon,
  PencilIcon,
  RotateCcwIcon,
  SaveIcon,
  XIcon,
} from 'lucide-react';
import { useState } from 'react';
import { toast } from 'sonner';
import { Codex } from '~/codex/client';
import { Button } from '~/components/ui/button';
import type { TranscriptUserMessageCell } from '~/conversation/transcript/types';
import { copyToClipboard } from '~/lib/utils';
import { useWorkspaceConversationStores } from '~/workspace';

import { useMessageVersions } from '../hooks/useMessageVersions';
import { MessageVersions } from './MessageVersions';

type UserMessageProps = {
  cell: TranscriptUserMessageCell;
  timestamp: string;
  conversationId: string;
  nthUserMessage?: number;
  onConversationForked?: (conversationId: string) => void;
};

export function UserMessage({
  cell,
  conversationId,
  nthUserMessage,
  onConversationForked,
}: UserMessageProps) {
  const message = cell.message ?? '';
  const hasImages = (cell.images?.length ?? 0) > 0;
  const hasMessageKind = !!cell.messageKind && cell.messageKind !== 'plain';
  const [isEditing, setIsEditing] = useState(false);
  const [draft, setDraft] = useState(message);
  const [isSaving, setIsSaving] = useState(false);
  const { forkThread, getThreadIdForConversation, loadConversation } =
    useWorkspaceConversationStores();
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
      setIsSaving(true);
      console.log('[UserMessage] retry from message', {
        conversationId,
        threadId,
        nthUserMessage,
        text: message,
      });
      const forkedConversationId = await forkThread(
        threadId,
        conversationId,
        nthUserMessage
      );
      if (forkedConversationId) {
        console.log('[UserMessage] retry forked conversation', {
          forkedConversationId,
        });
        await loadConversation(forkedConversationId, { force: true });
        onConversationForked?.(forkedConversationId);
        await Codex.sendUserMessage({
          conversationId: forkedConversationId,
          items: [{ type: 'text', data: { text: message } }],
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
      setIsSaving(false);
    }
  };

  const handleSaveEdit = async () => {
    if (nthUserMessage == null) {
      toast.error('Unable to edit this message.');
      return;
    }
    const threadId = getThreadIdForConversation(conversationId);
    if (!threadId) {
      toast.error('Thread not found for this conversation.');
      return;
    }
    const trimmed = draft.trim();
    if (!trimmed) {
      toast.error('Message cannot be empty.');
      return;
    }

    try {
      setIsSaving(true);
      console.log('[UserMessage] edit from message', {
        conversationId,
        threadId,
        nthUserMessage,
        text: trimmed,
      });
      const forkedConversationId = await forkThread(
        threadId,
        conversationId,
        nthUserMessage
      );
      if (forkedConversationId) {
        console.log('[UserMessage] edit forked conversation', {
          forkedConversationId,
        });
        await loadConversation(forkedConversationId, { force: true });
        onConversationForked?.(forkedConversationId);
        await Codex.sendUserMessage({
          conversationId: forkedConversationId,
          items: [{ type: 'text', data: { text: trimmed } }],
          model: null,
          reasoningEffort: null,
          summary: null,
          sandbox: null,
          approvalPolicy: null,
        });
        setIsEditing(false);
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
      setIsSaving(false);
    }
  };

  return (
    <div className="w-full px-1.5 py-2 flex justify-end group">
      <div className="flex flex-col items-end gap-1 max-w-[80%]">
        <div className="bg-muted/60 rounded-lg px-3 py-2 w-full space-y-2">
          <div className="flex flex-1 space-y-1">
            <div className="w-full space-y-1">
              {isEditing ? (
                <textarea
                  className="w-full resize-none rounded-md border border-border bg-background px-2 py-1 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-accent"
                  value={draft}
                  onChange={(event) => setDraft(event.target.value)}
                  rows={Math.max(2, Math.min(8, draft.split('\n').length))}
                  disabled={isSaving}
                />
              ) : (
                <div className="whitespace-pre-wrap leading-transcript font-transcript text-transcript-base text-foreground">
                  {message}
                </div>
              )}
              {hasMessageKind ? (
                <div className="text-muted-foreground text-xs">
                  /{cell.messageKind}
                </div>
              ) : null}
              {hasImages ? (
                <div className="text-muted-foreground text-xs">
                  {cell.images?.length ?? 0} image(s) attached
                </div>
              ) : null}
            </div>
          </div>
        </div>
        <div className="flex w-full items-center justify-end gap-1.5 opacity-0 group-hover:opacity-100 group-focus-within:opacity-100 transition-opacity pr-1">
          {message ? (
            <Button
              variant="ghost"
              size="icon"
              onClick={() => {
                void handleCopy();
              }}
              className="h-8 w-8 shrink-0"
              title="Copy as markdown"
            >
              <CopyIcon className="size-3" />
            </Button>
          ) : null}
          <Button
            variant="ghost"
            size="icon"
            onClick={() => {
              void handleRetry();
            }}
            className="h-8 w-8 shrink-0"
            disabled={isSaving}
            title="Retry from here"
          >
            <RotateCcwIcon className="size-3" />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            onClick={() => setIsEditing((prev) => !prev)}
            className="h-8 w-8 shrink-0"
            disabled={isSaving}
            title={isEditing ? 'Cancel edit' : 'Edit message'}
          >
            {isEditing ? (
              <XIcon className="size-3" />
            ) : (
              <PencilIcon className="size-3" />
            )}
          </Button>
          {isEditing ? (
            <Button
              variant="ghost"
              size="icon"
              onClick={() => {
                void handleSaveEdit();
              }}
              className="h-8 w-8 shrink-0"
              disabled={isSaving}
              title="Save and retry from here"
            >
              <SaveIcon className="size-3" />
            </Button>
          ) : null}
          <MessageVersions
            versions={versions}
            activeConversationId={activeConversationId}
            onSelectVersion={(targetConversationId) => {
              void selectVersion(targetConversationId).then((resolved) => {
                if (resolved) {
                  onConversationForked?.(resolved);
                }
              });
            }}
            isLoading={versionsLoading}
          />
        </div>
      </div>
    </div>
  );
}
