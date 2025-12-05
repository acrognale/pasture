import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Cell,
  CopyButton,
  Markdown,
  type TranscriptAgentMessageCell,
} from '@pasture/transcript-ui';

import { useMessageComments } from '~/conversation/comments/MessageCommentContext';
import { useMessageCommentDraft } from '~/conversation/comments/MessageCommentDraftContext';
import type { DraftTarget } from '~/conversation/comments/types';

import { MessageCommentThread } from './MessageCommentThread';

type AgentMessageProps = {
  cell: TranscriptAgentMessageCell;
  conversationId: string;
};

export function AgentMessage({ cell, conversationId }: AgentMessageProps) {
  const message = cell.message ?? '';
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

  /**
   * Wraps text nodes within a range, handling selections that span elements.
   * We wrap each text node segment individually to keep HTML valid.
   */
  const wrapTextNodesInRange = useCallback(
    (
      root: HTMLElement,
      startOffset: number,
      endOffset: number,
      createWrapper: (
        position: 'single' | 'first' | 'middle' | 'last'
      ) => HTMLElement
    ): HTMLElement[] => {
      const wrappers: HTMLElement[] = [];
      const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
      let current: Node | null = walker.nextNode();
      let traversed = 0;

      const nodesToWrap: Array<{
        node: Text;
        wrapStart: number;
        wrapEnd: number;
      }> = [];

      while (current) {
        const textNode = current as Text;
        const textLength = textNode.textContent?.length ?? 0;
        const nodeStart = traversed;
        const nodeEnd = traversed + textLength;

        if (nodeEnd > startOffset && nodeStart < endOffset) {
          const wrapStart = Math.max(0, startOffset - nodeStart);
          const wrapEnd = Math.min(textLength, endOffset - nodeStart);
          if (wrapEnd > wrapStart) {
            nodesToWrap.push({ node: textNode, wrapStart, wrapEnd });
          }
        }

        traversed = nodeEnd;
        if (traversed >= endOffset) break;
        current = walker.nextNode();
      }

      const count = nodesToWrap.length;

      for (let i = nodesToWrap.length - 1; i >= 0; i -= 1) {
        const { node, wrapStart, wrapEnd } = nodesToWrap[i];

        const originalIndex = count - 1 - i;
        let position: 'single' | 'first' | 'middle' | 'last';
        if (count === 1) {
          position = 'single';
        } else if (originalIndex === 0) {
          position = 'first';
        } else if (originalIndex === count - 1) {
          position = 'last';
        } else {
          position = 'middle';
        }

        const wrapper = createWrapper(position);

        if (wrapStart > 0 || wrapEnd < (node.textContent?.length ?? 0)) {
          const range = document.createRange();
          range.setStart(node, wrapStart);
          range.setEnd(node, wrapEnd);
          range.surroundContents(wrapper);
        } else {
          const parent = node.parentNode;
          if (parent) {
            parent.insertBefore(wrapper, node);
            wrapper.appendChild(node);
          }
        }

        wrappers.unshift(wrapper);
      }

      return wrappers;
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

    const range = selection.getRangeAt(0);
    const containerRect = messageRef.current.getBoundingClientRect();
    const clientRects = range.getClientRects();
    const lastRect =
      clientRects.length > 0
        ? clientRects[clientRects.length - 1]
        : range.getBoundingClientRect();

    const top = lastRect.bottom - containerRect.top + 4;
    const buttonWidth = 100;
    const maxLeft = containerRect.width - buttonWidth;
    const left = Math.min(lastRect.right - containerRect.left, maxLeft);

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

    const rootText = messageRef.current.textContent ?? '';
    const clamp = (value: number) =>
      Math.max(0, Math.min(value, rootText.length));

    let absoluteStart = clamp(selectionStart);
    let absoluteEnd = clamp(selectionEnd);

    while (
      absoluteStart < absoluteEnd &&
      /\s/.test(rootText.charAt(absoluteStart))
    ) {
      absoluteStart += 1;
    }

    while (
      absoluteEnd > absoluteStart &&
      /\s/.test(rootText.charAt(absoluteEnd - 1))
    ) {
      absoluteEnd -= 1;
    }

    const selectionText = rootText.slice(absoluteStart, absoluteEnd);
    if (!selectionText || selectionText.length < 3) {
      clearSelectionUi();
      return;
    }

    const selectionPreview =
      selectionText.length > 120
        ? `${selectionText.slice(0, 119)}…`
        : selectionText;

    const target: DraftTarget = {
      conversationId,
      cellId: cell.id,
      selectionText,
      selectionPreview,
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

      const wrappers = wrapTextNodesInRange(root, start, end, (position) => {
        const wrapper = document.createElement('mark');
        const baseClasses =
          'message-comment-highlight bg-warning-foreground/25 text-foreground transition-all duration-200 box-decoration-clone';
        let roundingClasses = '';
        if (position === 'single') {
          roundingClasses = 'rounded-sm px-0.5';
        } else if (position === 'first') {
          roundingClasses = 'rounded-l-sm pl-0.5';
        } else if (position === 'last') {
          roundingClasses = 'rounded-r-sm pr-0.5';
        }
        wrapper.className = `${baseClasses} ${roundingClasses}`.trim();
        wrapper.dataset.commentId = comment.id;
        return wrapper;
      });

      for (const wrapper of wrappers) {
        const handleEnter = () => setActiveCommentId(comment.id);
        const handleLeave = () =>
          setActiveCommentId((current) =>
            current === comment.id ? null : current
          );

        wrapper.addEventListener('pointerenter', handleEnter);
        wrapper.addEventListener('pointerleave', handleLeave);

        newHighlights.push(wrapper);
      }
    }

    return () => {
      newHighlights.forEach((highlight) => {
        highlight.replaceWith(...Array.from(highlight.childNodes));
      });
      unwrapHighlights();
    };
  }, [commentsForCell, wrapTextNodesInRange]);

  // Highlight the draft selection while the composer is open
  useEffect(() => {
    const root = messageRef.current;
    if (!root || !isDraftOpen || !draftTarget) return undefined;

    const start = draftTarget.selectionStartOffset;
    const end = draftTarget.selectionEndOffset;
    const totalLength = root.textContent?.length ?? 0;

    if (start == null || end == null || start >= end || end > totalLength) {
      return undefined;
    }

    const wrappers = wrapTextNodesInRange(root, start, end, (position) => {
      const wrapper = document.createElement('mark');
      const baseClasses =
        'message-draft-highlight bg-muted-foreground/30 text-foreground ring-1 ring-muted-foreground/50 animate-pulse box-decoration-clone';
      let roundingClasses = '';
      if (position === 'single') {
        roundingClasses = 'rounded-sm px-0.5';
      } else if (position === 'first') {
        roundingClasses = 'rounded-l-sm pl-0.5';
      } else if (position === 'last') {
        roundingClasses = 'rounded-r-sm pr-0.5';
      }
      wrapper.className = `${baseClasses} ${roundingClasses}`.trim();
      return wrapper;
    });

    return () => {
      for (const wrapper of wrappers) {
        const parent = wrapper.parentNode;
        if (parent) {
          while (wrapper.firstChild) {
            parent.insertBefore(wrapper.firstChild, wrapper);
          }
          parent.removeChild(wrapper);
        }
      }
    };
  }, [isDraftOpen, draftTarget, wrapTextNodesInRange]);

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
            <Markdown streaming={cell.streaming}>{message}</Markdown>
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
