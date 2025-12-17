type HandoffDraftEntry = {
  conversationId: string;
  draft: string;
};

const drafts = new Map<string, HandoffDraftEntry>();

export function setHandoffDraft(
  threadId: string,
  conversationId: string,
  draft: string
) {
  drafts.set(threadId, { conversationId, draft });
}

export function takeHandoffDraft(
  threadId: string,
  conversationId: string
): string | null {
  const entry = drafts.get(threadId) ?? null;
  if (!entry || entry.conversationId !== conversationId) {
    return null;
  }
  drafts.delete(threadId);
  return entry.draft;
}
