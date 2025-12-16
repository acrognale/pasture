import { DiffEditor } from '@monaco-editor/react';
import type { GetRepoDiffParams } from '@pasture/protocol';
import { useQuery } from '@tanstack/react-query';
import type * as monaco from 'monaco-editor';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Codex } from '~/codex/client';

import { EMPTY_REVIEW_COMMENTS, useReviewComments } from './commentsStore';

type TurnFileContentsParams = {
  mode: 'turn';
  workspacePath: string;
  conversationId: string;
  reviewKey: string;
  baseEventId: string | null;
  targetEventId: string;
  filePath: string;
  oldPath: string | null;
  newPath: string | null;
  commentableLines: number[];
};

type RepoFileContentsParams = {
  mode: 'repo';
  workspacePath: string;
  conversationId: string;
  repoParams: GetRepoDiffParams;
  reviewKey: string;
  filePath: string;
  oldPath: string | null;
  newPath: string | null;
  commentableLines: number[];
};

export type ReviewFileDiffPaneProps =
  | TurnFileContentsParams
  | RepoFileContentsParams;

type MonacoApi = typeof import('monaco-editor');

type ReviewFileDiffPaneReveal = {
  lineNumber: number;
  commentId?: string;
};

const detectMonacoLanguage = (filePath: string): string | undefined => {
  const filename = filePath.split('/').pop() ?? '';
  const ext = filename.split('.').pop()?.toLowerCase();
  switch (ext) {
    case 'ts':
    case 'mts':
    case 'cts':
      return 'typescript';
    case 'tsx':
      return 'typescript';
    case 'js':
    case 'mjs':
    case 'cjs':
      return 'javascript';
    case 'jsx':
      return 'javascript';
    case 'json':
      return 'json';
    case 'css':
      return 'css';
    case 'html':
    case 'htm':
      return 'html';
    case 'md':
    case 'mdx':
      return 'markdown';
    case 'rs':
      return 'rust';
    case 'py':
      return 'python';
    case 'go':
      return 'go';
    case 'toml':
      return 'toml';
    case 'yaml':
    case 'yml':
      return 'yaml';
    default:
      return undefined;
  }
};

export function ReviewFileDiffPane(
  props: ReviewFileDiffPaneProps & {
    reveal?: ReviewFileDiffPaneReveal | null;
    onRevealHandled?: () => void;
    onFirstCommentAdded?: (reviewKey: string) => void;
  }
) {
  const reveal = props.reveal;
  const onRevealHandled = props.onRevealHandled;
  const onFirstCommentAdded = props.onFirstCommentAdded;

  const language = useMemo(
    () => detectMonacoLanguage(props.filePath),
    [props.filePath]
  );

  const query = useQuery({
    queryKey: [
      'reviewFile',
      props.mode,
      props.reviewKey,
      props.filePath,
    ] as const,
    queryFn: async () => {
      if (props.mode === 'turn') {
        return await Codex.getTurnReviewFileContents({
          conversationId: props.conversationId,
          baseEventId: props.baseEventId,
          targetEventId: props.targetEventId,
          oldPath: props.oldPath,
          newPath: props.newPath,
        });
      }

      const repoParams = props.repoParams;
      return await Codex.getRepoReviewFileContents({
        workspacePath: repoParams.workspacePath,
        baseRef: repoParams.baseRef,
        targetRef: repoParams.targetRef ?? null,
        includeWorktree: repoParams.includeWorktree,
        oldPath: props.oldPath,
        newPath: props.newPath,
      });
    },
    refetchOnWindowFocus: false,
  });

  const [hoveredLineNumber, setHoveredLineNumber] = useState<number | null>(
    null
  );
  const [draftLineNumber, setDraftLineNumber] = useState<number | null>(null);
  const [editorVersion, setEditorVersion] = useState(0);

  const actions = useReviewComments((state) => state.actions);
  const commentsForReviewKey = useReviewComments(
    (state) =>
      state.commentsByReviewKey[props.reviewKey] ?? EMPTY_REVIEW_COMMENTS
  );
  const reviewCommentCount = commentsForReviewKey.length;

  const fileComments = useMemo(() => {
    return commentsForReviewKey
      .filter((comment) => comment.filePath === props.filePath)
      .slice()
      .sort((a, b) => a.lineNumber - b.lineNumber);
  }, [commentsForReviewKey, props.filePath]);

  const commentsByLineNumber = useMemo(() => {
    const map = new Map<number, typeof fileComments>();
    for (const comment of fileComments) {
      const existing = map.get(comment.lineNumber);
      if (existing) {
        existing.push(comment);
      } else {
        map.set(comment.lineNumber, [comment]);
      }
    }
    return map;
  }, [fileComments]);

  const commentableLineSet = useMemo(
    () => new Set(props.commentableLines),
    [props.commentableLines]
  );

  const monacoRef = useRef<MonacoApi | null>(null);
  const diffEditorRef = useRef<monaco.editor.IStandaloneDiffEditor | null>(
    null
  );
  const modifiedEditorRef = useRef<monaco.editor.IStandaloneCodeEditor | null>(
    null
  );

  const hoveredLineRef = useRef<number | null>(null);

  const hoverDisposablesRef = useRef<monaco.IDisposable[]>([]);
  const hoverDecorationIdsRef = useRef<string[]>([]);
  const draftTextByLineRef = useRef(new Map<number, string>());
  const viewZonesRef = useRef<
    Array<{
      lineNumber: number;
      zoneId: string;
      zone: monaco.editor.IViewZone;
      domNode: HTMLDivElement;
      resizeObserver?: ResizeObserver;
    }>
  >([]);
  const revealDecorationIdsRef = useRef<string[]>([]);
  const revealTimeoutRef = useRef<number | null>(null);

  useEffect(() => {
    hoveredLineRef.current = hoveredLineNumber;
  }, [hoveredLineNumber]);

  const handleEditorMount = useCallback(
    (editor: monaco.editor.IStandaloneDiffEditor, monacoApi: MonacoApi) => {
      monacoRef.current = monacoApi;
      diffEditorRef.current = editor;
      modifiedEditorRef.current = editor.getModifiedEditor();
      setEditorVersion((version) => version + 1);
    },
    []
  );

  const openDraftForLine = useCallback(
    (lineNumber: number) => {
      if (!commentableLineSet.has(lineNumber)) {
        return;
      }

      setDraftLineNumber(lineNumber);
      draftTextByLineRef.current.set(lineNumber, '');

      const modifiedEditor = modifiedEditorRef.current;
      modifiedEditor?.revealLineInCenterIfOutsideViewport(lineNumber);
    },
    [commentableLineSet]
  );

  const turnConversationId =
    props.mode === 'turn' ? props.conversationId : null;
  const turnBaseEventId = props.mode === 'turn' ? props.baseEventId : null;
  const turnTargetEventId = props.mode === 'turn' ? props.targetEventId : null;
  const repoParams = props.mode === 'repo' ? props.repoParams : null;

  const navigation = useMemo(() => {
    if (props.mode === 'turn') {
      return {
        mode: 'turn',
        workspacePath: props.workspacePath,
        conversationId: turnConversationId as string,
        reviewKey: props.reviewKey,
        baseEventId: turnBaseEventId,
        targetEventId: turnTargetEventId as string,
        filePath: props.filePath,
        oldPath: props.oldPath,
        newPath: props.newPath,
        commentableLines: props.commentableLines,
      } as const;
    }

    return {
      mode: 'repo',
      workspacePath: props.workspacePath,
      conversationId: props.conversationId,
      repoParams: repoParams as NonNullable<typeof repoParams>,
      reviewKey: props.reviewKey,
      filePath: props.filePath,
      oldPath: props.oldPath,
      newPath: props.newPath,
      commentableLines: props.commentableLines,
    } as const;
  }, [
    props.mode,
    props.workspacePath,
    props.reviewKey,
    props.filePath,
    props.oldPath,
    props.newPath,
    props.commentableLines,
    props.conversationId,
    repoParams,
    turnBaseEventId,
    turnConversationId,
    turnTargetEventId,
  ]);

  const renderCommentZone = useCallback(
    (options: {
      container: HTMLDivElement;
      lineNumber: number;
      comments: typeof fileComments;
      isDraftOpen: boolean;
      onRequestLayout: () => void;
    }) => {
      const { container, lineNumber, comments, isDraftOpen, onRequestLayout } =
        options;

      container.replaceChildren();

      const outer = document.createElement('div');
      outer.className =
        'rounded-md border border-border/60 bg-background p-3 text-xs text-foreground';

      outer.addEventListener('mousedown', (event) => event.stopPropagation());
      outer.addEventListener('click', (event) => event.stopPropagation());

      const header = document.createElement('div');
      header.className = 'flex items-center justify-between gap-2';

      const title = document.createElement('span');
      title.className = 'text-xs font-semibold text-foreground';
      title.textContent = `Line ${lineNumber}`;

      header.appendChild(title);
      outer.appendChild(header);

      if (comments.length) {
        const list = document.createElement('div');
        list.className = 'mt-2 flex flex-col gap-2';

        for (const comment of comments) {
          const card = document.createElement('div');
          card.className =
            'rounded-md border border-border/60 bg-background/95 p-2';

          const text = document.createElement('p');
          text.className = 'whitespace-pre-wrap text-xs text-foreground';
          text.textContent = comment.text;

          const footer = document.createElement('div');
          footer.className = 'mt-2 flex items-center justify-end';

          const remove = document.createElement('button');
          remove.type = 'button';
          remove.className =
            'h-6 rounded-md px-2 text-xs text-muted-foreground hover:bg-muted/60 hover:text-foreground';
          remove.textContent = 'Remove';
          remove.addEventListener('mousedown', (event) => {
            event.preventDefault();
            event.stopPropagation();
          });
          remove.addEventListener('click', (event) => {
            event.preventDefault();
            event.stopPropagation();
            actions.removeComment(comment.id);
          });

          footer.appendChild(remove);

          card.appendChild(text);
          card.appendChild(footer);
          list.appendChild(card);
        }

        outer.appendChild(list);
      }

      if (isDraftOpen) {
        const form = document.createElement('form');
        form.className = 'mt-3 flex flex-col gap-3';

        const textarea = document.createElement('textarea');
        textarea.rows = 3;
        textarea.placeholder = 'Write a review comment…';
        textarea.className =
          'w-full resize-none rounded-md border border-input bg-background px-3 py-2 text-xs text-foreground shadow-xs focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50';
        textarea.value = draftTextByLineRef.current.get(lineNumber) ?? '';
        textarea.addEventListener('input', () => {
          draftTextByLineRef.current.set(lineNumber, textarea.value);
        });
        textarea.addEventListener('keydown', (event) => {
          if (event.key === 'Enter' && (event.metaKey || event.ctrlKey)) {
            event.preventDefault();
            form.requestSubmit();
          }
        });

        const actionsRow = document.createElement('div');
        actionsRow.className = 'flex items-center justify-end gap-2';

        const cancel = document.createElement('button');
        cancel.type = 'button';
        cancel.className =
          'h-8 rounded-md px-3 text-xs text-muted-foreground hover:bg-muted/60 hover:text-foreground';
        cancel.textContent = 'Cancel';
        cancel.addEventListener('mousedown', (event) => {
          event.preventDefault();
          event.stopPropagation();
        });
        cancel.addEventListener('click', (event) => {
          event.preventDefault();
          event.stopPropagation();
          setDraftLineNumber(null);
        });

        const save = document.createElement('button');
        save.type = 'submit';
        save.className =
          'h-8 rounded-md bg-primary px-3 text-xs text-primary-foreground hover:brightness-110 disabled:opacity-50';
        save.textContent = 'Save comment';

        const updateSaveDisabled = () => {
          const value = draftTextByLineRef.current.get(lineNumber) ?? '';
          save.toggleAttribute('disabled', !value.trim());
        };
        updateSaveDisabled();
        textarea.addEventListener('input', updateSaveDisabled);

        form.addEventListener('submit', (event) => {
          event.preventDefault();
          event.stopPropagation();
          const text = (
            draftTextByLineRef.current.get(lineNumber) ?? ''
          ).trim();
          if (!text) {
            return;
          }
          const wasFirst = reviewCommentCount === 0;
          actions.addComment({
            reviewKey: props.reviewKey,
            filePath: props.filePath,
            side: 'modified',
            lineNumber,
            text,
            navigation,
          });
          setDraftLineNumber(null);
          if (wasFirst) {
            onFirstCommentAdded?.(props.reviewKey);
          }
        });

        actionsRow.appendChild(cancel);
        actionsRow.appendChild(save);

        form.appendChild(textarea);
        form.appendChild(actionsRow);
        outer.appendChild(form);

        requestAnimationFrame(() => textarea.focus());
      }

      container.appendChild(outer);
      onRequestLayout();
    },
    [
      actions,
      navigation,
      onFirstCommentAdded,
      props.filePath,
      props.reviewKey,
      reviewCommentCount,
    ]
  );

  useEffect(() => {
    const lineNumber = reveal?.lineNumber ?? null;
    if (!lineNumber) {
      return;
    }

    const modifiedEditor = modifiedEditorRef.current;
    const monacoApi = monacoRef.current;
    if (!modifiedEditor || !monacoApi) {
      return;
    }

    modifiedEditor.revealLineInCenter(lineNumber);
    modifiedEditor.setPosition({ lineNumber, column: 1 });
    modifiedEditor.setSelection(
      new monacoApi.Range(lineNumber, 1, lineNumber, 1)
    );
    modifiedEditor.focus();

    revealDecorationIdsRef.current = modifiedEditor.deltaDecorations(
      revealDecorationIdsRef.current,
      [
        {
          range: new monacoApi.Range(lineNumber, 1, lineNumber, 1),
          options: {
            isWholeLine: true,
            className: 'monaco-review-comment-reveal-line',
          },
        },
      ]
    );

    if (revealTimeoutRef.current != null) {
      window.clearTimeout(revealTimeoutRef.current);
    }
    revealTimeoutRef.current = window.setTimeout(() => {
      const editor = modifiedEditorRef.current;
      if (!editor) return;
      revealDecorationIdsRef.current = editor.deltaDecorations(
        revealDecorationIdsRef.current,
        []
      );
      revealTimeoutRef.current = null;
    }, 1400);

    onRevealHandled?.();
    return () => {
      if (revealTimeoutRef.current != null) {
        window.clearTimeout(revealTimeoutRef.current);
        revealTimeoutRef.current = null;
      }
      const editor = modifiedEditorRef.current;
      if (editor) {
        revealDecorationIdsRef.current = editor.deltaDecorations(
          revealDecorationIdsRef.current,
          []
        );
      }
    };
  }, [editorVersion, onRevealHandled, reveal?.commentId, reveal?.lineNumber]);

  useEffect(() => {
    const modifiedEditor = modifiedEditorRef.current;
    const monacoApi = monacoRef.current;
    if (!modifiedEditor || !monacoApi) {
      return;
    }

    hoverDisposablesRef.current.forEach((d) => d.dispose());
    hoverDisposablesRef.current = [];
    hoverDecorationIdsRef.current = modifiedEditor.deltaDecorations(
      hoverDecorationIdsRef.current,
      []
    );

    const updateHoveredLine = (lineNumber: number | null) => {
      const resolved =
        lineNumber != null && commentableLineSet.has(lineNumber)
          ? lineNumber
          : null;

      if (hoveredLineRef.current === resolved) {
        return;
      }

      hoveredLineRef.current = resolved;
      setHoveredLineNumber(resolved);

      hoverDecorationIdsRef.current = modifiedEditor.deltaDecorations(
        hoverDecorationIdsRef.current,
        resolved
          ? [
              {
                range: new monacoApi.Range(resolved, 1, resolved, 1),
                options: {
                  isWholeLine: true,
                  glyphMarginClassName: 'monaco-review-comment-glyph',
                },
              },
            ]
          : []
      );
    };

    hoverDisposablesRef.current.push(
      modifiedEditor.onMouseMove((event) => {
        const lineNumber = event.target.position?.lineNumber ?? null;
        updateHoveredLine(lineNumber);
      }),
      modifiedEditor.onMouseLeave(() => updateHoveredLine(null)),
      modifiedEditor.onMouseDown((event) => {
        if (
          event.target.type !==
          monacoApi.editor.MouseTargetType.GUTTER_GLYPH_MARGIN
        ) {
          return;
        }
        const lineNumber = event.target.position?.lineNumber ?? null;
        if (lineNumber == null) {
          return;
        }
        if (!commentableLineSet.has(lineNumber)) {
          return;
        }
        openDraftForLine(lineNumber);
      })
    );

    return () => {
      hoverDisposablesRef.current.forEach((d) => d.dispose());
      hoverDisposablesRef.current = [];
      hoverDecorationIdsRef.current = modifiedEditor.deltaDecorations(
        hoverDecorationIdsRef.current,
        []
      );
    };
  }, [
    commentableLineSet,
    editorVersion,
    openDraftForLine,
    props.filePath,
    props.reviewKey,
  ]);

  const syncViewZones = useCallback(() => {
    const modifiedEditor = modifiedEditorRef.current;
    if (!modifiedEditor) {
      return;
    }

    const zonesToRender = new Set<number>();
    for (const lineNumber of commentsByLineNumber.keys()) {
      zonesToRender.add(lineNumber);
    }
    if (draftLineNumber != null) {
      zonesToRender.add(draftLineNumber);
    }

    const lineNumbers = [...zonesToRender]
      .filter((lineNumber) => commentableLineSet.has(lineNumber))
      .sort((a, b) => a - b);

    const previousZones = viewZonesRef.current;
    viewZonesRef.current = [];

    modifiedEditor.changeViewZones((accessor) => {
      for (const entry of previousZones) {
        entry.resizeObserver?.disconnect();
        accessor.removeZone(entry.zoneId);
      }

      for (const lineNumber of lineNumbers) {
        // Zone container - Monaco sizes this to heightInPx
        const zoneDom = document.createElement('div');
        zoneDom.className = 'monaco-review-view-zone';

        // Inner content node - we measure THIS for height
        const contentDom = document.createElement('div');
        contentDom.className = 'monaco-review-view-zone-content';
        zoneDom.appendChild(contentDom);

        // Remove any stale inline width style
        zoneDom.style.width = '100%';

        const comments = commentsByLineNumber.get(lineNumber) ?? [];
        const isDraftOpen = draftLineNumber === lineNumber;

        // Track current height for this zone
        let currentHeight = 200; // Start with reasonable initial height

        const zone: monaco.editor.IViewZone = {
          afterLineNumber: lineNumber,
          get heightInPx() {
            return currentHeight;
          },
          domNode: zoneDom,
          suppressMouseDown: false,
        };

        const zoneId = accessor.addZone(zone);

        const updateZoneHeight = () => {
          // Measure the CONTENT node, not the zone container
          // scrollHeight is more reliable than getBoundingClientRect
          const next = Math.max(1, Math.ceil(contentDom.scrollHeight));
          if (Math.abs(currentHeight - next) < 1) {
            return;
          }
          currentHeight = next;
          modifiedEditor.changeViewZones((innerAccessor) => {
            innerAccessor.layoutZone(zoneId);
          });
        };

        // Use ResizeObserver on the CONTENT node
        const resizeObserver = new ResizeObserver(() => {
          updateZoneHeight();
        });
        resizeObserver.observe(contentDom);

        // Render into the content node, not the zone container
        renderCommentZone({
          container: contentDom,
          lineNumber,
          comments,
          isDraftOpen,
          onRequestLayout: updateZoneHeight,
        });

        // Double-rAF to ensure content is painted before measuring
        requestAnimationFrame(() => {
          requestAnimationFrame(() => {
            updateZoneHeight();
          });
        });

        viewZonesRef.current.push({
          lineNumber,
          zoneId,
          zone,
          domNode: zoneDom,
          resizeObserver,
        });
      }
    });
  }, [
    commentableLineSet,
    commentsByLineNumber,
    draftLineNumber,
    renderCommentZone,
  ]);

  useEffect(() => {
    syncViewZones();
  }, [editorVersion, syncViewZones]);

  // Sync view zones after diff computation completes
  useEffect(() => {
    const diffEditor = diffEditorRef.current;
    if (!diffEditor) {
      return;
    }
    const disposable = diffEditor.onDidUpdateDiff(() => {
      syncViewZones();
    });
    return () => disposable.dispose();
  }, [syncViewZones]);

  useEffect(() => {
    return () => {
      const modifiedEditor = modifiedEditorRef.current;
      if (!modifiedEditor) {
        return;
      }
      const zones = viewZonesRef.current;
      viewZonesRef.current = [];
      modifiedEditor.changeViewZones((accessor) => {
        zones.forEach((entry) => {
          entry.resizeObserver?.disconnect();
          accessor.removeZone(entry.zoneId);
        });
      });
    };
  }, []);

  const baseText = query.data?.baseText ?? '';
  const targetText = query.data?.targetText ?? '';

  return (
    <div className="flex h-full min-h-0 w-full flex-col bg-background text-foreground">
      <div className="flex items-center justify-between gap-3 border-b border-border/60 px-4 py-3">
        <div className="min-w-0">
          <p className="truncate text-sm font-semibold">{props.filePath}</p>
          <p className="text-xs text-muted-foreground">
            {props.commentableLines.length} changed line
            {props.commentableLines.length === 1 ? '' : 's'}
          </p>
        </div>
        <p className="text-xs text-muted-foreground">
          {fileComments.length} comment{fileComments.length === 1 ? '' : 's'}
        </p>
      </div>

      <div className="flex min-h-0 flex-1">
        <div className="min-h-0 flex-1">
          <DiffEditor
            height="100%"
            original={baseText}
            modified={targetText}
            language={language}
            loading={
              <div className="p-4 text-xs text-muted-foreground">
                Loading file contents…
              </div>
            }
            onMount={handleEditorMount}
            options={{
              readOnly: true,
              renderSideBySide: true,
              useInlineViewWhenSpaceIsLimited: false,
              minimap: { enabled: false },
              scrollBeyondLastLine: false,
              wordWrap: 'off',
              renderWhitespace: 'selection',
              glyphMargin: true,
            }}
          />
        </div>
      </div>

      {query.isError ? (
        <div className="border-t border-border/60 px-4 py-2">
          <p className="text-xs text-error-foreground">
            Failed to load file contents.
          </p>
        </div>
      ) : null}
    </div>
  );
}
