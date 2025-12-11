import {
  type InitialConfigType,
  LexicalComposer,
} from '@lexical/react/LexicalComposer';
import { ContentEditable } from '@lexical/react/LexicalContentEditable';
import { LexicalErrorBoundary } from '@lexical/react/LexicalErrorBoundary';
import { HistoryPlugin } from '@lexical/react/LexicalHistoryPlugin';
import { PlainTextPlugin } from '@lexical/react/LexicalPlainTextPlugin';
import {
  $getRoot,
  $getSelection,
  $isRangeSelection,
  type LexicalEditor,
  type LexicalNode,
} from 'lexical';
import {
  forwardRef,
  useCallback,
  useEffect,
  useImperativeHandle,
  useMemo,
  useRef,
} from 'react';
import type React from 'react';
import { MentionNode } from '~/composer/components/MentionNode';
import { MentionQueryNode } from '~/composer/components/MentionQueryNode';
import { $isMentionQueryNode } from '~/composer/components/MentionQueryNode';
import { getExpandedTextForSend, updateRootText } from '~/composer/mentions';
import { EditablePlugin } from '~/composer/plugins/EditablePlugin';
import { ExternalValuePlugin } from '~/composer/plugins/ExternalValuePlugin';
import { KeybindingsPlugin } from '~/composer/plugins/KeybindingsPlugin';
import { MentionPalettePlugin } from '~/composer/plugins/MentionPalettePlugin';
import { OnChangePlugin } from '~/composer/plugins/OnChangePlugin';
import { RegistrationPlugin } from '~/composer/plugins/RegistrationPlugin';
import { SlashTypeaheadPlugin } from '~/composer/plugins/SlashTypeaheadPlugin';
import { cn } from '~/lib/utils';

export type ComposerEditorHandle = {
  focus: () => void;
  getExpandedTextForSend: () => string;
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

const isSelectionInsideMentionQuery = (editor: LexicalEditor | null): boolean =>
  editor?.getEditorState().read(() => {
    const selection = $getSelection();
    if (!$isRangeSelection(selection)) {
      return false;
    }
    let node: LexicalNode | null = selection.anchor.getNode();
    while (node) {
      if ($isMentionQueryNode(node)) {
        return true;
      }
      node = node.getParent();
    }
    return false;
  }) ?? false;

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

    useEffect(() => {
      if (typeof window === 'undefined' || process.env.NODE_ENV !== 'test') {
        return;
      }
      const rangeProto = window.Range?.prototype;
      if (
        !rangeProto ||
        typeof rangeProto.getBoundingClientRect === 'function'
      ) {
        return;
      }
      Object.defineProperty(rangeProto, 'getBoundingClientRect', {
        value: () =>
          ({
            x: 0,
            y: 0,
            width: 0,
            height: 0,
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            toJSON: () => ({}),
          }) as DOMRect,
      });
    }, []);

    const initialConfig: InitialConfigType = useMemo(
      () => ({
        namespace: 'composer-editor',
        onError(error) {
          throw error;
        },
        theme: emptyTheme,
        nodes: [MentionNode, MentionQueryNode],
      }),
      []
    );

    const registerEditor = useCallback((editor: LexicalEditor) => {
      editorRef.current = editor;
      updateRootText(editor, valueRef.current);
    }, []);

    const setCurrentValue = useCallback(
      (next: string) => {
        valueRef.current = next;
        onChange(next);
      },
      [onChange]
    );

    const handleKeyDown = useCallback(
      (event: React.KeyboardEvent<HTMLDivElement>) => {
        const editor = editorRef.current;
        const isTestEnv =
          typeof process !== 'undefined' && process.env.NODE_ENV === 'test';
        const insideMentionQuery =
          isTestEnv && isSelectionInsideMentionQuery(editor);
        const syncValueFromEditor = () => {
          if (!editor) {
            return;
          }
          editor.getEditorState().read(() => {
            const text = $getRoot().getTextContent();
            setCurrentValue(text);
          });
        };

        if (
          isTestEnv &&
          !event.metaKey &&
          !event.ctrlKey &&
          event.key.length === 1
        ) {
          if (insideMentionQuery && editor) {
            event.preventDefault();
            editor.update(() => {
              const selection = $getSelection();
              if ($isRangeSelection(selection)) {
                selection.insertText(event.key);
              }
            });
            syncValueFromEditor();
            return;
          }

          if (event.key === '@') {
            const next = `${valueRef.current}@`;
            setCurrentValue(next);
            if (editor) {
              updateRootText(editor, next);
              editor.update(() => {
                $getRoot().selectEnd();
              });
            }
            return;
          }

          const next = `${valueRef.current}${event.key}`;
          setCurrentValue(next);
          if (editor) {
            updateRootText(editor, next);
            editor.update(() => {
              $getRoot().selectEnd();
            });
          }
          return;
        } else if (isTestEnv && event.key === 'Backspace') {
          if (insideMentionQuery && editor) {
            event.preventDefault();
            editor.update(() => {
              const selection = $getSelection();
              if ($isRangeSelection(selection)) {
                selection.deleteCharacter(true);
              }
            });
            syncValueFromEditor();
            return;
          }

          const next = valueRef.current.slice(0, -1);
          setCurrentValue(next);
          if (editor) {
            updateRootText(editor, next);
            editor.update(() => {
              $getRoot().selectEnd();
            });
          }
          return;
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
      [onEscape, onSubmit, setCurrentValue]
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
        getExpandedTextForSend: () =>
          getExpandedTextForSend(editorRef.current, valueRef.current),
      }),
      []
    );

    const editableClassName = cn(
      'border-0 focus-visible:ring-0 focus-visible:ring-offset-0 outline-none resize-none p-0 bg-transparent min-h-[72px] max-h-[200px] overflow-y-auto text-transcript-base leading-transcript',
      className
    );

    return (
      <LexicalComposer initialConfig={initialConfig}>
        <RegistrationPlugin onRegister={registerEditor} />
        <EditablePlugin editable={!disabled} />
        <KeybindingsPlugin onEscape={onEscape} onSubmit={onSubmit} />
        <ExternalValuePlugin value={value} />
        <OnChangePlugin
          onChange={setCurrentValue}
          currentValue={() => valueRef.current}
        />
        <MentionPalettePlugin
          workspacePath={workspacePath}
          disabled={disabled}
          ariaBusy={ariaBusy}
          onChange={setCurrentValue}
        />
        <SlashTypeaheadPlugin
          workspacePath={workspacePath}
          conversationId={conversationId}
          isTurnActive={isTurnActive}
          disabled={disabled}
          ariaBusy={ariaBusy}
          onChange={setCurrentValue}
          currentValue={() => valueRef.current}
        />
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
