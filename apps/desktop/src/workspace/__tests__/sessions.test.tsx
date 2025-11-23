import { act, fireEvent, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, test, vi } from 'vitest';
import type { ListThreadsResponse } from '~/codex.gen/ListThreadsResponse';
import type { ThreadSummary } from '~/codex.gen/ThreadSummary';
import { encodeWorkspaceId } from '~/lib/routing';
import { mockCodex, mockEvents } from '~/testing/codex';

import {
  getActiveConversationId,
  mockNavigate,
  resetActiveConversationId,
  setActiveConversationId,
} from './routerTestUtils';
import { WORKSPACE, markThreadOpenInTest, renderSidebarPanel } from './setup';

vi.mock('@tanstack/react-router', async (importOriginal) => {
  const actual =
    await importOriginal<typeof import('@tanstack/react-router')>();
  return {
    ...actual,
    useRouter: () => ({ navigate: mockNavigate }),
    useRouterState: ({ select }: { select: (state: unknown) => unknown }) => {
      const state = {
        matches: [
          {
            routeId: '/workspaces/$workspaceId/threads/$threadId',
            params: { threadId: getActiveConversationId() },
          },
        ],
      };
      return select(state as never);
    },
  };
});

beforeEach(() => {
  resetActiveConversationId();
  mockNavigate.mockReset();
  mockNavigate.mockImplementation(
    ({ params }: { params?: { threadId?: string | null } }) => {
      if (params && typeof params.threadId !== 'undefined') {
        setActiveConversationId(params.threadId ?? null);
      }
      return Promise.resolve();
    }
  );
});

const ACTIVE_THREAD_ID = 'thread-active';
const NEW_THREAD_ID = 'thread-new';
const ACTIVE_CONVERSATION_ID = 'conversation-active';
const NEW_CONVERSATION_ID = 'conversation-new';

describe('SidebarPanel sessions', () => {
  test('activates a newly created session immediately', async () => {
    const now = new Date().toISOString();

    const threads: ListThreadsResponse = {
      items: [
        {
          threadId: ACTIVE_THREAD_ID,
          workspacePath: WORKSPACE,
          currentConversationId: ACTIVE_CONVERSATION_ID,
          preview: 'Existing session',
          timestamp: now,
          rolloutCount: 1,
        },
      ],
    };

    mockCodex.stub.listThreads.mockResolvedValue(threads);

    mockCodex.stub.newThread.mockResolvedValue({
      threadId: NEW_THREAD_ID,
      conversationId: NEW_CONVERSATION_ID,
      model: 'gpt-5-codex',
      reasoningEffort: 'medium',
      rolloutPath: `${WORKSPACE}/sessions/${NEW_THREAD_ID}.json`,
    });

    mockCodex.stub.initializeThread.mockResolvedValue({
      sessionConfigured: {
        session_id: NEW_CONVERSATION_ID,
        model: 'gpt-5-codex',
        model_provider_id: 'openai',
        approval_policy: 'on-request',
        sandbox_policy: { type: 'danger-full-access' },
        cwd: WORKSPACE,
        reasoning_effort: null,
        history_log_id: BigInt(0),
        history_entry_count: 0,
        initial_messages: [],
        rollout_path: `${WORKSPACE}/sessions/${NEW_THREAD_ID}.json`,
      },
      reasoningSummary: 'auto',
    });

    setActiveConversationId(ACTIVE_THREAD_ID);

    renderSidebarPanel({ openThreadIds: [ACTIVE_THREAD_ID] });

    await screen.findByRole('button', { name: /Existing session/i });

    const createButton = screen.getByRole('button', { name: /^New$/i });
    fireEvent.click(createButton);

    await markThreadOpenInTest(NEW_THREAD_ID);

    const newSessionButton = await screen.findByRole('button', {
      name: /Untitled session/i,
    });

    expect(newSessionButton).toBeInTheDocument();

    const expectedWorkspaceId = encodeWorkspaceId(WORKSPACE);

    await waitFor(() => {
      const [payload] = mockNavigate.mock.calls.at(-1) ?? [];
      expect(payload?.to).toBe('/workspaces/$workspaceId/threads/$threadId');
      expect(payload?.params).toMatchObject({
        workspaceId: expectedWorkspaceId,
        threadId: NEW_THREAD_ID,
      });
    });
  });

  test('updates session preview after the first user message', async () => {
    const now = new Date().toISOString();

    const threads: ListThreadsResponse = {
      items: [
        {
          threadId: ACTIVE_THREAD_ID,
          workspacePath: WORKSPACE,
          currentConversationId: ACTIVE_CONVERSATION_ID,
          preview: 'Existing session',
          timestamp: now,
          rolloutCount: 1,
        },
      ],
    };

    mockCodex.stub.listThreads.mockResolvedValue(threads);

    mockCodex.stub.newThread.mockResolvedValue({
      threadId: NEW_THREAD_ID,
      conversationId: NEW_CONVERSATION_ID,
      model: 'gpt-5-codex',
      reasoningEffort: 'medium',
      rolloutPath: `${WORKSPACE}/sessions/${NEW_THREAD_ID}.json`,
    });

    mockCodex.stub.initializeThread.mockResolvedValue({
      sessionConfigured: {
        session_id: NEW_CONVERSATION_ID,
        model: 'gpt-5-codex',
        model_provider_id: 'openai',
        approval_policy: 'on-request',
        sandbox_policy: { type: 'danger-full-access' },
        cwd: WORKSPACE,
        reasoning_effort: null,
        history_log_id: BigInt(0),
        history_entry_count: 0,
        initial_messages: [],
        rollout_path: `${WORKSPACE}/sessions/${NEW_THREAD_ID}.json`,
      },
      reasoningSummary: 'auto',
    });

    setActiveConversationId(ACTIVE_THREAD_ID);

    renderSidebarPanel({ openThreadIds: [ACTIVE_THREAD_ID] });

    const createButton = screen.getByRole('button', { name: /^New$/i });
    fireEvent.click(createButton);

    await markThreadOpenInTest(NEW_THREAD_ID);

    const newSessionButton = await screen.findByRole('button', {
      name: /Untitled session/i,
    });

    await waitFor(() => {
      expect(newSessionButton).toHaveAttribute('data-active', 'true');
    });

    act(() => {
      mockEvents.emitConversation(
        {
          type: 'user_message',
          message: 'Hello Codex',
          images: null,
        },
        { conversationId: NEW_CONVERSATION_ID }
      );
    });

    const updatedButton = await screen.findByRole('button', {
      name: /Hello Codex/i,
    });

    expect(updatedButton).toHaveAttribute('data-active', 'true');
  });

  test('only displays sessions that are currently open', async () => {
    const now = new Date().toISOString();

    const initialSessions: ThreadSummary[] = Array.from(
      { length: 25 },
      (_, index) => {
        const threadId =
          index === 0
            ? ACTIVE_THREAD_ID
            : `thread-${index.toString().padStart(2, '0')}`;
        const conversationId =
          index === 0
            ? ACTIVE_CONVERSATION_ID
            : `conversation-${index.toString().padStart(2, '0')}`;
        return {
          threadId,
          workspacePath: WORKSPACE,
          currentConversationId: conversationId,
          preview: `Session ${index}`,
          timestamp: now,
          rolloutCount: 1,
        };
      }
    );

    mockCodex.stub.listThreads.mockResolvedValue({ items: initialSessions });

    setActiveConversationId(ACTIVE_THREAD_ID);

    renderSidebarPanel({
      openThreadIds: [ACTIVE_THREAD_ID, 'thread-01'],
    });

    await screen.findByRole('button', { name: /Session 0/i });
    await screen.findByRole('button', { name: /Session 1/i });

    expect(screen.queryByRole('button', { name: /Session 2/i })).toBeNull();

    mockCodex.stub.initializeThread.mockResolvedValue({
      sessionConfigured: {
        session_id: 'conversation-02',
        model: 'gpt-5-codex',
        model_provider_id: 'openai',
        approval_policy: 'on-request',
        sandbox_policy: { type: 'danger-full-access' },
        cwd: WORKSPACE,
        reasoning_effort: null,
        history_log_id: BigInt(0),
        history_entry_count: 0,
        initial_messages: [],
        rollout_path: `${WORKSPACE}/sessions/thread-02.json`,
      },
      reasoningSummary: 'auto',
    });

    await markThreadOpenInTest('thread-02');

    await screen.findByRole('button', { name: /Session 2/i });
  });
});
