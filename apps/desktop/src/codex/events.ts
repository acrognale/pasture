import { type UnlistenFn, listen } from '@tauri-apps/api/event';
import type { AuthState } from '~/codex.gen/AuthState';
import type { CodexEvent } from '~/codex.gen/CodexEvent';
import type { ConversationEventPayload } from '~/codex.gen/ConversationEventPayload';
import type { EventMsg } from '~/codex.gen/EventMsg';

export const isTauriEnvironment = (): boolean =>
  typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window;

export const ensureTauriEnvironment = () => {
  if (!isTauriEnvironment()) {
    throw new Error('Codex event stream is unavailable in this environment.');
  }
};

export type ConversationEventEnvelope = {
  eventId: string;
  event: EventMsg;
  timestamp: string;
};

export const createOptimisticUserEvent = (
  text: string,
  timestamp = new Date().toISOString()
): ConversationEventEnvelope =>
  eventMsgToEnvelope(`optimistic-${timestamp}`, {
    type: 'user_message',
    message: text,
    images: null,
  });

export const derivePreviewFromEvent = (event: EventMsg): string | null => {
  switch (event.type) {
    case 'user_message':
      return event.message;
    case 'agent_message':
      return event.message;
    case 'agent_reasoning':
      return event.text;
    case 'task_started':
      return 'Task started';
    case 'task_complete':
      return event.last_agent_message ?? 'Task complete';
    default:
      return null;
  }
};

export type CodexBridgeEvent = CodexEvent;

export const isConversationEvent = (
  event: CodexBridgeEvent
): event is CodexEvent & { kind: 'conversation-event' } =>
  event.kind === 'conversation-event';

export const isAuthUpdatedEvent = (
  event: CodexBridgeEvent
): event is CodexEvent & { kind: 'auth-updated' } =>
  event.kind === 'auth-updated';

export const getConversationEventPayload = (
  event: CodexBridgeEvent
): ConversationEventPayload => {
  if (!isConversationEvent(event)) {
    throw new Error('Unsupported Codex event kind');
  }

  return event.payload;
};

export const getAuthUpdatedPayload = (event: CodexBridgeEvent): AuthState => {
  if (!isAuthUpdatedEvent(event)) {
    throw new Error('Unsupported Codex event kind');
  }

  return event.payload;
};

export const eventMsgToEnvelope = (
  eventId: string,
  event: EventMsg
): ConversationEventEnvelope => ({
  eventId,
  event,
  timestamp: new Date().toISOString(),
});

export const subscribeToCodexEvents = (
  listener: (event: CodexBridgeEvent) => void
): (() => void) => {
  ensureTauriEnvironment();

  const subscription = listen<CodexBridgeEvent>('codex-event', (event) => {
    listener(event.payload);
  });

  return () => {
    void subscription
      .then((unlisten: UnlistenFn) => {
        unlisten();
      })
      .catch((error) => {
        console.warn('Failed to unsubscribe from codex events', error);
      });
  };
};
