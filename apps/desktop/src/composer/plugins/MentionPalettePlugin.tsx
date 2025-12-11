import { useLexicalComposerContext } from '@lexical/react/LexicalComposerContext';
import {
  LexicalTypeaheadMenuPlugin,
  MenuOption,
  type TypeaheadMenuPluginProps,
  useBasicTypeaheadTriggerMatch,
} from '@lexical/react/LexicalTypeaheadMenuPlugin';
import {
  $createTextNode,
  $getRoot,
  $getSelection,
  $isRangeSelection,
} from 'lexical';
import { useCallback, useEffect, useMemo, useState } from 'react';
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

class MentionOption extends MenuOption {
  result: MentionResult;

  constructor(result: MentionResult) {
    super(result.id);
    this.result = result;
  }
}

export const MentionPalettePlugin = ({
  workspacePath,
  disabled,
  ariaBusy,
  onChange,
}: Props) => {
  const [editor] = useLexicalComposerContext();
  const menuEnabled =
    !disabled && !ariaBusy && Boolean(workspacePath?.trim().length);

  const [threads, setThreads] = useState<ThreadMention[]>([]);
  const [fileResults, setFileResults] = useState<FileMention[]>([]);
  const [symbolResults, setSymbolResults] = useState<SymbolMention[]>([]);
  const [query, setQuery] = useState<string | null>(null);

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
    if (!menuEnabled) {
      return;
    }
    const trimmed = query?.trim() ?? '';
    if (!trimmed) return;
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
  }, [menuEnabled, query, workspacePath]);

  const filteredThreads = useMemo(() => {
    const trimmed = (query ?? '').trim().toLowerCase();
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
    const normalizedQuery = (query ?? '').trim();
    const hasQuery = normalizedQuery.length > 0;
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

  const commitSelection = useCallback(
    (
      result: MentionResult | undefined,
      textNodeContainingQuery: Parameters<
        TypeaheadMenuPluginProps<MentionOption>['onSelectOption']
      >[1]
    ) => {
      if (!result) {
        return;
      }
      editor.update(() => {
        const mentionNode = createMentionNode(result.mention);
        if (!mentionNode) {
          return;
        }
        const trailing = $createTextNode(' ');

        if (textNodeContainingQuery) {
          textNodeContainingQuery.replace(mentionNode);
          mentionNode.insertAfter(trailing);
          trailing.select();
          return;
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
    },
    [editor, onChange]
  );

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

  const mentionOptions = useMemo(
    () => results.map((result) => new MentionOption(result)),
    [results]
  );

  const checkForMentionTrigger = useBasicTypeaheadTriggerMatch('@', {
    minLength: 0,
    maxLength: 128,
    allowWhitespace: true,
  });

  const handleMentionSelect = useCallback<
    TypeaheadMenuPluginProps<MentionOption>['onSelectOption']
  >(
    (option, textNodeContainingQuery, closeMenu) => {
      commitSelection(option.result, textNodeContainingQuery);
      closeMenu();
    },
    [commitSelection]
  );

  const mentionMenuRender: TypeaheadMenuPluginProps<MentionOption>['menuRenderFn'] =
    useCallback(
      (
        anchorElementRef,
        { selectedIndex, selectOptionAndCleanUp, setHighlightedIndex, options }
      ) => {
        if (!anchorElementRef.current) {
          return null;
        }

        return createPortal(
          <div className="absolute left-0 bottom-full mb-4 -translate-y-2 transform min-w-[320px] max-w-[560px] w-max rounded-md border border-border bg-popover shadow-sm pointer-events-auto z-60">
            <div className="max-h-80 overflow-y-auto py-1">
              {options.length === 0 ? (
                <div className="px-3 py-1.5 text-xs text-muted-foreground">
                  No matches.
                </div>
              ) : (
                options.map((option, index) => {
                  const { result } = option;
                  return (
                    <button
                      type="button"
                      key={option.key}
                      ref={(element) => option.setRefElement(element)}
                      role="option"
                      aria-selected={selectedIndex === index}
                      className={cn(
                        'flex w-full flex-col items-start gap-0.5 px-3 py-1.5 text-left text-transcript-micro leading-transcript text-foreground transition-colors whitespace-normal',
                        selectedIndex === index
                          ? 'bg-accent text-accent-foreground'
                          : 'hover:bg-muted'
                      )}
                      onMouseEnter={() => setHighlightedIndex(index)}
                      onClick={() => selectOptionAndCleanUp(option)}
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
                  );
                })
              )}
            </div>
          </div>,
          anchorElementRef.current
        );
      },
      []
    );

  if (!menuEnabled) {
    return null;
  }

  return (
    <LexicalTypeaheadMenuPlugin
      triggerFn={checkForMentionTrigger}
      onQueryChange={setQuery}
      onSelectOption={handleMentionSelect}
      menuRenderFn={mentionMenuRender}
      options={mentionOptions}
      anchorClassName="z-50"
      preselectFirstItem
    />
  );
};
