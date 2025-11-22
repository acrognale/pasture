import { randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import type { ConversationEventPayload } from '~/codex.gen/ConversationEventPayload';

import { type ConversationControllerState } from '../store/reducer';
import { createConversationStore } from '../store/store';

export const loadFixtureEvents = (name: string): ConversationEventPayload[] => {
  const filePath = resolve(
    process.cwd(),
    'src/conversation/store/__tests__/fixtures',
    name
  );
  const contents = readFileSync(filePath, 'utf-8');
  return contents
    .split('\n')
    .filter((line) => line.trim().length > 0)
    .map((line) => {
      const parsed = JSON.parse(line) as ConversationEventPayload & {
        eventId?: string;
        event_id?: string;
        timestamp?: string;
      };
      return {
        conversationId: parsed.conversationId,
        turnId: parsed.turnId,
        eventId:
          parsed.eventId ??
          parsed.event_id ??
          `evt-${parsed.turnId ?? 'unknown'}-${randomUUID()}`,
        event: parsed.event,
        timestamp: parsed.timestamp ?? new Date().toISOString(),
      } satisfies ConversationEventPayload;
    });
};

export const buildControllerFromFixture = (
  name: string
): ConversationControllerState => {
  const store = createConversationStore();
  loadFixtureEvents(name).forEach((payload) => {
    store.getState().ingestEvent(payload);
  });
  const state = store.getState();
  return state;
};
