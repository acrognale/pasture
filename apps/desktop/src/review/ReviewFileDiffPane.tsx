import type { GetRepoDiffParams } from '@pasture/protocol';
import { DiffEditor } from '@monaco-editor/react';
import { useQuery } from '@tanstack/react-query';
import { useMemo, useState } from 'react';
import type * as monaco from 'monaco-editor';
import { Button } from '~/components/ui/button';
import { Input } from '~/components/ui/input';
import { Textarea } from '~/components/ui/textarea';
import { Codex } from '~/codex/client';
import { cn } from '~/lib/utils';

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
  repoParams: GetRepoDiffParams;
  reviewKey: string;
  filePath: string;
  oldPath: string | null;
  newPath: string | null;
  commentableLines: number[];
};

export type ReviewFileDiffPaneProps = TurnFileContentsParams | RepoFileContentsParams;

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

export function ReviewFileDiffPane(props: ReviewFileDiffPaneProps) {
  const language = useMemo(
    () => detectMonacoLanguage(props.filePath),
    [props.filePath]
  );

  const query = useQuery({
    queryKey: ['reviewFile', props.mode, props.reviewKey, props.filePath] as const,
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

  const [selectedLineNumber, setSelectedLineNumber] = useState<number>(1);
  const [draftText, setDraftText] = useState('');

  const actions = useReviewComments((state) => state.actions);
  const commentsForReviewKey = useReviewComments(
    (state) => state.commentsByReviewKey[props.reviewKey] ?? EMPTY_REVIEW_COMMENTS
  );

  const fileComments = useMemo(
    () =>
      commentsForReviewKey
        .filter((comment) => comment.filePath === props.filePath)
        .slice()
        .sort((a, b) => a.lineNumber - b.lineNumber),
    [commentsForReviewKey, props.filePath]
  );

  const commentableLineSet = useMemo(
    () => new Set(props.commentableLines),
    [props.commentableLines]
  );
  const canComment = commentableLineSet.has(selectedLineNumber);

  const handleEditorMount = (
    _editor: monaco.editor.IStandaloneDiffEditor
  ) => {
    const modifiedEditor = _editor.getModifiedEditor();
    const updateSelection = () => {
      const pos = modifiedEditor.getPosition();
      if (pos?.lineNumber) {
        setSelectedLineNumber(pos.lineNumber);
      }
    };
    updateSelection();
    modifiedEditor.onDidChangeCursorPosition(updateSelection);
  };

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
        <div className="flex items-center gap-2">
          <span className="text-xs text-muted-foreground">Line</span>
          <Input
            type="number"
            className="h-7 w-20"
            min={1}
            value={Number.isFinite(selectedLineNumber) ? selectedLineNumber : 1}
            onChange={(event) => {
              const next = parseInt(event.target.value, 10);
              setSelectedLineNumber(Number.isFinite(next) ? next : 1);
            }}
          />
          <Button
            type="button"
            size="sm"
            className="h-7"
            disabled={!canComment || !draftText.trim()}
            onClick={() => {
              const text = draftText.trim();
              if (!text) {
                return;
              }
              if (!commentableLineSet.has(selectedLineNumber)) {
                return;
              }
              actions.addComment({
                reviewKey: props.reviewKey,
                filePath: props.filePath,
                side: 'modified',
                lineNumber: selectedLineNumber,
                text,
              });
              setDraftText('');
            }}
          >
            Add comment
          </Button>
        </div>
      </div>

      <div className="flex min-h-0 flex-1">
        <div className="min-h-0 flex-1 border-r border-border/60">
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
              minimap: { enabled: false },
              scrollBeyondLastLine: false,
              wordWrap: 'off',
              renderWhitespace: 'selection',
              glyphMargin: true,
            }}
          />
        </div>

        <aside className="flex w-96 min-w-0 flex-col gap-3 p-4">
          <div>
            <p className="text-xs font-semibold text-foreground">Comment</p>
            <p
              className={cn(
                'mt-1 text-xs',
                canComment ? 'text-muted-foreground' : 'text-error-foreground'
              )}
            >
              {canComment
                ? 'Comments are allowed on changed lines.'
                : 'Select a changed line to comment.'}
            </p>
          </div>

          <Textarea
            value={draftText}
            rows={4}
            className="resize-none"
            placeholder="Write a review comment…"
            onChange={(event) => setDraftText(event.target.value)}
          />

          <div className="flex flex-col gap-2">
            <p className="text-xs font-semibold text-foreground">
              Comments ({fileComments.length})
            </p>
            {fileComments.length ? (
              <div className="flex flex-col gap-2">
                {fileComments.map((comment) => (
                  <div
                    key={comment.id}
                    className="rounded-md border border-border/60 bg-background p-3"
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-[10px] text-muted-foreground">
                        Line {comment.lineNumber}
                      </span>
                      <Button
                        type="button"
                        size="sm"
                        variant="ghost"
                        className="h-6 px-1 text-[10px]"
                        onClick={() => actions.removeComment(comment.id)}
                      >
                        Remove
                      </Button>
                    </div>
                    <p className="mt-2 whitespace-pre-wrap text-xs text-foreground">
                      {comment.text}
                    </p>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-xs text-muted-foreground">
                No comments for this file yet.
              </p>
            )}
          </div>

          {query.isError ? (
            <p className="text-xs text-error-foreground">
              Failed to load file contents.
            </p>
          ) : null}
        </aside>
      </div>
    </div>
  );
}
