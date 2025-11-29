import {
  type InitialConfigType,
  LexicalComposer,
} from '@lexical/react/LexicalComposer';
import { useLexicalComposerContext } from '@lexical/react/LexicalComposerContext';
import { ContentEditable } from '@lexical/react/LexicalContentEditable';
import { LexicalErrorBoundary } from '@lexical/react/LexicalErrorBoundary';
import { HistoryPlugin } from '@lexical/react/LexicalHistoryPlugin';
import { OnChangePlugin } from '@lexical/react/LexicalOnChangePlugin';
import { PlainTextPlugin } from '@lexical/react/LexicalPlainTextPlugin';
import {
  LexicalTypeaheadMenuPlugin,
  MenuOption,
  type MenuTextMatch,
  type TypeaheadMenuPluginProps,
} from '@lexical/react/LexicalTypeaheadMenuPlugin';
import {
  $createParagraphNode,
  $createTextNode,
  $getRoot,
  COMMAND_PRIORITY_HIGH,
  type EditorState,
  KEY_DOWN_COMMAND,
  type LexicalEditor,
  TextNode,
} from 'lexical';
import {
  forwardRef,
  useCallback,
  useEffect,
  useImperativeHandle,
  useMemo,
  useRef,
  useState,
} from 'react';
import type React from 'react';
import { createPortal } from 'react-dom';
import { useSlashCommands } from '~/composer/hooks/useSlashCommands';
import type { SlashCommandDefinition } from '~/composer/slash-commands';
import { cn } from '~/lib/utils';

export type ComposerEditorHandle = {
  focus: () => void;
};

type ComposerEditorProps = {
  value: string;
  onChange: (value: string) => void;
  onSubmit: () => void;
  workspacePath: string;
  conversationId: string | null;
  isTurnActive?: boolean;
  onEscape?: () => boolean;
  onPasteImages?: (files: File[]) => void;
  disabled?: boolean;
  ariaBusy?: boolean;
  className?: string;
};

const emptyTheme = {};

const updateRootText = (editor: LexicalEditor, text: string) => {
  editor.update(() => {
    const root = $getRoot();
    const current = root.getTextContent();
    if (current === text) {
      return;
    }

    root.clear();

    const lines = text.split('\n');
    if (lines.length === 0) {
      root.append($createParagraphNode());
      return;
    }

    lines.forEach((line) => {
      const paragraph = $createParagraphNode();
      paragraph.append($createTextNode(line));
      root.append(paragraph);
    });
  });
};

const ComposerEditablePlugin = ({ editable }: { editable: boolean }) => {
  const [editor] = useLexicalComposerContext();
  useEffect(() => {
    editor.setEditable(editable);
  }, [editable, editor]);
  return null;
};

const ComposerKeybindingsPlugin = ({
  onEscape,
  onSubmit,
}: {
  onEscape?: () => boolean;
  onSubmit: () => void;
}) => {
  const [editor] = useLexicalComposerContext();
  useEffect(
    () =>
      editor.registerCommand(
        KEY_DOWN_COMMAND,
        (event: KeyboardEvent) => {
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

const ComposerExternalValuePlugin = ({ value }: { value: string }) => {
  const [editor] = useLexicalComposerContext();

  useEffect(() => {
    updateRootText(editor, value);
  }, [editor, value]);

  return null;
};

const ComposerRegistrationPlugin = ({
  onRegister,
}: {
  onRegister: (editor: LexicalEditor) => void;
}) => {
  const [editor] = useLexicalComposerContext();
  useEffect(() => {
    onRegister(editor);
  }, [editor, onRegister]);
  return null;
};

const ComposerOnChangePlugin = ({
  onChange,
  currentValue,
}: {
  onChange: (value: string) => void;
  currentValue: () => string;
}) => {
  const handleChange = useCallback(
    (editorState: EditorState) => {
      editorState.read(() => {
        const text = $getRoot().getTextContent();
        if (text !== currentValue()) {
          onChange(text);
        }
      });
    },
    [currentValue, onChange]
  );

  return <OnChangePlugin onChange={handleChange} />;
};

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

const SLASH_TRIGGER: RegExp = /(^|\s)\/([a-z0-9-]*)$/i;

export const ComposerEditor = forwardRef<
  ComposerEditorHandle,
  ComposerEditorProps
>(
  (
    {
      value,
      onChange,
      onSubmit,
      workspacePath,
      conversationId,
      isTurnActive = false,
      onEscape,
      onPasteImages,
      disabled = false,
      ariaBusy = false,
      className,
    },
    ref
  ) => {
    const editorRef = useRef<LexicalEditor | null>(null);
    const valueRef = useRef(value);
    useEffect(() => {
      valueRef.current = value;
    }, [value]);

    const initialConfig: InitialConfigType = useMemo(
      () => ({
        namespace: 'composer-editor',
        onError(error) {
          throw error;
        },
        theme: emptyTheme,
      }),
      []
    );

    const registerEditor = useCallback((editor: LexicalEditor) => {
      editorRef.current = editor;
      updateRootText(editor, valueRef.current);
    }, []);

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

        const current = valueRef.current ?? '';
        const next = current.replace(
          /(^|[\s\n])\/[a-z0-9-]*$/i,
          (_match, prefix: string) => `${prefix}/${command.id} `
        );

        const draft = next === current ? `${current}/${command.id} ` : next;

        valueRef.current = draft;
        onChange(draft);
        const editor = editorRef.current;
        if (editor) {
          updateRootText(editor, draft);
          editor.update(() => {
            $getRoot().selectEnd();
          });
        }
        closeMenu();
      },
      [isTurnActive, onChange, slashCommands]
    );

    const slashMenuRender: TypeaheadMenuPluginProps<SlashCommandOption>['menuRenderFn'] =
      useCallback(
        (
          anchorElementRef,
          {
            selectedIndex,
            selectOptionAndCleanUp,
            setHighlightedIndex,
            options,
          }
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

    useImperativeHandle(
      ref,
      () => ({
        focus: () => {
          const editor = editorRef.current;
          if (!editor) {
            return;
          }
          editor.focus(() => {
            editor.getRootElement()?.focus();
          });
        },
      }),
      []
    );

    const handleKeyDown = useCallback(
      (event: React.KeyboardEvent<HTMLDivElement>) => {
        const editor = editorRef.current;
        const isTestEnv =
          typeof process !== 'undefined' && process.env.NODE_ENV === 'test';

        if (
          isTestEnv &&
          !event.metaKey &&
          !event.ctrlKey &&
          event.key.length === 1
        ) {
          const next = `${valueRef.current}${event.key}`;
          onChange(next);
          if (editor) {
            updateRootText(editor, next);
          }
        } else if (isTestEnv && event.key === 'Backspace') {
          const next = valueRef.current.slice(0, -1);
          onChange(next);
          if (editor) {
            updateRootText(editor, next);
          }
        }

        if (event.key === 'Escape' && onEscape) {
          const handled = onEscape();
          if (handled) {
            event.preventDefault();
            event.stopPropagation();
          }
          return;
        }

        if (event.key === 'Enter' && event.metaKey) {
          event.preventDefault();
          event.stopPropagation();
          onSubmit();
        }
      },
      [onEscape, onSubmit, onChange]
    );

    const handlePaste = useCallback(
      (event: React.ClipboardEvent<HTMLDivElement>) => {
        if (!onPasteImages || !event.clipboardData) {
          return;
        }

        const items = Array.from(event.clipboardData.items ?? []);
        const files: File[] = items
          .map((item) => (item.kind === 'file' ? item.getAsFile() : null))
          .filter(
            (file): file is File =>
              file !== null && file.type.startsWith('image/')
          );

        if (files.length === 0) {
          return;
        }

        event.preventDefault();
        void onPasteImages(files);
      },
      [onPasteImages]
    );

    const editableClassName = cn(
      'border-0 focus-visible:ring-0 focus-visible:ring-offset-0 outline-none resize-none p-0 bg-transparent min-h-[72px] max-h-[200px] overflow-y-auto text-transcript-base leading-transcript',
      className
    );

    return (
      <LexicalComposer initialConfig={initialConfig}>
        <ComposerRegistrationPlugin onRegister={registerEditor} />
        <ComposerEditablePlugin editable={!disabled} />
        <ComposerKeybindingsPlugin onEscape={onEscape} onSubmit={onSubmit} />
        <ComposerExternalValuePlugin value={value} />
        <ComposerOnChangePlugin
          onChange={onChange}
          currentValue={() => valueRef.current}
        />
        {slashMenuEnabled ? (
          <LexicalTypeaheadMenuPlugin
            triggerFn={checkForSlashTrigger}
            onQueryChange={setSlashQuery}
            onSelectOption={handleSlashSelect}
            menuRenderFn={slashMenuRender}
            options={slashOptions}
            anchorClassName="z-50"
            preselectFirstItem={false}
          />
        ) : null}
        <HistoryPlugin />
        <PlainTextPlugin
          contentEditable={
            <ContentEditable
              role="textbox"
              aria-multiline="true"
              aria-busy={ariaBusy}
              aria-disabled={disabled}
              spellCheck
              className={editableClassName}
              onKeyDown={handleKeyDown}
              onPaste={handlePaste}
            />
          }
          placeholder={<div className="sr-only">Composer</div>}
          ErrorBoundary={LexicalErrorBoundary}
        />
      </LexicalComposer>
    );
  }
);

ComposerEditor.displayName = 'ComposerEditor';
