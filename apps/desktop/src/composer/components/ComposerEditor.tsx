import {
  type InitialConfigType,
  LexicalComposer,
} from '@lexical/react/LexicalComposer';
import { ContentEditable } from '@lexical/react/LexicalContentEditable';
import { LexicalErrorBoundary } from '@lexical/react/LexicalErrorBoundary';
import { HistoryPlugin } from '@lexical/react/LexicalHistoryPlugin';
import { PlainTextPlugin } from '@lexical/react/LexicalPlainTextPlugin';
import type { LexicalEditor } from 'lexical';
import {
  forwardRef,
  useCallback,
  useEffect,
  useImperativeHandle,
  useMemo,
  useRef,
} from 'react';
import type React from 'react';
import { FileMentionNode } from '~/composer/components/FileMentionNode';
import { SymbolMentionNode } from '~/composer/components/SymbolMentionNode';
import { getExpandedTextForSend, updateRootText } from '~/composer/mentions';
import { EditablePlugin } from '~/composer/plugins/EditablePlugin';
import { ExternalValuePlugin } from '~/composer/plugins/ExternalValuePlugin';
import { FileMentionTypeaheadPlugin } from '~/composer/plugins/FileMentionTypeaheadPlugin';
import { KeybindingsPlugin } from '~/composer/plugins/KeybindingsPlugin';
import { OnChangePlugin } from '~/composer/plugins/OnChangePlugin';
import { RegistrationPlugin } from '~/composer/plugins/RegistrationPlugin';
import { SlashTypeaheadPlugin } from '~/composer/plugins/SlashTypeaheadPlugin';
import { SymbolMentionTypeaheadPlugin } from '~/composer/plugins/SymbolMentionTypeaheadPlugin';
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
        nodes: [FileMentionNode, SymbolMentionNode],
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

        if (
          isTestEnv &&
          !event.metaKey &&
          !event.ctrlKey &&
          event.key.length === 1
        ) {
          const next = `${valueRef.current}${event.key}`;
          setCurrentValue(next);
          if (editor) {
            updateRootText(editor, next);
          }
        } else if (isTestEnv && event.key === 'Backspace') {
          const next = valueRef.current.slice(0, -1);
          setCurrentValue(next);
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
        <FileMentionTypeaheadPlugin
          workspacePath={workspacePath}
          disabled={disabled}
          ariaBusy={ariaBusy}
          onChange={setCurrentValue}
          currentValue={() => valueRef.current}
        />
        <SymbolMentionTypeaheadPlugin
          workspacePath={workspacePath}
          disabled={disabled}
          ariaBusy={ariaBusy}
          onChange={setCurrentValue}
          currentValue={() => valueRef.current}
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
