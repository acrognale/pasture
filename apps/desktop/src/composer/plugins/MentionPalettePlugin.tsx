import { useLexicalComposerContext } from '@lexical/react/LexicalComposerContext';
import {
  $createTextNode,
  $getNodeByKey,
  $getRoot,
  $getSelection,
  $isRangeSelection,
  $isTextNode,
  COMMAND_PRIORITY_NORMAL,
  KEY_DOWN_COMMAND,
  type LexicalEditor,
} from 'lexical';
import type React from 'react';
import { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Codex } from '~/codex/client';
import { cn } from '~/lib/utils';

import {
  type AnyMention,
  type FileMention,
  type SymbolMention,
  type ThreadMention,
  buildFileLabel,
  createMentionNode,
} from '../mentions';

type Props = {
  workspacePath: string;
  disabled?: boolean;
  ariaBusy?: boolean;
  currentValue: () => string;
  onChange: (value: string) => void;
};

type MentionResult = {
  id: string;
  kind: AnyMention['kind'];
  title: string;
  subtitle?: string;
  mention: AnyMention;
};

const MAX_RESULTS_PER_KIND = 6;

const getCaretRect = (): DOMRect | null => {
  const selection = window.getSelection();
  if (!selection || selection.rangeCount === 0) {
    return null;
  }
  const range = selection.getRangeAt(0);
  const rect = range.getBoundingClientRect();
  if (rect && rect.width === 0 && rect.height === 0) {
    return null;
  }
  return rect;
};

export const MentionPalettePlugin = ({
  workspacePath,
  disabled,
  ariaBusy,
  currentValue,
  onChange,
}: Props) => {
  const [editor] = useLexicalComposerContext();
  const menuEnabled =
    !disabled && !ariaBusy && Boolean(workspacePath?.trim().length);

  const [isOpen, setIsOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [anchorRect, setAnchorRect] = useState<DOMRect | null>(null);

  const [threads, setThreads] = useState<ThreadMention[]>([]);
  const [fileResults, setFileResults] = useState<FileMention[]>([]);
  const [symbolResults, setSymbolResults] = useState<SymbolMention[]>([]);
  const inputRef = useRef<HTMLInputElement | null>(null);

  // Load threads once when enabled.
  useEffect(() => {
    if (!menuEnabled) {
      return;
    }
    let cancelled = false;
    void (async () => {
      try {
        const response = await Codex.listThreads({ workspacePath });
        if (!cancelled) {
          const mapped =
            response.items?.map((summary) => ({
              kind: 'thread' as const,
              threadId: summary.threadId,
              label: summary.title ?? 'Untitled thread',
            })) ?? [];
          setThreads(mapped);
        }
      } catch (error) {
        if (!cancelled) {
          console.error('[MentionPalette] Failed to list threads', error);
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [menuEnabled, workspacePath]);

  // Search files & symbols when query changes.
  useEffect(() => {
    if (!menuEnabled || !isOpen) {
      return;
    }
    const trimmed = query.trim();
    if (!trimmed) {
      setFileResults([]);
      setSymbolResults([]);
      return;
    }
    let cancelled = false;
    Codex.searchWorkspaceFiles({
      workspacePath,
      query: trimmed,
      limit: MAX_RESULTS_PER_KIND,
    })
      .then((results) => {
        if (cancelled) return;
        setFileResults(
          results.map((hit) => ({
            kind: 'file' as const,
            path: hit.path,
            label: buildFileLabel(hit.path),
          }))
        );
      })
      .catch((error) => {
        if (!cancelled) {
          console.error('[MentionPalette] file search failed', error);
          setFileResults([]);
        }
      });

    Codex.searchWorkspaceSymbols({
      workspacePath,
      query: trimmed,
      limit: MAX_RESULTS_PER_KIND,
    })
      .then((results) => {
        if (cancelled) return;
        setSymbolResults(
          results.map((hit) => ({
            kind: 'symbol' as const,
            name: hit.name,
            filePath: hit.filePath,
            line: hit.line,
            kindLabel: hit.kind,
          }))
        );
      })
      .catch((error) => {
        if (!cancelled) {
          console.error('[MentionPalette] symbol search failed', error);
          setSymbolResults([]);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [isOpen, menuEnabled, query, workspacePath]);

  const filteredThreads = useMemo(() => {
    const trimmed = query.trim().toLowerCase();
    if (!trimmed) {
      return threads.slice(0, MAX_RESULTS_PER_KIND);
    }
    return threads
      .filter((thread) => {
        const haystack = `${thread.label} ${thread.threadId}`.toLowerCase();
        return haystack.includes(trimmed);
      })
      .slice(0, MAX_RESULTS_PER_KIND);
  }, [query, threads]);

  const results: MentionResult[] = useMemo(() => {
    const items: MentionResult[] = [];
    fileResults.forEach((m) =>
      items.push({
        id: `file-${m.path}`,
        kind: m.kind,
        title: m.label,
        subtitle: m.path,
        mention: m,
      })
    );
    symbolResults.forEach((m) =>
      items.push({
        id: `symbol-${m.name}-${m.filePath}-${m.line}`,
        kind: m.kind,
        title: m.name,
        subtitle: `${m.filePath}:${m.line}`,
        mention: m,
      })
    );
    filteredThreads.forEach((m) =>
      items.push({
        id: `thread-${m.threadId}`,
        kind: m.kind,
        title: m.label,
        subtitle: m.threadId,
        mention: m,
      })
    );
    return items;
  }, [fileResults, filteredThreads, symbolResults]);

  const closePalette = () => {
    setIsOpen(false);
    setQuery('');
    setSelectedIndex(0);
    setAnchorRect(null);
    editor.focus(() => {
      editor.getRootElement()?.focus();
    });
  };

  const commitSelection = (result: MentionResult | undefined) => {
    if (!result) return;
    editor.update(() => {
      const selection = $getSelection();
      let targetAnchor: { key: string; offset: number } | null = null;

      if ($isRangeSelection(selection) && selection.isCollapsed()) {
        targetAnchor = {
          key: selection.anchor.key,
          offset: selection.anchor.offset,
        };
        const anchorNode = selection.anchor.getNode();
        if ($isTextNode(anchorNode) && selection.anchor.offset > 0) {
          const text = anchorNode.getTextContent();
          const before = selection.anchor.offset - 1;
          if (text[before] === '@') {
            const nextText =
              text.slice(0, before) + text.slice(selection.anchor.offset);
            anchorNode.setTextContent(nextText);
            const newOffset = before;
            selection.anchor.set(anchorNode.getKey(), newOffset, 'text');
            selection.focus.set(anchorNode.getKey(), newOffset, 'text');
            targetAnchor = { key: anchorNode.getKey(), offset: newOffset };
          }
        }
      }

      const mentionNode = createMentionNode(result.mention);
      if (!mentionNode) return;
      const trailing = $createTextNode(' ');

      const freshSelection = $getSelection();
      if ($isRangeSelection(freshSelection) && freshSelection.isCollapsed()) {
        freshSelection.insertNodes([mentionNode, trailing]);
        trailing.select();
        return;
      }

      if (targetAnchor) {
        const node = $getNodeByKey(targetAnchor.key);
        if ($isTextNode(node)) {
          const textSelection = node.select(
            targetAnchor.offset,
            targetAnchor.offset
          );
          if (textSelection) {
            textSelection.insertNodes([mentionNode, trailing]);
            trailing.select();
            return;
          }
        }
      }

      $getRoot().append(mentionNode);
      mentionNode.insertAfter(trailing);
      trailing.select();
    });
    editor.getEditorState().read(() => {
      const text = $getRoot().getTextContent();
      onChange(text);
    });
    closePalette();
  };

  // Open on "@" keystroke.
  useEffect(() => {
    if (!menuEnabled) {
      return;
    }
    return editor.registerCommand(
      KEY_DOWN_COMMAND,
      (event: KeyboardEvent) => {
        if (isOpen) {
          return false;
        }
        if (event.key !== '@' || event.metaKey || event.ctrlKey || event.altKey) {
          return false;
        }
        event.preventDefault();
        editor.update(() => {
          const selection = $getSelection();
          if ($isRangeSelection(selection)) {
            selection.insertText('@');
          } else {
            const textNode = $createTextNode('@');
            $getRoot().append(textNode);
            textNode.select();
          }
        });
        const caretRect =
          getCaretRect() ?? editor.getRootElement()?.getBoundingClientRect() ?? null;
        setAnchorRect(caretRect);
        setIsOpen(true);
        setQuery('');
        setSelectedIndex(0);
        return true;
      },
      COMMAND_PRIORITY_NORMAL
    );
  }, [editor, isOpen, menuEnabled]);

  useEffect(() => {
    if (!isOpen) return;
    const id = requestAnimationFrame(() => {
      if (inputRef.current) {
        inputRef.current.focus();
        inputRef.current.select();
      }
    });
    return () => cancelAnimationFrame(id);
  }, [isOpen]);

  if (!menuEnabled || !isOpen || !anchorRect) {
    return null;
  }

  const top = anchorRect.top - 8;
  const left = anchorRect.left;

  const handleInputKeyDown: React.KeyboardEventHandler<HTMLInputElement> = (
    event
  ) => {
    if (event.key === 'ArrowDown') {
      event.preventDefault();
      setSelectedIndex((prev) => Math.min(prev + 1, results.length - 1));
      return;
    }
    if (event.key === 'ArrowUp') {
      event.preventDefault();
      setSelectedIndex((prev) => Math.max(prev - 1, 0));
      return;
    }
    if (event.key === 'Enter') {
      event.preventDefault();
      commitSelection(results[selectedIndex]);
      return;
    }
    if (event.key === 'Escape') {
      event.preventDefault();
      closePalette();
    }
  };

  const handleClickResult = (result: MentionResult) => {
    commitSelection(result);
  };

  const renderKindBadge = (kind: AnyMention['kind']) => {
    switch (kind) {
      case 'file':
        return 'File';
      case 'symbol':
        return 'Symbol';
      case 'thread':
        return 'Thread';
      default:
        return '';
    }
  };

  const root = (
    <div
      className="pointer-events-auto"
      style={{
        position: 'fixed',
        top,
        left,
        transform: 'translateY(-100%)',
        zIndex: 60,
      }}
    >
      <div className="min-w-[320px] max-w-[560px] rounded-md border border-border bg-popover shadow-sm flex flex-col">
        <div className="max-h-80 overflow-y-auto py-1">
          {results.length === 0 ? (
            <div className="px-3 py-1.5 text-xs text-muted-foreground">
              No matches.
            </div>
          ) : (
            results.map((result, index) => (
              <button
                key={result.id}
                type="button"
                className={cn(
                  'flex w-full flex-col items-start gap-0.5 px-3 py-1.5 text-left text-transcript-micro leading-transcript text-foreground transition-colors whitespace-normal',
                  index === selectedIndex
                    ? 'bg-accent text-accent-foreground'
                    : 'hover:bg-muted'
                )}
                onMouseDown={(event) => {
                  event.preventDefault();
                  handleClickResult(result);
                }}
              >
                <span className="flex items-center gap-2 w-full">
                  <span className="font-semibold leading-none truncate">
                    {result.title}
                  </span>
                  <span className="text-[11px] text-muted-foreground uppercase tracking-wide">
                    {renderKindBadge(result.kind)}
                  </span>
                </span>
                {result.subtitle ? (
                  <span className="text-xs text-muted-foreground leading-none w-full truncate">
                    {result.subtitle}
                  </span>
                ) : null}
              </button>
            ))
          )}
        </div>
        <div className="border-t border-border px-3 py-2">
          <input
            ref={inputRef}
            type="text"
            className="w-full bg-transparent text-transcript-base leading-transcript text-foreground placeholder:text-muted-foreground focus-visible:outline-none"
            placeholder="Mention a file, symbol, or thread…"
            value={query}
            onChange={(event) => {
              setQuery(event.target.value);
              setSelectedIndex(0);
            }}
            onKeyDown={handleInputKeyDown}
          />
        </div>
      </div>
    </div>
  );

  return createPortal(root, document.body);
};
