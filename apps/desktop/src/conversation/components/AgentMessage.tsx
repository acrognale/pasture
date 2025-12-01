import { useCallback, useMemo, useRef, useState } from 'react';
import { useMessageComments } from '~/conversation/comments/MessageCommentContext';
import { useMessageCommentDraft } from '~/conversation/comments/MessageCommentDraftContext';
import type { DraftTarget } from '~/conversation/comments/types';
import { useStreamingText } from '~/conversation/hooks/useStreamingText';
import type { TranscriptAgentMessageCell } from '~/conversation/transcript/types';

import { Cell } from './Cell';
import { CopyButton } from './CopyButton';
import { Markdown } from './Markdown';
import { MessageCommentThread } from './MessageCommentThread';

type AgentMessageProps = {
  cell: TranscriptAgentMessageCell;
  timestamp: string;
  conversationId: string;
};

export function AgentMessage({ cell, conversationId }: AgentMessageProps) {
  const message = cell.message ?? '';
  const animatedMessage = useStreamingText(message, {
    enabled: cell.streaming,
  });
  const { commentsByCell, removeComment } = useMessageComments();
  const {
    draftTarget,
    draftCommentText,
    setDraftCommentText,
    startDraft,
    cancelDraft,
    submitDraft,
  } = useMessageCommentDraft();

  const messageRef = useRef<HTMLDivElement | null>(null);
  const [bubblePosition, setBubblePosition] = useState<{
    top: number;
    left: number;
  } | null>(null);
  const [pendingTarget, setPendingTarget] = useState<DraftTarget | null>(null);

  const commentsForCell = useMemo(
    () => commentsByCell.get(cell.id) ?? [],
    [cell.id, commentsByCell]
  );

  const isDraftOpen = draftTarget?.cellId === cell.id;

  const clearSelectionUi = useCallback(() => {
    setBubblePosition(null);
    setPendingTarget(null);
  }, []);

  const handleSelection = useCallback(() => {
    if (cell.streaming) {
      clearSelectionUi();
      return;
    }
    const selection = window.getSelection();
    if (!selection || selection.isCollapsed) {
      clearSelectionUi();
      return;
    }
    if (!messageRef.current) {
      clearSelectionUi();
      return;
    }
    const anchorNode = selection.anchorNode;
    const focusNode = selection.focusNode;
    if (
      !anchorNode ||
      !focusNode ||
      !messageRef.current.contains(anchorNode) ||
      !messageRef.current.contains(focusNode)
    ) {
      clearSelectionUi();
      return;
    }
    const selectedText = selection.toString().trim();
    if (!selectedText || selectedText.length < 3) {
      clearSelectionUi();
      return;
    }
    const range = selection.getRangeAt(0);
    const rect = range.getBoundingClientRect();
    const containerRect = messageRef.current.getBoundingClientRect();
    const top = rect.top - containerRect.top - 8; // small offset above selection
    const left = rect.left - containerRect.left;

    const target: DraftTarget = {
      conversationId,
      cellId: cell.id,
      selectionText: selectedText,
      selectionPreview:
        selectedText.length > 120
          ? `${selectedText.slice(0, 119)}…`
          : selectedText,
      selectionStartOffset: null,
      selectionEndOffset: null,
      selectionBlockIndex: null,
    };

    setPendingTarget(target);
    setBubblePosition({
      top: Math.max(top, 0),
      left: Math.max(left, 0),
    });
  }, [cell.id, cell.streaming, clearSelectionUi, conversationId]);

  const handleAddComment = () => {
    if (!pendingTarget) {
      return;
    }
    startDraft(pendingTarget);
    setBubblePosition(null);
    setPendingTarget(null);
    const selection = window.getSelection();
    selection?.removeAllRanges();
  };

  return (
    <Cell className="group">
      <div className="flex items-start gap-4 relative">
        <div
          ref={messageRef}
          className="flex-1 min-w-0 select-text"
          onMouseUp={handleSelection}
          onKeyUp={(event) => {
            if (event.key === 'Shift') {
              return;
            }
            handleSelection();
          }}
        >
          {message ? (
            <Markdown streaming={cell.streaming}>{animatedMessage}</Markdown>
          ) : (
            <div className="text-muted-foreground"> </div>
          )}
          {message && (
            <div className="flex justify-end mt-0.5">
              <CopyButton
                content={message}
                label="Copy as markdown"
                showToast={true}
                className="opacity-100 select-auto"
              />
            </div>
          )}
          {bubblePosition && pendingTarget && !isDraftOpen ? (
            <button
              type="button"
              className="absolute z-10 rounded-md border border-border/60 bg-background px-2 py-1 text-xs shadow-md"
              style={{ top: bubblePosition.top, left: bubblePosition.left }}
              onClick={handleAddComment}
            >
              Add comment
            </button>
          ) : null}
        </div>

        {commentsForCell.length > 0 || isDraftOpen ? (
          <div className="w-[240px] shrink-0">
            <MessageCommentThread
              comments={commentsForCell}
              isDraftOpen={isDraftOpen}
              draftText={draftCommentText}
              onCancelDraft={() => {
                cancelDraft();
              }}
              onSubmitDraft={submitDraft}
              setDraftText={setDraftCommentText}
              onDeleteComment={removeComment}
            />
          </div>
        ) : null}
      </div>
    </Cell>
  );
}
