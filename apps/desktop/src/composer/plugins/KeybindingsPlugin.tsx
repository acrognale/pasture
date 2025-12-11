import { useLexicalComposerContext } from '@lexical/react/LexicalComposerContext';
import {
  $getSelection,
  $isElementNode,
  $isRangeSelection,
  COMMAND_PRIORITY_HIGH,
  KEY_DOWN_COMMAND,
} from 'lexical';
import { useEffect } from 'react';

import type { MentionNode } from '../components/MentionNode';
import { isMentionNode } from '../mentions';

type Props = {
  onEscape?: () => boolean;
  onSubmit: () => void;
};

export const KeybindingsPlugin = ({ onEscape, onSubmit }: Props) => {
  const [editor] = useLexicalComposerContext();
  useEffect(
    () =>
      editor.registerCommand(
        KEY_DOWN_COMMAND,
        (event: KeyboardEvent) => {
          if (event.key === 'Backspace') {
            let deleted = false;
            editor.update(() => {
              const selection = $getSelection();
              if (!$isRangeSelection(selection) || !selection.isCollapsed()) {
                return;
              }
              const anchorNode = selection.anchor.getNode();
              const anchorOffset = selection.anchor.offset;

              const findTarget = (): MentionNode | null => {
                if (isMentionNode(anchorNode)) {
                  return anchorNode;
                }
                if ($isElementNode(anchorNode) && anchorOffset > 0) {
                  const previousChild = anchorNode.getChildAtIndex(
                    anchorOffset - 1
                  );
                  if (previousChild && isMentionNode(previousChild)) {
                    return previousChild;
                  }
                }
                if (anchorOffset > 0) {
                  return null;
                }
                const previousSibling = anchorNode.getPreviousSibling();
                if (previousSibling && isMentionNode(previousSibling)) {
                  return previousSibling;
                }
                const parent = anchorNode.getParent();
                if (
                  parent &&
                  parent.getFirstChild() === anchorNode &&
                  parent.getPreviousSibling() &&
                  isMentionNode(parent.getPreviousSibling())
                ) {
                  return parent.getPreviousSibling() as MentionNode;
                }
                return null;
              };

              const target = findTarget();
              if (target) {
                target.remove();
                deleted = true;
              }
            });
            if (deleted) {
              event.preventDefault();
              return true;
            }
          }

          if (event.key === 'Escape') {
            const handled = onEscape?.() ?? false;
            if (!handled) {
              return false;
            }
            event.preventDefault();
            event.stopPropagation();
            return true;
          }

          if (event.key === 'Enter' && event.metaKey) {
            event.preventDefault();
            event.stopPropagation();
            onSubmit();
            return true;
          }

          return false;
        },
        COMMAND_PRIORITY_HIGH
      ),
    [editor, onEscape, onSubmit]
  );
  return null;
};
