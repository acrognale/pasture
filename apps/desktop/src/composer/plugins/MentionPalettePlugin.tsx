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
  type LexicalNode,
  type NodeKey,
} from 'lexical';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Codex } from '~/codex/client';
import { cn } from '~/lib/utils';

import {
  $createMentionQueryNode,
  $isMentionQueryNode,
} from '../components/MentionQueryNode';
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

const isAltGraph = (event: KeyboardEvent): boolean => {
  try {
    return typeof event.getModifierState === 'function'
      ? event.getModifierState('AltGraph')
      : false;
  } catch {
    return false;
  }
};

const shouldIgnoreAtTrigger = (event: KeyboardEvent): boolean => {
  // Allow AltGraph (common on EU keyboards) to still trigger '@'
  const altGraph = isAltGraph(event);
  if (event.metaKey) return true;
  if (!altGraph && (event.ctrlKey || event.altKey)) return true;
  return false;
};

const getAnchorRectForQueryKey = (
  editor: LexicalEditor,
  key: NodeKey | null
): DOMRect | null => {
  if (key) {
    const el = editor.getElementByKey(key);
    if (el) {
      const rect = el.getBoundingClientRect();
      if (!(rect.width === 0 && rect.height === 0)) {
        return rect;
      }
    }
  }
  return (
    getCaretRect() ?? editor.getRootElement()?.getBoundingClientRect() ?? null
  );
};

export const MentionPalettePlugin = ({
  workspacePath,
  disabled,
  ariaBusy,
  onChange,
}: Props) => {
  const [editor] = useLexicalComposerContext();
  const menuEnabled =
    !disabled && !ariaBusy && Boolean(workspacePath?.trim().length);

  const [isOpen, setIsOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [anchorRect, setAnchorRect] = useState<DOMRect | null>(null);

  // Source of truth for the active query pill.
  const activeQueryNodeKeyRef = useRef<NodeKey | null>(null);

  // Stable refs for command handlers to avoid stale closures.
  const isOpenRef = useRef(false);
  const closingRef = useRef(false);
  const queryRef = useRef('');
  const selectedIndexRef = useRef(0);
  const resultsRef = useRef<MentionResult[]>([]);

  const [threads, setThreads] = useState<ThreadMention[]>([]);
  const [fileResults, setFileResults] = useState<FileMention[]>([]);
  const [symbolResults, setSymbolResults] = useState<SymbolMention[]>([]);

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
    if (!trimmed) return;
    console.log('[MentionPalette] searching', trimmed);
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
    const hasQuery = query.trim().length > 0;
    const items: MentionResult[] = [];
    const seen = new Set<string>();

    const pushUnique = (item: MentionResult) => {
      if (seen.has(item.id)) {
        return;
      }
      seen.add(item.id);
      items.push(item);
    };

    if (hasQuery) {
      fileResults.forEach((m) =>
        pushUnique({
          id: `file-${m.path}`,
          kind: m.kind,
          title: m.label,
          subtitle: m.path,
          mention: m,
        })
      );
      symbolResults.forEach((m) =>
        pushUnique({
          id: `symbol-${m.name}-${m.filePath}-${m.line}`,
          kind: m.kind,
          title: m.name,
          subtitle: `${m.filePath}:${m.line}`,
          mention: m,
        })
      );
    }
    filteredThreads.forEach((m) =>
      pushUnique({
        id: `thread-${m.threadId}`,
        kind: m.kind,
        title: m.label,
        subtitle: m.threadId,
        mention: m,
      })
    );

    return items;
  }, [fileResults, filteredThreads, query, symbolResults]);

  // Keep refs in sync for stable handlers.
  useEffect(() => {
    isOpenRef.current = isOpen;
    console.log('[MentionPalette] isOpen', isOpen);
  }, [isOpen]);
  useEffect(() => {
    queryRef.current = query;
    console.log('[MentionPalette] query', query);
  }, [query]);
  useEffect(() => {
    selectedIndexRef.current = selectedIndex;
  }, [selectedIndex]);
  useEffect(() => {
    resultsRef.current = results;
  }, [results]);

  useEffect(() => {
    const clamped = Math.min(
      selectedIndexRef.current,
      Math.max(results.length - 1, 0)
    );
    selectedIndexRef.current = clamped;
    setSelectedIndex(clamped);
  }, [results.length]);

  type ClosePaletteOptions = {
    selectReplacement?: boolean;
  };

  const closePalette = useCallback(
    (
      preserveQueryText = true,
      options: ClosePaletteOptions = {},
      keyOverride?: NodeKey | null
    ) => {
      const key = keyOverride ?? activeQueryNodeKeyRef.current;

      if (!isOpenRef.current && !key) {
        return;
      }

      closingRef.current = true;
      isOpenRef.current = false;

      activeQueryNodeKeyRef.current = null;

      if (key) {
        editor.update(() => {
          const node = $getNodeByKey(key);
          if (!$isMentionQueryNode(node)) return;

          const text = preserveQueryText ? node.getTextContent() : '';
          const replacement = $createTextNode(text);
          node.replace(replacement);

          if (options.selectReplacement) {
            const len = replacement.getTextContent().length;
            replacement.select(len, len);
          }
        });
      }

      queryRef.current = '';
      selectedIndexRef.current = 0;
      setIsOpen(false);
      setQuery('');
      setSelectedIndex(0);
      setAnchorRect(null);

      closingRef.current = false;
    },
    [editor]
  );

  useEffect(() => {
    if (!isOpen) {
      return;
    }
    const unregister = editor.registerUpdateListener(({ editorState }) => {
    if (!isOpenRef.current || closingRef.current) {
      return;
    }

      let nextQuery = '';
      let anchorKey: NodeKey | null = null;

      editorState.read(() => {
        const selection = $getSelection();
        if (!$isRangeSelection(selection)) {
          return;
        }

        const key = activeQueryNodeKeyRef.current;
        if (!key) {
          return;
        }

        const queryNode = $getNodeByKey(key);
        if (!$isMentionQueryNode(queryNode)) {
          return;
        }

        let current: LexicalNode | null = selection.anchor.getNode();
        let inside = false;
        while (current) {
          if (current.getKey() === key) {
            inside = true;
            break;
          }
          current = current.getParent();
        }
        if (!inside) return;

        anchorKey = key;
        nextQuery = queryNode.getTextContent().replace(/^@/, '');
      });

      if (nextQuery !== queryRef.current) {
        queryRef.current = nextQuery;
        setQuery(nextQuery);
        selectedIndexRef.current = 0;
        setSelectedIndex(0);
      }
      setAnchorRect(getAnchorRectForQueryKey(editor, anchorKey));
    });
    return () => unregister();
  }, [closePalette, editor, isOpen]);

  const commitSelection = useCallback(
    (result: MentionResult | undefined, keyOverride?: NodeKey | null) => {
      if (!result) return;
      editor.update(() => {
        const mentionNode = createMentionNode(result.mention);
        if (!mentionNode) return;
        const trailing = $createTextNode(' ');

        const targetKey = keyOverride ?? activeQueryNodeKeyRef.current;
        if (targetKey) {
          const node = $getNodeByKey(targetKey);
          if ($isMentionQueryNode(node)) {
            node.replace(mentionNode);
            mentionNode.insertAfter(trailing);
            trailing.select();
            return;
          }
        }

        const selection = $getSelection();
        if ($isRangeSelection(selection) && selection.isCollapsed()) {
          selection.insertNodes([mentionNode, trailing]);
          trailing.select();
          return;
        }

        $getRoot().append(mentionNode);
        mentionNode.insertAfter(trailing);
        trailing.select();
      });
      editor.getEditorState().read(() => {
        const text = $getRoot().getTextContent();
        onChange(text);
      });
      activeQueryNodeKeyRef.current = null;
      closePalette(false);
    },
    [closePalette, editor, onChange]
  );

  // Open on "@" keystroke + handle palette navigation
  useEffect(() => {
    if (!menuEnabled) {
      return;
    }
    return editor.registerCommand(
      KEY_DOWN_COMMAND,
      (event: KeyboardEvent) => {
      // Always allow Backspace/Delete to remove an *empty* mention-query pill,
        // even if the palette UI is not currently open.
        if (event.key === 'Backspace' || event.key === 'Delete') {
          let emptyQueryKey: NodeKey | null = null;

          editor.getEditorState().read(() => {
            const selection = $getSelection();
            if (!$isRangeSelection(selection) || !selection.isCollapsed()) {
              return;
            }

            let current: LexicalNode | null = selection.anchor.getNode();

            while (current) {
              if ($isMentionQueryNode(current)) {
                const inner = current
                  .getTextContent()
                  .replace(/^@/, '')
                  .replace(/\u200b/g, '')
                  .trim();

                if (inner.length === 0) {
                  emptyQueryKey = current.getKey();
                }
                return;
              }
              current = current.getParent();
            }
          });

          if (emptyQueryKey) {
            event.preventDefault();
            closePalette(false, { selectReplacement: true }, emptyQueryKey);
            return true;
          }
        }

        // Palette open: navigation + close handling.
        if (isOpenRef.current) {
          if (event.key === 'ArrowDown') {
            event.preventDefault();
            const max = Math.max(resultsRef.current.length - 1, 0);
            const next = Math.min(selectedIndexRef.current + 1, max);
            selectedIndexRef.current = next;
            setSelectedIndex(next);
            return true;
          }
          if (event.key === 'ArrowUp') {
            event.preventDefault();
            const next = Math.max(selectedIndexRef.current - 1, 0);
            selectedIndexRef.current = next;
            setSelectedIndex(next);
            return true;
          }
          if (event.key === 'Enter') {
            event.preventDefault();
            const items = resultsRef.current;
            const keySnapshot = activeQueryNodeKeyRef.current;
            commitSelection(items[selectedIndexRef.current], keySnapshot);
            return true;
          }
          if (event.key === 'Escape') {
            event.preventDefault();
            closePalette(true, { selectReplacement: true });
            return true;
          }
        }

        // Palette closed: only intercept '@'
        if (isOpenRef.current) {
          return false;
        }
        if (event.key !== '@' || shouldIgnoreAtTrigger(event)) {
          return false;
        }
        console.log('[MentionPalette] @ key pressed');
        event.preventDefault();
        editor.update(() => {
          const queryNode = $createMentionQueryNode();
          const key = queryNode.getKey();
          const selection = $getSelection();
          if ($isRangeSelection(selection)) {
            selection.insertNodes([queryNode]);
            const firstChild = queryNode.getFirstChild();
            if ($isTextNode(firstChild)) {
              firstChild.select();
            } else {
              queryNode.select();
            }
          } else {
            $getRoot().append(queryNode);
            queryNode.select();
          }
          activeQueryNodeKeyRef.current = key;
          isOpenRef.current = true;
          queryRef.current = '';
          selectedIndexRef.current = 0;

          setIsOpen(true);
          setQuery('');
          setSelectedIndex(0);

          setAnchorRect(
            editor.getRootElement()?.getBoundingClientRect() ?? null
          );

          requestAnimationFrame(() => {
            if (!isOpenRef.current) return;
            setAnchorRect(getAnchorRectForQueryKey(editor, key));
          });
        });
        return true;
      },
      COMMAND_PRIORITY_NORMAL
    );
  }, [closePalette, commitSelection, editor, menuEnabled]);

  if (!menuEnabled || !isOpen || !anchorRect) {
    return null;
  }

  const top = anchorRect.top - 8;
  const left = anchorRect.left;

  const handleClickResult = (
    result: MentionResult,
    keyOverride?: NodeKey | null
  ) => {
    commitSelection(result, keyOverride);
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
                  handleClickResult(result, activeQueryNodeKeyRef.current);
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
      </div>
    </div>
  );

  return createPortal(root, document.body);
};
