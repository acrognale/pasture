import type { ConversationEventPayload } from '~/codex.gen/ConversationEventPayload';
import type { EventMsg } from '~/codex.gen/EventMsg';

import {
  DEFAULT_REPLAY_TIMING,
  type ReplayTimingConfig,
  getEventDelay,
} from './config';

export type ReplayEvent = {
  eventId: string;
  event: EventMsg;
  timestamp?: string;
};

export type ReplayOptions = {
  conversationId: string;
  timing?: ReplayTimingConfig;
  onEvent: (payload: ConversationEventPayload, isReplay: boolean) => void;
  onComplete?: () => void;
  onError?: (error: Error) => void;
};

export type ReplayControl = {
  stop: () => void;
  isRunning: () => boolean;
};

/**
 * Parse JSONL string into replay events
 */
export function parseJsonl(jsonl: string): ReplayEvent[] {
  const lines = jsonl.trim().split('\n').filter(Boolean);
  const events: ReplayEvent[] = [];

  for (const line of lines) {
    try {
      const parsed = JSON.parse(line) as ReplayEvent;
      if (parsed.event && parsed.eventId) {
        events.push(parsed);
      }
    } catch (error) {
      console.warn('Failed to parse JSONL line:', line, error);
    }
  }

  return events;
}

/**
 * Replay events with configurable timing
 */
export function replayEvents(
  events: ReplayEvent[],
  options: ReplayOptions
): ReplayControl {
  const {
    conversationId,
    timing = DEFAULT_REPLAY_TIMING,
    onEvent,
    onComplete,
    onError,
  } = options;
  let timeoutId: ReturnType<typeof setTimeout> | null = null;
  let currentIndex = 0;
  let stopped = false;

  const emitNext = () => {
    if (stopped || currentIndex >= events.length) {
      console.log('[Replay] Complete - processed', currentIndex, 'events');
      onComplete?.();
      return;
    }

    const replayEvent = events[currentIndex];
    if (!replayEvent) {
      onComplete?.();
      return;
    }

    currentIndex++;

    try {
      const payload: ConversationEventPayload = {
        conversationId,
        eventId: replayEvent.eventId,
        event: replayEvent.event,
        timestamp: replayEvent.timestamp ?? new Date().toISOString(),
      };

      const delay = getEventDelay(replayEvent.event.type, timing);

      onEvent(payload, true);

      if (delay === 0) {
        // No delay - use setImmediate equivalent
        timeoutId = setTimeout(emitNext, 0);
      } else {
        timeoutId = setTimeout(emitNext, delay);
      }
    } catch (error) {
      const err = error instanceof Error ? error : new Error(String(error));
      onError?.(err);
      onComplete?.();
    }
  };

  // Start replay
  emitNext();

  return {
    stop: () => {
      stopped = true;
      if (timeoutId !== null) {
        clearTimeout(timeoutId);
        timeoutId = null;
      }
    },
    isRunning: () => !stopped && currentIndex < events.length,
  };
}

/**
 * Load JSONL from clipboard and replay
 */
export async function replayFromClipboard(
  options: Omit<ReplayOptions, 'conversationId'> & { conversationId?: string }
): Promise<ReplayControl> {
  try {
    const text = await navigator.clipboard.readText();
    const events = parseJsonl(text);

    if (events.length === 0) {
      throw new Error('No valid events found in clipboard');
    }

    // Extract conversationId from first event if not provided
    const conversationId = options.conversationId ?? `replay-${Date.now()}`;

    return replayEvents(events, { ...options, conversationId });
  } catch (error) {
    const err = error instanceof Error ? error : new Error(String(error));
    options.onError?.(err);
    throw err;
  }
}
