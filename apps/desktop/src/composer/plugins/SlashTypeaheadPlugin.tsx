import { useLexicalComposerContext } from '@lexical/react/LexicalComposerContext';
import { LexicalTypeaheadMenuPlugin } from '@lexical/react/LexicalTypeaheadMenuPlugin';
import {
  MenuOption,
  type MenuTextMatch,
  type TypeaheadMenuPluginProps,
} from '@lexical/react/LexicalTypeaheadMenuPlugin';
import { $getRoot } from 'lexical';
import type { TextNode } from 'lexical';
import { useCallback, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { useSlashCommands } from '~/composer/hooks/useSlashCommands';
import type { SlashCommandDefinition } from '~/composer/slash-commands';
import { cn } from '~/lib/utils';

import { SLASH_TRIGGER, updateRootText } from '../mentions';

class SlashCommandOption extends MenuOption {
  command: SlashCommandDefinition;
  label: string;
  description: string;

  constructor(command: SlashCommandDefinition) {
    super(command.id);
    this.command = command;
    this.label = command.label;
    this.description = command.description;
  }
}

type Props = {
  workspacePath: string;
  conversationId: string | null;
  isTurnActive: boolean;
  disabled?: boolean;
  ariaBusy?: boolean;
  currentValue: () => string;
  onChange: (value: string) => void;
};

export const SlashTypeaheadPlugin = ({
  workspacePath,
  conversationId,
  isTurnActive,
  disabled,
  ariaBusy,
  currentValue,
  onChange,
}: Props) => {
  const [editor] = useLexicalComposerContext();
  const slashCommands = useSlashCommands(workspacePath);
  const [slashQuery, setSlashQuery] = useState<string | null>(null);
  const slashMenuEnabled = !disabled && !ariaBusy && Boolean(conversationId);

  const checkForSlashTrigger = useCallback<
    NonNullable<TypeaheadMenuPluginProps<MenuOption>['triggerFn']>
  >(
    (text: string): MenuTextMatch | null => {
      if (!slashMenuEnabled) {
        return null;
      }

      const match = SLASH_TRIGGER.exec(text);
      if (!match) {
        return null;
      }

      return {
        leadOffset: match.index + match[1].length,
        matchingString: match[2],
        replaceableString: match[0].slice(match[1].length),
      };
    },
    [slashMenuEnabled]
  );

  const slashOptions = useMemo(() => {
    if (!slashMenuEnabled || slashQuery === null) {
      return [];
    }

    const normalizedQuery = slashQuery.toLowerCase();

    return slashCommands.definitions
      .filter((definition) => {
        if (!normalizedQuery) {
          return true;
        }
        return (
          definition.id.toLowerCase().startsWith(normalizedQuery) ||
          definition.label.toLowerCase().includes(normalizedQuery)
        );
      })
      .map((definition) => new SlashCommandOption(definition));
  }, [slashCommands.definitions, slashMenuEnabled, slashQuery]);

  const handleSlashSelect = useCallback<
    TypeaheadMenuPluginProps<SlashCommandOption>['onSelectOption']
  >(
    (option: SlashCommandOption, _node: TextNode | null, closeMenu) => {
      const command = option.command;
      if (isTurnActive && !command.availableDuringTurn) {
        slashCommands.notifyUnavailable(command);
        return;
      }

      const current = currentValue() ?? '';
      const next = current.replace(
        /(^|[\s\n])\/[a-z0-9-]*$/i,
        (_match, prefix: string) => `${prefix}/${command.id} `
      );

      const draft = next === current ? `${current}/${command.id} ` : next;

      onChange(draft);
      updateRootText(editor, draft);
      editor.update(() => {
        $getRoot().selectEnd();
        editor.getRootElement()?.focus();
      });
      closeMenu();
    },
    [currentValue, editor, isTurnActive, onChange, slashCommands]
  );

  const slashMenuRender: TypeaheadMenuPluginProps<SlashCommandOption>['menuRenderFn'] =
    useCallback(
      (
        anchorElementRef,
        { selectedIndex, selectOptionAndCleanUp, setHighlightedIndex, options }
      ) => {
        if (!anchorElementRef.current || options.length === 0) {
          return null;
        }

        return createPortal(
          <div className="absolute left-0 bottom-full mb-4 -translate-y-1 transform min-w-[260px] max-w-[320px] w-max rounded-md border border-border bg-popover shadow-sm pointer-events-auto">
            {options.map((option, index) => (
              <button
                type="button"
                key={option.key}
                ref={(element) => option.setRefElement(element)}
                role="option"
                aria-selected={selectedIndex === index}
                className={cn(
                  'flex w-full flex-col items-start gap-1 px-3 py-2 text-left text-sm text-foreground transition-colors',
                  selectedIndex === index
                    ? 'bg-accent text-accent-foreground'
                    : 'hover:bg-muted'
                )}
                onMouseEnter={() => setHighlightedIndex(index)}
                onClick={() => selectOptionAndCleanUp(option)}
              >
                <span className="font-semibold leading-none">
                  {option.label}
                </span>
                <span className="text-xs text-muted-foreground">
                  {option.description}
                </span>
              </button>
            ))}
          </div>,
          anchorElementRef.current
        );
      },
      []
    );

  if (!slashMenuEnabled) {
    return null;
  }

  return (
    <LexicalTypeaheadMenuPlugin
      triggerFn={checkForSlashTrigger}
      onQueryChange={setSlashQuery}
      onSelectOption={handleSlashSelect}
      menuRenderFn={slashMenuRender}
      options={slashOptions}
      anchorClassName="z-50"
      preselectFirstItem={false}
    />
  );
};
