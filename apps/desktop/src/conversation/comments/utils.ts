import type { MessageComment } from '@pasture/protocol';

const truncate = (text: string, max = 120) => {
  if (text.length <= max) {
    return text;
  }
  return `${text.slice(0, max - 1)}…`;
};

export const buildMessageCommentsPrompt = (
  comments: readonly MessageComment[]
): string | null => {
  if (!comments.length) {
    return null;
  }

  const segments = comments.map((comment) => {
    const snippet = truncate(comment.selectionPreview || comment.selectionText);
    return `- Message snippet: "${snippet}"\n  Comment: ${comment.commentText}`;
  });

  return `I have a few comments on your previous response:\n${segments.join('\n')}\n\nPlease address each comment before continuing.`;
};
