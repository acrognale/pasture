import type { Conversation } from '@pasture/protocol';
import { describe, expect, test } from 'vitest';

import { getForksAtMessage } from '../getForksAtMessage';

const THREAD_ID = 'thread-1';

function createConversation(
  id: string,
  opts: {
    parentConversationId?: string | null;
    forkedAtNthUserMessage?: number | null;
    createdAt?: string;
  } = {}
): Conversation {
  const {
    parentConversationId = null,
    forkedAtNthUserMessage = null,
    createdAt = new Date().toISOString(),
  } = opts;
  return {
    id,
    threadId: THREAD_ID,
    rolloutPath: `/path/to/${id}.jsonl`,
    createdAt,
    label: null,
    parentConversationId,
    forkedAtNthUserMessage,
  };
}

describe('getForksAtMessage', () => {
  describe('simple flat forks (all from root)', () => {
    /**
     * Structure:
     * A (root)
     * ├── B forked at 2
     * ├── C forked at 2
     * └── D forked at 4
     */
    const A = createConversation('A', { createdAt: '2025-01-01T00:00:00Z' });
    const B = createConversation('B', {
      parentConversationId: 'A',
      forkedAtNthUserMessage: 2,
      createdAt: '2025-01-01T00:01:00Z',
    });
    const C = createConversation('C', {
      parentConversationId: 'A',
      forkedAtNthUserMessage: 2,
      createdAt: '2025-01-01T00:02:00Z',
    });
    const D = createConversation('D', {
      parentConversationId: 'A',
      forkedAtNthUserMessage: 4,
      createdAt: '2025-01-01T00:03:00Z',
    });
    const allConversations = [A, B, C, D];

    test('viewing A at message 2 returns [A, B, C]', () => {
      const result = getForksAtMessage(A, 2, allConversations);
      expect(result.map((c) => c.id)).toEqual(['A', 'B', 'C']);
    });

    test('viewing A at message 4 returns [A, D]', () => {
      const result = getForksAtMessage(A, 4, allConversations);
      expect(result.map((c) => c.id)).toEqual(['A', 'D']);
    });

    test('viewing A at message 1 returns just [A] (no forks there)', () => {
      const result = getForksAtMessage(A, 1, allConversations);
      expect(result.map((c) => c.id)).toEqual(['A']);
    });

    test('viewing B at message 2 returns [A, B, C] (B inherits msg 2 from A)', () => {
      const result = getForksAtMessage(B, 2, allConversations);
      expect(result.map((c) => c.id)).toEqual(['A', 'B', 'C']);
    });

    test('viewing B at message 3 returns just [B] (B owns msg 3, no forks there)', () => {
      const result = getForksAtMessage(B, 3, allConversations);
      expect(result.map((c) => c.id)).toEqual(['B']);
    });

    test('viewing C at message 2 returns [A, B, C]', () => {
      const result = getForksAtMessage(C, 2, allConversations);
      expect(result.map((c) => c.id)).toEqual(['A', 'B', 'C']);
    });

    test('viewing D at message 4 returns [A, D]', () => {
      const result = getForksAtMessage(D, 4, allConversations);
      expect(result.map((c) => c.id)).toEqual(['A', 'D']);
    });
  });

  describe('nested forks', () => {
    /**
     * Structure:
     * A (root): messages 1, 2, 3, 4, 5
     * ├── B forked at 2: shares 1,2 with A, then B has its own 3b, 4b, 5b
     * │   └── D forked at 4: shares 1,2,3b,4b with B, then D has its own 5d
     * ├── C forked at 2: shares 1,2 with A, then C has its own 3c, 4c
     * └── E forked at 4: shares 1,2,3,4 with A, then E has its own 5e
     */
    const A = createConversation('A', { createdAt: '2025-01-01T00:00:00Z' });
    const B = createConversation('B', {
      parentConversationId: 'A',
      forkedAtNthUserMessage: 2,
      createdAt: '2025-01-01T00:01:00Z',
    });
    const C = createConversation('C', {
      parentConversationId: 'A',
      forkedAtNthUserMessage: 2,
      createdAt: '2025-01-01T00:02:00Z',
    });
    const D = createConversation('D', {
      parentConversationId: 'B',
      forkedAtNthUserMessage: 4,
      createdAt: '2025-01-01T00:03:00Z',
    });
    const E = createConversation('E', {
      parentConversationId: 'A',
      forkedAtNthUserMessage: 4,
      createdAt: '2025-01-01T00:04:00Z',
    });
    const allConversations = [A, B, C, D, E];

    test('viewing A at message 2 returns [A, B, C]', () => {
      const result = getForksAtMessage(A, 2, allConversations);
      expect(result.map((c) => c.id)).toEqual(['A', 'B', 'C']);
    });

    test('viewing A at message 4 returns [A, E] (not D, since D forked from B)', () => {
      const result = getForksAtMessage(A, 4, allConversations);
      expect(result.map((c) => c.id)).toEqual(['A', 'E']);
    });

    test('viewing B at message 2 returns [A, B, C] (inherited from A)', () => {
      const result = getForksAtMessage(B, 2, allConversations);
      expect(result.map((c) => c.id)).toEqual(['A', 'B', 'C']);
    });

    test('viewing B at message 4 returns [B, D] (B owns msg 4, D forked there)', () => {
      const result = getForksAtMessage(B, 4, allConversations);
      expect(result.map((c) => c.id)).toEqual(['B', 'D']);
    });

    test('viewing B at message 3 returns just [B] (no forks at msg 3 from B)', () => {
      const result = getForksAtMessage(B, 3, allConversations);
      expect(result.map((c) => c.id)).toEqual(['B']);
    });

    test('viewing D at message 2 returns [A, B, C] (inherited through B from A)', () => {
      const result = getForksAtMessage(D, 2, allConversations);
      expect(result.map((c) => c.id)).toEqual(['A', 'B', 'C']);
    });

    test('viewing D at message 4 returns [B, D] (inherited from B)', () => {
      const result = getForksAtMessage(D, 4, allConversations);
      expect(result.map((c) => c.id)).toEqual(['B', 'D']);
    });

    test('viewing D at message 5 returns just [D] (D owns msg 5)', () => {
      const result = getForksAtMessage(D, 5, allConversations);
      expect(result.map((c) => c.id)).toEqual(['D']);
    });

    test('viewing E at message 4 returns [A, E]', () => {
      const result = getForksAtMessage(E, 4, allConversations);
      expect(result.map((c) => c.id)).toEqual(['A', 'E']);
    });

    test('viewing E at message 2 returns [A, B, C] (inherited from A)', () => {
      const result = getForksAtMessage(E, 2, allConversations);
      expect(result.map((c) => c.id)).toEqual(['A', 'B', 'C']);
    });
  });

  describe('deeply nested forks', () => {
    /**
     * Structure:
     * A (root)
     * └── B forked at 1
     *     └── C forked at 2
     *         └── D forked at 3
     */
    const A = createConversation('A', { createdAt: '2025-01-01T00:00:00Z' });
    const B = createConversation('B', {
      parentConversationId: 'A',
      forkedAtNthUserMessage: 1,
      createdAt: '2025-01-01T00:01:00Z',
    });
    const C = createConversation('C', {
      parentConversationId: 'B',
      forkedAtNthUserMessage: 2,
      createdAt: '2025-01-01T00:02:00Z',
    });
    const D = createConversation('D', {
      parentConversationId: 'C',
      forkedAtNthUserMessage: 3,
      createdAt: '2025-01-01T00:03:00Z',
    });
    const allConversations = [A, B, C, D];

    test('viewing D at message 1 returns [A, B] (walks all the way up)', () => {
      const result = getForksAtMessage(D, 1, allConversations);
      expect(result.map((c) => c.id)).toEqual(['A', 'B']);
    });

    test('viewing D at message 2 returns [B, C]', () => {
      const result = getForksAtMessage(D, 2, allConversations);
      expect(result.map((c) => c.id)).toEqual(['B', 'C']);
    });

    test('viewing D at message 3 returns [C, D]', () => {
      const result = getForksAtMessage(D, 3, allConversations);
      expect(result.map((c) => c.id)).toEqual(['C', 'D']);
    });

    test('viewing D at message 4 returns just [D]', () => {
      const result = getForksAtMessage(D, 4, allConversations);
      expect(result.map((c) => c.id)).toEqual(['D']);
    });
  });

  describe('multiple forks at different levels', () => {
    /**
     * Structure:
     * A (root)
     * ├── B forked at 2
     * │   ├── D forked at 3
     * │   └── E forked at 3
     * └── C forked at 2
     *     └── F forked at 3
     */
    const A = createConversation('A', { createdAt: '2025-01-01T00:00:00Z' });
    const B = createConversation('B', {
      parentConversationId: 'A',
      forkedAtNthUserMessage: 2,
      createdAt: '2025-01-01T00:01:00Z',
    });
    const C = createConversation('C', {
      parentConversationId: 'A',
      forkedAtNthUserMessage: 2,
      createdAt: '2025-01-01T00:02:00Z',
    });
    const D = createConversation('D', {
      parentConversationId: 'B',
      forkedAtNthUserMessage: 3,
      createdAt: '2025-01-01T00:03:00Z',
    });
    const E = createConversation('E', {
      parentConversationId: 'B',
      forkedAtNthUserMessage: 3,
      createdAt: '2025-01-01T00:04:00Z',
    });
    const F = createConversation('F', {
      parentConversationId: 'C',
      forkedAtNthUserMessage: 3,
      createdAt: '2025-01-01T00:05:00Z',
    });
    const allConversations = [A, B, C, D, E, F];

    test('viewing D at message 3 returns [B, D, E] (siblings from B)', () => {
      const result = getForksAtMessage(D, 3, allConversations);
      expect(result.map((c) => c.id)).toEqual(['B', 'D', 'E']);
    });

    test('viewing F at message 3 returns [C, F] (only F forked from C at 3)', () => {
      const result = getForksAtMessage(F, 3, allConversations);
      expect(result.map((c) => c.id)).toEqual(['C', 'F']);
    });

    test('viewing D at message 2 returns [A, B, C] (inherited from A)', () => {
      const result = getForksAtMessage(D, 2, allConversations);
      expect(result.map((c) => c.id)).toEqual(['A', 'B', 'C']);
    });

    test('viewing F at message 2 returns [A, B, C] (inherited from A)', () => {
      const result = getForksAtMessage(F, 2, allConversations);
      expect(result.map((c) => c.id)).toEqual(['A', 'B', 'C']);
    });
  });

  describe('edge cases', () => {
    test('single conversation (root only) returns just the root', () => {
      const A = createConversation('A');
      const result = getForksAtMessage(A, 1, [A]);
      expect(result.map((c) => c.id)).toEqual(['A']);
    });

    test('handles missing parent gracefully', () => {
      const B = createConversation('B', {
        parentConversationId: 'nonexistent',
        forkedAtNthUserMessage: 2,
      });
      // B's parent doesn't exist, so B becomes the owner
      const result = getForksAtMessage(B, 2, [B]);
      expect(result.map((c) => c.id)).toEqual(['B']);
    });

    test('results are sorted by createdAt', () => {
      const A = createConversation('A', { createdAt: '2025-01-01T00:00:00Z' });
      const B = createConversation('B', {
        parentConversationId: 'A',
        forkedAtNthUserMessage: 1,
        createdAt: '2025-01-01T00:02:00Z', // Later
      });
      const C = createConversation('C', {
        parentConversationId: 'A',
        forkedAtNthUserMessage: 1,
        createdAt: '2025-01-01T00:01:00Z', // Earlier
      });
      const result = getForksAtMessage(A, 1, [A, B, C]);
      // A first (owner), then C (earlier), then B (later)
      expect(result.map((c) => c.id)).toEqual(['A', 'C', 'B']);
    });
  });
});
