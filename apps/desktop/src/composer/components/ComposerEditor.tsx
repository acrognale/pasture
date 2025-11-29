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
  $applyNodeReplacement,
  $createParagraphNode,
  $createTextNode,
  $getRoot,
  $getSelection,
  $isElementNode,
  $isRangeSelection,
  COMMAND_PRIORITY_HIGH,
  DecoratorNode,
  type EditorState,
  KEY_DOWN_COMMAND,
  type LexicalEditor,
  type NodeKey,
  type SerializedLexicalNode,
  type Spread,
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
import { Codex } from '~/codex/client';
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

const FILE_MENTION_TRIGGER: RegExp = /(^|\s)@([^\s@]*)$/;
const FILE_MENTION_TEXT_PATTERN: RegExp = /(^|[\s])@([^\s@]*\/[^\s@]+)/g;
const FILE_MENTION_INSERTION_PATTERN: RegExp = /(^|[\s\n])@[^\s@]*$/;

type FileMentionPayload = {
  path: string;
  label: string;
};

type SerializedFileMentionNode = Spread<
  {
    type: 'file-mention';
    version: 1;
  } & FileMentionPayload,
  SerializedLexicalNode
>;

const buildFileLabel = (path: string): string => {
  const segments = path.split(/[\\/]/);
  const label = segments[segments.length - 1];
  return label || path;
};

const FileMention = ({ path, label }: FileMentionPayload) => (
  <span className="mention-file" title={path}>
    @{label}
  </span>
);

class FileMentionNode extends DecoratorNode<React.ReactElement> {
  __path: string;
  __label: string;

  constructor(path: string, label: string, key?: NodeKey) {
    super(key);
    this.__path = path;
    this.__label = label;
  }

  static getType(): string {
    return 'file-mention';
  }

  static clone(node: FileMentionNode): FileMentionNode {
    return new FileMentionNode(node.__path, node.__label, node.__key);
  }

  static importJSON(
    serializedNode: SerializedFileMentionNode
  ): FileMentionNode {
    const { path, label } = serializedNode;
    return new FileMentionNode(path, label);
  }

  exportJSON(): SerializedFileMentionNode {
    return {
      type: 'file-mention',
      version: 1,
      path: this.__path,
      label: this.__label,
    };
  }

  createDOM(): HTMLElement {
    return document.createElement('span');
  }

  updateDOM(): false {
    return false;
  }

  decorate(): React.ReactElement {
    return <FileMention path={this.__path} label={this.__label} />;
  }

  isInline(): boolean {
    return true;
  }

  isIsolated(): boolean {
    return true;
  }

  getTextContent(): string {
    return `@${this.__path}`;
  }
}

const $createFileMentionNode = ({ path, label }: FileMentionPayload) =>
  $applyNodeReplacement(new FileMentionNode(path, label));

const $isFileMentionNode = (node: unknown): node is FileMentionNode =>
  node instanceof FileMentionNode;

const appendTextWithMentions = (
  paragraph: ReturnType<typeof $createParagraphNode>,
  line: string
) => {
  let lastIndex = 0;

  for (const match of line.matchAll(FILE_MENTION_TEXT_PATTERN)) {
    const matchIndex = match.index ?? 0;
    const prefix = match[1] ?? '';
    const path = match[2] ?? '';
    if (!path) {
      continue;
    }

    const mentionStart = matchIndex + prefix.length;
    if (mentionStart > lastIndex) {
      paragraph.append($createTextNode(line.slice(lastIndex, mentionStart)));
    }

    paragraph.append(
      $createFileMentionNode({ path, label: buildFileLabel(path) })
    );

    lastIndex = mentionStart + path.length + 1;
  }

  if (lastIndex < line.length) {
    paragraph.append($createTextNode(line.slice(lastIndex)));
  } else if (line.length === 0 && lastIndex === 0) {
    paragraph.append($createTextNode(''));
  }
};

const updateRootText = (editor: LexicalEditor, text: string) => {
  editor.update(() => {
    const root = $getRoot();
    const current = root.getTextContent();
    if (current === text) {
      return;
    }

    root.clear();

    const lines = text.split('\n');
    const appendLine = (line: string) => {
      const paragraph = $createParagraphNode();
      appendTextWithMentions(paragraph, line);
      if (paragraph.getChildrenSize() === 0) {
        paragraph.append($createTextNode(''));
      }
      root.append(paragraph);
    };

    if (lines.length === 0) {
      appendLine('');
      return;
    }

    lines.forEach(appendLine);
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
          if (event.key === 'Backspace') {
            let deleted = false;
            editor.update(() => {
              const selection = $getSelection();
              if (!$isRangeSelection(selection) || !selection.isCollapsed()) {
                return;
              }
              const anchorNode = selection.anchor.getNode();
              const anchorOffset = selection.anchor.offset;

              const findTarget = () => {
                if ($isFileMentionNode(anchorNode)) {
                  return anchorNode;
                }
                if ($isElementNode(anchorNode) && anchorOffset > 0) {
                  // Cursor can sit on the parent element when it's placed after an isolated decorator.
                  const previousChild = anchorNode.getChildAtIndex(
                    anchorOffset - 1
                  );
                  if (previousChild && $isFileMentionNode(previousChild)) {
                    return previousChild;
                  }
                }
                if (anchorOffset > 0) {
                  return null;
                }
                const previousSibling = anchorNode.getPreviousSibling();
                if (previousSibling && $isFileMentionNode(previousSibling)) {
                  return previousSibling;
                }
                const parent = anchorNode.getParent();
                if (
                  parent &&
                  parent.getFirstChild() === anchorNode &&
                  parent.getPreviousSibling() &&
                  $isFileMentionNode(parent.getPreviousSibling())
                ) {
                  return parent.getPreviousSibling() as FileMentionNode;
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
        nodes: [FileMentionNode],
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
    const [fileMentionQuery, setFileMentionQuery] = useState<string | null>(
      null
    );
    const [fileMentionOptions, setFileMentionOptions] = useState<
      FileMentionOption[]
    >([]);
    const fileMenuEnabled =
      !disabled && !ariaBusy && Boolean(workspacePath?.trim().length);

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
            results.map(
              (hit) => new FileMentionOption(hit.path, hit.score ?? 0)
            )
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

    const handleFileMentionSelect = useCallback<
      TypeaheadMenuPluginProps<FileMentionOption>['onSelectOption']
    >(
      (option: FileMentionOption, _node: TextNode | null, closeMenu) => {
        const current = valueRef.current ?? '';
        const next = current.replace(
          FILE_MENTION_INSERTION_PATTERN,
          (_match, prefix: string) => `${prefix}@${option.path} `
        );

        const draft =
          next === current
            ? `${current}${
                current.endsWith(' ') || current.length === 0 ? '' : ' '
              }@${option.path} `
            : next;

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
        setFileMentionQuery(null);
      },
      [onChange, setFileMentionQuery]
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

    const fileMentionMenuRender: TypeaheadMenuPluginProps<FileMentionOption>['menuRenderFn'] =
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
        {fileMenuEnabled ? (
          <LexicalTypeaheadMenuPlugin
            triggerFn={checkForFileMentionTrigger}
            onQueryChange={setFileMentionQuery}
            onSelectOption={handleFileMentionSelect}
            menuRenderFn={fileMentionMenuRender}
            options={activeFileMentionOptions}
            anchorClassName="z-50"
            preselectFirstItem
          />
        ) : null}
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
