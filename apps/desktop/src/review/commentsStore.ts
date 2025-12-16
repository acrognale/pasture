import { createStore } from 'zustand/vanilla';
import type { StoreApi } from 'zustand/vanilla';
import { useStore } from 'zustand';

export type ReviewLineComment = {
  id: string;
  reviewKey: string;
  filePath: string;
  side: 'modified';
  lineNumber: number;
  text: string;
  createdAt: string;
};

export const EMPTY_REVIEW_COMMENTS: readonly ReviewLineComment[] = [];

type ReviewCommentState = {
  commentsByReviewKey: Record<string, ReviewLineComment[]>;
  actions: {
    reset: () => void;
    addComment: (input: Omit<ReviewLineComment, 'id' | 'createdAt'>) => ReviewLineComment;
    updateComment: (id: string, text: string) => void;
    removeComment: (id: string) => void;
  };
};

const makeCommentId = () => {
  if (
    typeof crypto !== 'undefined' &&
    typeof crypto.randomUUID === 'function'
  ) {
    return crypto.randomUUID();
  }
  return `comment-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
};

export const reviewCommentStore: StoreApi<ReviewCommentState> =
  createStore<ReviewCommentState>((set, get) => ({
    commentsByReviewKey: {},
    actions: {
      reset: () => {
        set({ commentsByReviewKey: {} });
      },
      addComment: (input) => {
        const next: ReviewLineComment = {
          ...input,
          id: makeCommentId(),
          createdAt: new Date().toISOString(),
          text: input.text.trim(),
        };

        set((state) => {
          const existing = state.commentsByReviewKey[next.reviewKey] ?? [];
          return {
            commentsByReviewKey: {
              ...state.commentsByReviewKey,
              [next.reviewKey]: [...existing, next],
            },
          };
        });

        return next;
      },
      updateComment: (id, text) => {
        const trimmed = text.trim();
        if (!trimmed) {
          return;
        }

        const { commentsByReviewKey } = get();
        const updated: Record<string, ReviewLineComment[]> = {};
        let changed = false;
        for (const [key, comments] of Object.entries(commentsByReviewKey)) {
          let found = false;
          const next = comments.map((comment) => {
            if (comment.id !== id) {
              return comment;
            }
            found = true;
            return { ...comment, text: trimmed };
          });
          updated[key] = next;
          if (found) {
            changed = true;
          }
        }
        if (changed) {
          set({ commentsByReviewKey: updated });
        }
      },
      removeComment: (id) => {
        const { commentsByReviewKey } = get();
        const updated: Record<string, ReviewLineComment[]> = {};
        let changed = false;
        for (const [key, comments] of Object.entries(commentsByReviewKey)) {
          const next = comments.filter((comment) => comment.id !== id);
          updated[key] = next;
          if (next.length !== comments.length) {
            changed = true;
          }
        }
        if (changed) {
          set({ commentsByReviewKey: updated });
        }
      },
    },
  }));

export const getCommentsForReviewKey = (reviewKey: string | null) => {
  if (!reviewKey) {
    return EMPTY_REVIEW_COMMENTS;
  }
  return reviewCommentStore.getState().commentsByReviewKey[reviewKey] ?? EMPTY_REVIEW_COMMENTS;
};

export function useReviewComments<T>(
  selector: (state: ReviewCommentState) => T
): T {
  return useStore(reviewCommentStore, selector);
}
