import { useLexicalComposerContext } from '@lexical/react/LexicalComposerContext';
import { LexicalTypeaheadMenuPlugin } from '@lexical/react/LexicalTypeaheadMenuPlugin';
import {
  MenuOption,
  type MenuTextMatch,
  type TypeaheadMenuPluginProps,
} from '@lexical/react/LexicalTypeaheadMenuPlugin';
import {
  $createTextNode,
  $getRoot,
  $getSelection,
  $isRangeSelection,
} from 'lexical';
import type { TextNode } from 'lexical';
import { useCallback, useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { Codex } from '~/codex/client';
import { cn } from '~/lib/utils';

import { $createFileMentionNode } from '../components/FileMentionNode';
import {
  FILE_MENTION_TRIGGER,
  SLASH_TRIGGER,
  buildFileLabel,
} from '../mentions';

class FileMentionOption extends MenuOption {
  path: string;
  label: string;
  score: number;

  constructor(path: string, score: number) {
    super(path);
    this.path = path;
    this.label = buildFileLabel(path);
    this.score = score;
  }
}

type Props = {
  workspacePath: string;
  disabled?: boolean;
  ariaBusy?: boolean;
  currentValue: () => string;
  onChange: (value: string) => void;
};

export const FileMentionTypeaheadPlugin = ({
  workspacePath,
  disabled,
  ariaBusy,
  currentValue,
  onChange,
}: Props) => {
  const [editor] = useLexicalComposerContext();
  const [fileMentionQuery, setFileMentionQuery] = useState<string | null>(null);
  const [fileMentionOptions, setFileMentionOptions] = useState<
    FileMentionOption[]
  >([]);
  const fileMenuEnabled =
    !disabled && !ariaBusy && Boolean(workspacePath?.trim().length);

  const checkForFileMentionTrigger = useCallback<
    NonNullable<TypeaheadMenuPluginProps<MenuOption>['triggerFn']>
  >(
    (text: string): MenuTextMatch | null => {
      if (!fileMenuEnabled) {
        return null;
      }

      if (SLASH_TRIGGER.exec(text)) {
        return null;
      }

      const match = FILE_MENTION_TRIGGER.exec(text);
      if (!match) {
        return null;
      }

      return {
        leadOffset: match.index + match[1].length,
        matchingString: match[2],
        replaceableString: match[0].slice(match[1].length),
      };
    },
    [fileMenuEnabled]
  );

  useEffect(() => {
    if (!fileMenuEnabled || fileMentionQuery === null) {
      return;
    }

    const trimmedQuery = fileMentionQuery.trim();
    if (!trimmedQuery || !workspacePath) {
      return;
    }

    const activeQuery = trimmedQuery;

    let isCancelled = false;

    Codex.searchWorkspaceFiles({
      workspacePath,
      query: trimmedQuery,
      limit: 6,
    })
      .then((results) => {
        if (isCancelled) {
          return;
        }
        if (activeQuery !== (fileMentionQuery?.trim() ?? '')) {
          return;
        }
        setFileMentionOptions(
          results.map((hit) => new FileMentionOption(hit.path, hit.score ?? 0))
        );
      })
      .catch((error) => {
        if (isCancelled) {
          return;
        }
        console.error(
          '[ComposerEditor] Failed to search workspace files',
          error
        );
        setFileMentionOptions([]);
      });

    return () => {
      isCancelled = true;
    };
  }, [fileMentionQuery, fileMenuEnabled, workspacePath]);

  const handleFileMentionSelect = useCallback<
    TypeaheadMenuPluginProps<FileMentionOption>['onSelectOption']
  >(
    (option: FileMentionOption, node: TextNode | null, closeMenu) => {
      if (!editor) {
        onChange(currentValue());
        closeMenu();
        setFileMentionQuery(null);
        return;
      }

      editor.update(() => {
        const selection = $getSelection();
        const mentionNode = $createFileMentionNode({
          path: option.path,
          label: option.label,
        });

        if (node) {
          node.replace(mentionNode);
        } else if ($isRangeSelection(selection)) {
          selection.insertNodes([mentionNode]);
        } else {
          $getRoot().append(mentionNode);
        }

        const trailingSpace = $createTextNode(' ');
        mentionNode.insertAfter(trailingSpace);
        trailingSpace.select();
      });

      editor.getEditorState().read(() => {
        const text = $getRoot().getTextContent();
        onChange(text);
      });

      closeMenu();
      setFileMentionQuery(null);
    },
    [currentValue, editor, onChange]
  );

  const fileMentionMenuRender: TypeaheadMenuPluginProps<FileMentionOption>['menuRenderFn'] =
    useCallback(
      (
        anchorElementRef,
        { selectedIndex, selectOptionAndCleanUp, setHighlightedIndex, options }
      ) => {
        if (!anchorElementRef.current || options.length === 0) {
          return null;
        }

        return createPortal(
          <div className="absolute left-0 bottom-full mb-4 -translate-y-1 transform min-w-[260px] max-w-[360px] w-max rounded-md border border-border bg-popover shadow-sm pointer-events-auto">
            {options.map((option, index) => (
              <button
                type="button"
                key={option.key}
                ref={(element) => option.setRefElement(element)}
                role="option"
                aria-selected={selectedIndex === index}
                className={cn(
                  'flex w-full items-center gap-2 px-3 py-1.5 text-left text-transcript-micro leading-transcript text-foreground transition-colors whitespace-nowrap',
                  selectedIndex === index
                    ? 'bg-accent text-accent-foreground'
                    : 'hover:bg-muted'
                )}
                onMouseEnter={() => setHighlightedIndex(index)}
                onClick={() => selectOptionAndCleanUp(option)}
              >
                <span className="font-semibold leading-none truncate">
                  {option.path}
                </span>
              </button>
            ))}
          </div>,
          anchorElementRef.current
        );
      },
      []
    );

  const activeFileMentionOptions =
    fileMenuEnabled && fileMentionQuery ? fileMentionOptions.slice(0, 6) : [];

  if (!fileMenuEnabled) {
    return null;
  }

  return (
    <LexicalTypeaheadMenuPlugin
      triggerFn={checkForFileMentionTrigger}
      onQueryChange={setFileMentionQuery}
      onSelectOption={handleFileMentionSelect}
      menuRenderFn={fileMentionMenuRender}
      options={activeFileMentionOptions}
      anchorClassName="z-50"
      preselectFirstItem
    />
  );
};
