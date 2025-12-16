import type { GetRepoDiffParams } from '@pasture/protocol';
import { useEffect, useMemo } from 'react';

import { Button } from '~/components/ui/button';
import { usePanelManagerStore } from '~/panels/PanelManagerProvider';
import { usePanelRuntime } from '~/panels/PanelRuntimeContext';
import { cn } from '~/lib/utils';
import { EMPTY_REVIEW_COMMENTS, useReviewComments } from '~/review/commentsStore';
import { useConversationPanelServices } from './ConversationPanelServices';

export type ConversationReviewCommentsPanelParams =
  | {
      mode: 'turn';
      workspacePath: string;
      conversationId: string;
      reviewKey?: string | null;
    }
  | {
      mode: 'repo';
      workspacePath: string;
      conversationId: string;
      repoParams: GetRepoDiffParams;
      reviewKey?: string | null;
    };

type ConversationReviewCommentsPanelState = {
  reviewKey: string | null;
};

type ConversationReviewCommentsPanelReveal = {
  reviewKey?: string | null;
};

export function ConversationReviewCommentsPanel() {
  const runtime = usePanelRuntime();
  const panelManagerStore = usePanelManagerStore();
  const services = useConversationPanelServices();
  const params = runtime.params as ConversationReviewCommentsPanelParams;
  const state = runtime.state as ConversationReviewCommentsPanelState | null;
  const reveal = runtime.reveal as ConversationReviewCommentsPanelReveal | null;

  const actions = useReviewComments((store) => store.actions);

  useEffect(() => {
    if (!reveal) return;
    if (!Object.prototype.hasOwnProperty.call(reveal, 'reviewKey')) return;
    runtime.setState({ reviewKey: reveal.reviewKey ?? null });
    runtime.consumeReveal();
  }, [reveal, runtime]);

  useEffect(() => {
    if (state?.reviewKey != null) return;
    if (params.reviewKey === undefined) return;
    runtime.setState({ reviewKey: params.reviewKey ?? null });
  }, [params.reviewKey, runtime, state?.reviewKey]);

  const reviewKey = state?.reviewKey ?? params.reviewKey ?? null;

  const comments = useReviewComments((store) =>
    reviewKey
      ? (store.commentsByReviewKey[reviewKey] ?? EMPTY_REVIEW_COMMENTS)
      : EMPTY_REVIEW_COMMENTS
  );

  const sortedComments = useMemo(() => {
    return comments
      .slice()
      .sort((a, b) =>
        a.filePath === b.filePath
          ? a.lineNumber === b.lineNumber
            ? a.createdAt.localeCompare(b.createdAt)
            : a.lineNumber - b.lineNumber
          : a.filePath.localeCompare(b.filePath)
      );
  }, [comments]);

  const grouped = useMemo(() => {
    const groups = new Map<string, typeof sortedComments>();
    for (const comment of sortedComments) {
      const existing = groups.get(comment.filePath);
      if (existing) {
        existing.push(comment);
      } else {
        groups.set(comment.filePath, [comment]);
      }
    }
    return [...groups.entries()];
  }, [sortedComments]);

  const totalCount = sortedComments.length;
  const feedbackPrompt = useMemo(() => {
    if (!reviewKey || totalCount === 0) return null;
    const segments = sortedComments.map((comment) => {
      return `- ${comment.filePath} (line ${comment.lineNumber}): ${comment.text}`;
    });
    const subject = params.mode === 'repo' ? 'these changes' : 'this diff';
    return `Here is my consolidated review of ${subject}:\n${segments.join('\n')}\n\nPlease address each comment before continuing.`;
  }, [params.mode, reviewKey, sortedComments, totalCount]);

  return (
    <div className="flex h-full w-full flex-col bg-background text-foreground">
      <div className="border-b border-border/60 px-6 py-4">
        <div className="flex items-start justify-between gap-4">
          <div className="min-w-0">
            <p className="text-sm font-semibold">Comments</p>
            <p className="mt-1 text-xs text-muted-foreground">
              {reviewKey ? (
                <>
                  {totalCount} comment{totalCount === 1 ? '' : 's'}
                </>
              ) : (
                'Open a diff to start reviewing.'
              )}
            </p>
          </div>
          <Button
            type="button"
            size="sm"
            className="h-7"
            disabled={!feedbackPrompt}
            onClick={() => {
              if (!feedbackPrompt) return;
              services.insertFeedbackPrompt(feedbackPrompt);
              if (reviewKey) {
                actions.clearReviewKey(reviewKey);
              }
            }}
          >
            Submit
          </Button>
        </div>
      </div>

      <div className="min-h-0 flex-1 overflow-auto">
        {reviewKey && grouped.length ? (
          <div className="flex flex-col gap-4 p-4">
            {grouped.map(([filePath, fileComments]) => (
              <div key={filePath} className="flex flex-col gap-2">
                <div className="flex items-center justify-between gap-2 px-2">
                  <p className="truncate text-xs font-semibold text-foreground">
                    {filePath}
                  </p>
                  <span className="shrink-0 text-xs text-muted-foreground">
                    {fileComments.length}
                  </span>
                </div>

                <div className="flex flex-col gap-2">
                  {fileComments.map((comment) => (
                    <div
                      key={comment.id}
                      className="group rounded-md border border-border/60 bg-background px-3 py-2 transition-colors hover:border-border/80 hover:bg-muted/40"
                    >
                      <button
                        type="button"
                        className={cn(
                          'w-full text-left',
                          'cursor-pointer rounded-sm outline-none focus-visible:ring-2 focus-visible:ring-ring/40'
                        )}
                        onClick={() => {
                          const openActions = panelManagerStore.getState().actions;
                          openActions.open(
                            runtime.hostId,
                            'editor',
                            'conversation.reviewFile',
                            comment.navigation,
                            {
                              dedupe: true,
                              reveal: {
                                lineNumber: comment.lineNumber,
                                commentId: comment.id,
                              },
                            }
                          );
                        }}
                      >
                        <div className="flex items-start justify-between gap-3">
                          <div className="min-w-0">
                            <div className="flex items-center gap-2 text-xs text-muted-foreground">
                              <span>Line {comment.lineNumber}</span>
                              <span className="text-muted-foreground/70">
                                {new Date(comment.createdAt).toLocaleString()}
                              </span>
                            </div>
                            <p className="mt-1 whitespace-pre-wrap text-xs text-foreground">
                              {comment.text}
                            </p>
                          </div>
                        </div>
                      </button>

                      <div className="mt-2 flex items-center justify-end">
                        <button
                          type="button"
                          className="h-6 rounded-md px-2 text-xs text-muted-foreground hover:bg-muted/60 hover:text-foreground"
                          onClick={(event) => {
                            event.preventDefault();
                            event.stopPropagation();
                            actions.removeComment(comment.id);
                          }}
                        >
                          Remove
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="flex h-full items-center justify-center px-6 text-sm text-muted-foreground">
            {reviewKey ? 'No comments yet.' : 'No active review.'}
          </div>
        )}
      </div>
    </div>
  );
}
