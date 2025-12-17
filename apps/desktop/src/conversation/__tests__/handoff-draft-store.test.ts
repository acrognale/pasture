import { describe, expect, it } from 'vitest';

import { setHandoffDraft, takeHandoffDraft } from '../handoff-draft-store';

describe('handoff-draft-store', () => {
  it('only returns a draft for the matching conversation', () => {
    const threadId = 'thread-1';
    const conversationId = 'conversation-1';
    const otherConversationId = 'conversation-2';
    const draft = 'Generated handoff prompt';

    setHandoffDraft(threadId, conversationId, draft);

    expect(takeHandoffDraft(threadId, otherConversationId)).toBeNull();
    expect(takeHandoffDraft(threadId, conversationId)).toBe(draft);
    expect(takeHandoffDraft(threadId, conversationId)).toBeNull();
  });
});

