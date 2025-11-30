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
import type { WorkspaceSymbolHit } from '~/codex.gen';
import { Codex } from '~/codex/client';
import { cn } from '~/lib/utils';

import {
  $createSymbolMentionNode,
  formatSymbolLocation,
} from '../components/SymbolMentionNode';
import { SLASH_TRIGGER, SYMBOL_MENTION_TRIGGER } from '../mentions';

class SymbolMentionOption extends MenuOption {
  hit: WorkspaceSymbolHit;

  constructor(hit: WorkspaceSymbolHit) {
    super(`${hit.name}-${hit.filePath}-${hit.line}`);
    this.hit = hit;
  }

  get location(): string {
    return formatSymbolLocation(this.hit.filePath, this.hit.line);
  }
}

type Props = {
  workspacePath: string;
  disabled?: boolean;
  ariaBusy?: boolean;
  currentValue: () => string;
  onChange: (value: string) => void;
};

export const SymbolMentionTypeaheadPlugin = ({
  workspacePath,
  disabled,
  ariaBusy,
  currentValue,
  onChange,
}: Props) => {
  const [editor] = useLexicalComposerContext();
  const [symbolMentionQuery, setSymbolMentionQuery] = useState<string | null>(
    null
  );
  const [symbolMentionOptions, setSymbolMentionOptions] = useState<
    SymbolMentionOption[]
  >([]);
  const symbolMenuEnabled =
    !disabled && !ariaBusy && Boolean(workspacePath?.trim().length);

  const checkForSymbolMentionTrigger = useCallback<
    NonNullable<TypeaheadMenuPluginProps<MenuOption>['triggerFn']>
  >(
    (text: string): MenuTextMatch | null => {
      if (!symbolMenuEnabled) {
        return null;
      }

      if (SLASH_TRIGGER.exec(text)) {
        return null;
      }

      const match = SYMBOL_MENTION_TRIGGER.exec(text);
      if (!match) {
        return null;
      }

      return {
        leadOffset: match.index + match[1].length,
        matchingString: match[2],
        replaceableString: match[0].slice(match[1].length),
      };
    },
    [symbolMenuEnabled]
  );

  useEffect(() => {
    if (!symbolMenuEnabled || symbolMentionQuery === null) {
      return;
    }

    const trimmedQuery = symbolMentionQuery.trim();
    if (!trimmedQuery || !workspacePath) {
      return;
    }

    const activeQuery = trimmedQuery;
    let isCancelled = false;

    Codex.searchWorkspaceSymbols({
      workspacePath,
      query: trimmedQuery,
      limit: 6,
    })
      .then((results) => {
        if (isCancelled) {
          return;
        }
        if (activeQuery !== (symbolMentionQuery?.trim() ?? '')) {
          return;
        }
        setSymbolMentionOptions(
          results.map((hit) => new SymbolMentionOption(hit))
        );
      })
      .catch((error) => {
        if (isCancelled) {
          return;
        }
        console.error(
          '[ComposerEditor] Failed to search workspace symbols',
          error
        );
        setSymbolMentionOptions([]);
      });

    return () => {
      isCancelled = true;
    };
  }, [symbolMentionQuery, symbolMenuEnabled, workspacePath]);

  const handleSymbolMentionSelect = useCallback<
    TypeaheadMenuPluginProps<SymbolMentionOption>['onSelectOption']
  >(
    (option: SymbolMentionOption, node: TextNode | null, closeMenu) => {
      if (!editor) {
        onChange(currentValue());
        closeMenu();
        setSymbolMentionQuery(null);
        return;
      }

      const payload = {
        name: option.hit.name,
        filePath: option.hit.filePath,
        line: option.hit.line,
        kind: option.hit.kind,
      };

      editor.update(() => {
        const selection = $getSelection();
        const mentionNode = $createSymbolMentionNode(payload);
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
      setSymbolMentionQuery(null);
    },
    [currentValue, editor, onChange]
  );

  const symbolMentionMenuRender: TypeaheadMenuPluginProps<SymbolMentionOption>['menuRenderFn'] =
    useCallback(
      (
        anchorElementRef,
        { selectedIndex, selectOptionAndCleanUp, setHighlightedIndex, options }
      ) => {
        if (!anchorElementRef.current || options.length === 0) {
          return null;
        }

        return createPortal(
          <div className="absolute left-0 bottom-full mb-4 -translate-y-1 transform min-w-[320px] max-w-[640px] w-full rounded-md border border-border bg-popover shadow-sm pointer-events-auto overflow-hidden">
            {options.map((option, index) => (
              <button
                type="button"
                key={option.key}
                ref={(element) => option.setRefElement(element)}
                role="option"
                aria-selected={selectedIndex === index}
                className={cn(
                  'flex w-full flex-col items-start gap-0.5 px-3 py-1.5 text-left text-transcript-micro leading-transcript text-foreground transition-colors whitespace-normal overflow-hidden',
                  selectedIndex === index
                    ? 'bg-accent text-accent-foreground'
                    : 'hover:bg-muted'
                )}
                onMouseEnter={() => setHighlightedIndex(index)}
                onClick={() => selectOptionAndCleanUp(option)}
              >
                <span>
                  <span className="font-semibold leading-none w-full">
                    {option.hit.name}
                  </span>
                  {option.hit.kind ? ` · ${option.hit.kind}` : ''}
                </span>
                <span
                  className="text-muted-foreground leading-none w-full text-right text-ellipsis truncate"
                  style={{ direction: 'rtl' }}
                >
                  {option.location}
                </span>
              </button>
            ))}
          </div>,
          anchorElementRef.current
        );
      },
      []
    );

  const activeSymbolMentionOptions =
    symbolMenuEnabled && symbolMentionQuery
      ? symbolMentionOptions.slice(0, 6)
      : [];

  if (!symbolMenuEnabled) {
    return null;
  }

  return (
    <LexicalTypeaheadMenuPlugin
      triggerFn={checkForSymbolMentionTrigger}
      onQueryChange={setSymbolMentionQuery}
      onSelectOption={handleSymbolMentionSelect}
      menuRenderFn={symbolMentionMenuRender}
      options={activeSymbolMentionOptions}
      anchorClassName="z-50"
      preselectFirstItem
    />
  );
};
