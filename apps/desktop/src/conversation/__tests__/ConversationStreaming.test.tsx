import { act, fireEvent, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, test } from 'vitest';
import { mockCodex, mockEvents } from '~/testing/codex';

import {
  WORKSPACE,
  renderConversationPane,
  setupConversationTest,
} from './setup';

const CONVERSATION_ID = 'integration-stream';

const emitEvent = (
  event: Parameters<typeof mockEvents.emitConversation>[0],
  options?: Parameters<typeof mockEvents.emitConversation>[1]
) => {
  act(() => {
    mockEvents.emitConversation(event, options);
  });
};

const emitSessionConfigured = () => {
  emitEvent({
    type: 'session_configured',
    session_id: CONVERSATION_ID,
    model: 'gpt-5-codex-latest',
    reasoning_effort: 'medium',
    history_log_id: BigInt(0),
    history_entry_count: 0,
    initial_messages: null,
    rollout_path: `${WORKSPACE}/history/${CONVERSATION_ID}.jsonl`,
  });
};

const flushAnimationFrame = async (iterations = 1) => {
  if (typeof requestAnimationFrame !== 'function') {
    return;
  }
  for (let index = 0; index < iterations; index += 1) {
    await act(
      () =>
        new Promise<void>((resolve) => {
          requestAnimationFrame(() => resolve());
        })
    );
  }
};

beforeEach(() => {
  setupConversationTest(CONVERSATION_ID);
});

describe('Conversation streaming flow', () => {
  test('disables the composer while the agent is working and renders streamed output', async () => {
    renderConversationPane(CONVERSATION_ID);

    const composer = await screen.findByRole('textbox');
    await waitFor(() => expect(composer).not.toBeDisabled());

    emitSessionConfigured();
    emitEvent({
      type: 'task_started',
      model_context_window: BigInt(32768),
    });

    await waitFor(() => {
      const stopButton = document.getElementById(
        'interrupt-conversation-button'
      );
      expect(stopButton).not.toBeNull();
    });

    emitEvent({
      type: 'agent_message',
      message: 'Hello from Codex!',
    });

    expect(
      await screen.findByText('Hello from Codex!', { exact: false })
    ).toBeInTheDocument();

    emitEvent({
      type: 'task_complete',
      last_agent_message: 'Done.',
    });

    await waitFor(() =>
      expect(
        document.getElementById('interrupt-conversation-button')
      ).toBeNull()
    );
    await waitFor(() => expect(composer).not.toBeDisabled());
  });

  test('auto-scrolls to the bottom when a conversation loads with existing history', async () => {
    const originalObserver = window.IntersectionObserver;
    class NonIntersectingObserver implements IntersectionObserver {
      callback: IntersectionObserverCallback;
      readonly root: Element | Document | null;
      readonly rootMargin: string;
      readonly thresholds: ReadonlyArray<number>;

      constructor(
        callback: IntersectionObserverCallback,
        options?: IntersectionObserverInit
      ) {
        this.callback = callback;
        this.root = options?.root ?? null;
        this.rootMargin = options?.rootMargin ?? '0px';
        const threshold = options?.threshold ?? 0;
        this.thresholds = Array.isArray(threshold) ? threshold : [threshold];
      }

      observe(target: Element): void {
        const rect =
          target.getBoundingClientRect?.() ?? new DOMRect(0, 0, 0, 0);
        this.callback(
          [
            {
              time: Date.now(),
              target,
              isIntersecting: false,
              intersectionRatio: 0,
              boundingClientRect: rect,
              intersectionRect: rect,
              rootBounds: null,
            },
          ],
          this
        );
      }

      unobserve(): void {}

      disconnect(): void {}

      takeRecords(): IntersectionObserverEntry[] {
        return [];
      }
    }

    window.IntersectionObserver =
      NonIntersectingObserver as typeof window.IntersectionObserver;

    mockCodex.stub.initializeConversation.mockResolvedValueOnce({
      sessionConfigured: {
        session_id: CONVERSATION_ID,
        model: 'gpt-5-codex-latest',
        reasoning_effort: 'medium',
        history_log_id: BigInt(0),
        history_entry_count: 2,
        initial_messages: [
          { type: 'user_message', message: 'Earlier question', images: null },
          { type: 'agent_message', message: 'Earlier answer' },
        ],
        rollout_path: `${WORKSPACE}/history/${CONVERSATION_ID}.jsonl`,
      },
      reasoningSummary: 'auto',
    });

    try {
      renderConversationPane(CONVERSATION_ID);

      await screen.findByRole('textbox');

      const transcript = await waitFor(() => {
        const node = document.querySelector('[data-conversation-transcript]');
        if (!(node instanceof HTMLElement)) {
          throw new Error('Transcript container not found');
        }
        return node;
      });

      const scrollHeight = { value: 2000 };
      Object.defineProperty(transcript, 'scrollHeight', {
        configurable: true,
        get() {
          return scrollHeight.value;
        },
        set(next: number) {
          scrollHeight.value = next;
        },
      });
      Object.defineProperty(transcript, 'clientHeight', {
        configurable: true,
        value: 600,
      });
      let scrollTopValue = 0;
      let scrollMutations = 0;
      Object.defineProperty(transcript, 'scrollTop', {
        configurable: true,
        get() {
          return scrollTopValue;
        },
        set(next: number) {
          scrollTopValue = next;
          scrollMutations += 1;
        },
      });

      await screen.findByText('Earlier answer', { exact: false });

      await waitFor(() => expect(scrollMutations).toBeGreaterThan(0));
    } finally {
      window.IntersectionObserver = originalObserver;
    }
  });

  test('renders agent message deltas cumulatively while streaming', async () => {
    renderConversationPane(CONVERSATION_ID);

    await screen.findByRole('textbox');

    emitSessionConfigured();
    emitEvent({
      type: 'task_started',
      model_context_window: BigInt(32768),
    });

    emitEvent({
      type: 'agent_message_delta',
      delta: 'Hello from',
    });

    emitEvent({
      type: 'agent_message_delta',
      delta: ' Codex streaming!',
    });

    expect(
      await screen.findByText('Hello from Codex streaming!', { exact: false })
    ).toBeInTheDocument();
  });

  test('renders streaming reasoning updates as they arrive', async () => {
    renderConversationPane(CONVERSATION_ID);

    await screen.findByRole('textbox');

    emitSessionConfigured();
    emitEvent({
      type: 'task_started',
      model_context_window: BigInt(32768),
    });

    emitEvent({
      type: 'agent_reasoning_delta',
      delta: 'Outlining approach',
    });

    emitEvent({
      type: 'agent_reasoning_delta',
      delta: ' and next steps',
    });

    emitEvent({
      type: 'agent_reasoning',
      text: '',
    });

    expect(
      await screen.findByText(/Outlining approach and next steps/, {
        exact: false,
      })
    ).toBeInTheDocument();
  });

  test('updates the token gauge when token_count events emit', async () => {
    renderConversationPane(CONVERSATION_ID);

    await screen.findByRole('textbox');

    emitEvent({
      type: 'task_started',
      model_context_window: BigInt(8192),
    });

    emitEvent({
      type: 'token_count',
      info: {
        model_context_window: 4096,
        total_token_usage: {
          input_tokens: 300,
          cached_input_tokens: 0,
          output_tokens: 400,
          reasoning_output_tokens: 50,
          total_tokens: 750,
        },
        last_token_usage: {
          input_tokens: 300,
          cached_input_tokens: 0,
          output_tokens: 400,
          reasoning_output_tokens: 50,
          total_tokens: 750,
        },
      },
      rate_limits: null,
    });

    await waitFor(() => {
      const gauge = Array.from(document.querySelectorAll('span')).find(
        (node) =>
          node.textContent?.includes('/') && node.textContent.includes('k')
      );
      expect(gauge).toBeDefined();
      const gaugeText = gauge?.textContent ?? '';
      expect(gaugeText).toContain('700');
      expect(gaugeText).toContain('4.1k');
    });
  });

  test('recovers from turn abort and logs a status cell', async () => {
    renderConversationPane(CONVERSATION_ID);

    const composer = await screen.findByRole('textbox');

    emitEvent({
      type: 'task_started',
      model_context_window: BigInt(32768),
    });

    await waitFor(() =>
      expect(
        document.getElementById('interrupt-conversation-button')
      ).not.toBeNull()
    );

    emitEvent({
      type: 'turn_aborted',
      reason: 'interrupted',
    });

    await waitFor(() =>
      expect(
        document.getElementById('interrupt-conversation-button')
      ).toBeNull()
    );
    await waitFor(() => expect(composer).not.toBeDisabled());

    expect(
      await screen.findByText('interrupted', { exact: false })
    ).toBeInTheDocument();
  });

  test('handles consecutive turns without leaking state', async () => {
    renderConversationPane(CONVERSATION_ID);

    await screen.findByRole('textbox');

    emitEvent({
      type: 'task_started',
      model_context_window: BigInt(32768),
    });

    emitEvent({
      type: 'agent_message',
      message: 'First response',
    });

    emitEvent({
      type: 'task_complete',
      last_agent_message: 'First complete',
    });

    await screen.findByText('First response', { exact: false });

    await waitFor(() =>
      expect(
        document.getElementById('interrupt-conversation-button')
      ).toBeNull()
    );

    emitEvent({
      type: 'task_started',
      model_context_window: BigInt(32768),
    });

    await waitFor(() =>
      expect(
        document.getElementById('interrupt-conversation-button')
      ).not.toBeNull()
    );

    emitEvent({
      type: 'agent_message',
      message: 'Second response',
    });

    emitEvent({
      type: 'task_complete',
      last_agent_message: 'Second complete',
    });

    await waitFor(() =>
      expect(
        document.getElementById('interrupt-conversation-button')
      ).toBeNull()
    );

    await screen.findByText('Second response', { exact: false });

    expect(
      screen.getAllByText('First response', { exact: false })
    ).toHaveLength(1);
    expect(
      screen.getAllByText('Second response', { exact: false })
    ).toHaveLength(1);
  });

  test('keeps the transcript pinned until the user scrolls away', async () => {
    renderConversationPane(CONVERSATION_ID);

    await screen.findByRole('textbox');

    const transcript = await waitFor(() => {
      const node = document.querySelector('[data-conversation-transcript]');
      if (!(node instanceof HTMLElement)) {
        throw new Error('Transcript container not found');
      }
      return node;
    });

    const scrollHeight = { value: 2000 };
    Object.defineProperty(transcript, 'scrollHeight', {
      configurable: true,
      get() {
        return scrollHeight.value;
      },
      set(next: number) {
        scrollHeight.value = next;
      },
    });
    Object.defineProperty(transcript, 'clientHeight', {
      configurable: true,
      value: 600,
    });
    let scrollTopValue = 1400;
    let scrollMutations = 0;
    Object.defineProperty(transcript, 'scrollTop', {
      configurable: true,
      get() {
        return scrollTopValue;
      },
      set(next: number) {
        scrollTopValue = next;
        scrollMutations += 1;
      },
    });
    transcript.scrollTop = 1400;
    scrollMutations = 0;

    emitSessionConfigured();
    emitEvent({
      type: 'task_started',
      model_context_window: BigInt(32768),
    });

    const initialMutations = scrollMutations;
    emitEvent({
      type: 'agent_message',
      message: 'Auto-follow message',
    });

    await waitFor(() =>
      expect(scrollMutations).toBeGreaterThan(initialMutations)
    );

    await flushAnimationFrame(2);
    transcript.scrollTop = 200;
    fireEvent.scroll(transcript);

    const mutationsAfterManual = scrollMutations;
    emitEvent({
      type: 'agent_message',
      message: 'User has scrolled away',
    });

    await waitFor(() => expect(scrollMutations).toBe(mutationsAfterManual));

    const scrollButton = await screen.findByText('Scroll to latest');
    fireEvent.click(scrollButton);

    await waitFor(() =>
      expect(scrollMutations).toBeGreaterThan(mutationsAfterManual)
    );
    const mutationsAfterButton = scrollMutations;

    emitEvent({
      type: 'agent_message',
      message: 'Should auto-follow again',
    });

    await waitFor(() =>
      expect(scrollMutations).toBeGreaterThan(mutationsAfterButton)
    );
  });

  test('auto-scrolls to show a new user message when already pinned to the bottom', async () => {
    renderConversationPane(CONVERSATION_ID);

    const composer = await screen.findByRole('textbox');

    const transcript = await waitFor(() => {
      const node = document.querySelector('[data-conversation-transcript]');
      if (!(node instanceof HTMLElement)) {
        throw new Error('Transcript container not found');
      }
      return node;
    });

    const scrollHeight = { value: 2000 };
    Object.defineProperty(transcript, 'scrollHeight', {
      configurable: true,
      get() {
        return scrollHeight.value;
      },
      set(next: number) {
        scrollHeight.value = next;
      },
    });
    Object.defineProperty(transcript, 'clientHeight', {
      configurable: true,
      value: 600,
    });
    let scrollTopValue = 1400;
    Object.defineProperty(transcript, 'scrollTop', {
      configurable: true,
      get() {
        return scrollTopValue;
      },
      set(next: number) {
        scrollTopValue = next;
      },
    });

    emitSessionConfigured();
    emitEvent({
      type: 'task_started',
      model_context_window: BigInt(32768),
    });

    emitEvent({
      type: 'agent_message',
      message: 'Existing agent message',
    });

    await screen.findByText('Existing agent message', { exact: false });

    await waitFor(() => {
      expect(scrollTopValue).toBeGreaterThan(0);
    });

    const originalScrollTop = scrollTopValue;

    mockCodex.stub.sendUserMessage.mockImplementation(() => {
      scrollHeight.value += 400;
      emitEvent({
        type: 'user_message',
        message: 'New user message',
        images: [],
      });
      return Promise.resolve(undefined);
    });

    act(() => {
      fireEvent.change(composer, {
        target: { value: 'New user message' },
      });
      fireEvent.keyDown(composer, {
        key: 'Enter',
        metaKey: true,
      });
    });

    await screen.findByText('New user message', { exact: false });

    await waitFor(() => {
      expect(scrollTopValue).toBeGreaterThanOrEqual(originalScrollTop);
      expect(scrollTopValue + transcript.clientHeight).toBeGreaterThanOrEqual(
        transcript.scrollHeight - 1
      );
    });
  });
});
