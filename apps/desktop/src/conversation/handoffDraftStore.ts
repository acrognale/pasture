const drafts = new Map<string, string>();

export function setHandoffDraft(threadId: string, draft: string) {
  drafts.set(threadId, draft);
}

export function takeHandoffDraft(threadId: string): string | null {
  const value = drafts.get(threadId) ?? null;
  if (value !== null) {
    drafts.delete(threadId);
  }
  return value;
}
