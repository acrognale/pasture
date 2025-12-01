import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
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
  const [activeCommentId, setActiveCommentId] = useState<string | null>(null);

  const commentsForCell = useMemo(
    () => commentsByCell.get(cell.id) ?? [],
    [cell.id, commentsByCell]
  );

  const isDraftOpen = draftTarget?.cellId === cell.id;

  const clearSelectionUi = useCallback(() => {
    setBubblePosition(null);
    setPendingTarget(null);
  }, []);

  const getAbsoluteOffset = useCallback(
    (root: HTMLElement, node: Node, offset: number) => {
      const preRange = document.createRange();
      preRange.setStart(root, 0);
      preRange.setEnd(node, offset);
      return preRange.toString().length;
    },
    []
  );

  const getTextNodeAtPosition = useCallback(
    (root: HTMLElement, targetOffset: number) => {
      const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
      let current: Node | null = walker.nextNode();
      let traversed = 0;

      while (current) {
        const textLength = current.textContent?.length ?? 0;
        const nextTotal = traversed + textLength;
        if (targetOffset <= nextTotal) {
          return { node: current, offset: targetOffset - traversed };
        }
        traversed = nextTotal;
        current = walker.nextNode();
      }

      return null;
    },
    []
  );

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
    const rawSelectedText = selection.toString();
    const trimmedSelection = rawSelectedText.trim();
    if (!trimmedSelection || trimmedSelection.length < 3) {
      clearSelectionUi();
      return;
    }
    const range = selection.getRangeAt(0);
    const rect = range.getBoundingClientRect();
    const containerRect = messageRef.current.getBoundingClientRect();
    const top = rect.top - containerRect.top - 8; // small offset above selection
    const left = rect.left - containerRect.left;

    const selectionStart = getAbsoluteOffset(
      messageRef.current,
      range.startContainer,
      range.startOffset
    );
    const selectionEnd = getAbsoluteOffset(
      messageRef.current,
      range.endContainer,
      range.endOffset
    );

    const leadingTrim =
      rawSelectedText.length - rawSelectedText.trimStart().length;
    const trailingTrim =
      rawSelectedText.length - trimmedSelection.length - leadingTrim;
    const absoluteStart = Math.max(selectionStart + leadingTrim, 0);
    const absoluteEnd = Math.max(selectionEnd - trailingTrim, absoluteStart);

    const target: DraftTarget = {
      conversationId,
      cellId: cell.id,
      selectionText: trimmedSelection,
      selectionPreview:
        trimmedSelection.length > 120
          ? `${trimmedSelection.slice(0, 119)}…`
          : trimmedSelection,
      selectionStartOffset: Number.isFinite(absoluteStart)
        ? absoluteStart
        : null,
      selectionEndOffset: Number.isFinite(absoluteEnd) ? absoluteEnd : null,
      selectionBlockIndex: null,
    };

    setPendingTarget(target);
    setBubblePosition({
      top: Math.max(top, 0),
      left: Math.max(left, 0),
    });
  }, [
    cell.id,
    cell.streaming,
    clearSelectionUi,
    conversationId,
    getAbsoluteOffset,
  ]);

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

  const handleSidebarHover = useCallback((commentId: string | null) => {
    setActiveCommentId(commentId);
  }, []);

  useEffect(() => {
    const root = messageRef.current;
    if (!root) return;

    root
      .querySelectorAll<HTMLElement>('.message-comment-highlight')
      .forEach((highlight) => {
        const isActive = highlight.dataset.commentId === activeCommentId;
        highlight.classList.toggle('ring-2', isActive);
        highlight.classList.toggle('ring-warning-foreground/70', isActive);
        highlight.classList.toggle('bg-warning-foreground/45', isActive);
        highlight.classList.toggle('shadow-sm', isActive);
      });
  }, [activeCommentId]);

  // Re-apply comment highlights whenever the message or comment set changes.
  useEffect(() => {
    const root = messageRef.current;
    if (!root) return undefined;

    const unwrapHighlights = () => {
      root
        .querySelectorAll<HTMLElement>('.message-comment-highlight')
        .forEach((highlight) => {
          const parent = highlight.parentNode;
          if (!parent) return;
          while (highlight.firstChild) {
            parent.insertBefore(highlight.firstChild, highlight);
          }
          parent.removeChild(highlight);
        });
    };

    unwrapHighlights();

    const totalLength = root.textContent?.length ?? 0;
    const newHighlights: HTMLElement[] = [];

    const commentsWithRanges = commentsForCell.filter(
      (comment) =>
        comment.selectionStartOffset != null &&
        comment.selectionEndOffset != null &&
        comment.selectionStartOffset < comment.selectionEndOffset &&
        comment.selectionEndOffset <= totalLength
    );

    for (const comment of commentsWithRanges) {
      const start = comment.selectionStartOffset ?? 0;
      const end = comment.selectionEndOffset ?? 0;

      const startLoc = getTextNodeAtPosition(root, start);
      const endLoc = getTextNodeAtPosition(root, end);
      if (!startLoc || !endLoc) continue;

      const range = document.createRange();
      range.setStart(startLoc.node, startLoc.offset);
      range.setEnd(endLoc.node, endLoc.offset);

      const wrapper = document.createElement('mark');
      wrapper.className =
        'message-comment-highlight bg-warning-foreground/25 text-foreground rounded-sm px-0.5 transition-all duration-200';
      wrapper.dataset.commentId = comment.id;
      wrapper.append(range.extractContents());
      range.insertNode(wrapper);

      const handleEnter = () => setActiveCommentId(comment.id);
      const handleLeave = () =>
        setActiveCommentId((current) =>
          current === comment.id ? null : current
        );

      wrapper.addEventListener('pointerenter', handleEnter);
      wrapper.addEventListener('pointerleave', handleLeave);

      newHighlights.push(wrapper);
    }

    return () => {
      newHighlights.forEach((highlight) => {
        highlight.replaceWith(...Array.from(highlight.childNodes));
      });
      unwrapHighlights();
    };
  }, [commentsForCell, getTextNodeAtPosition]);

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
              activeCommentId={activeCommentId}
              onCommentHover={handleSidebarHover}
            />
          </div>
        ) : null}
      </div>
    </Cell>
  );
}
