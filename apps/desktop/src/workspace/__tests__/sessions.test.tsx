import type { InitializeThreadResponse } from '@pasture/protocol';
import type { ListThreadsResponse } from '@pasture/protocol';
import type { ThreadSummary } from '@pasture/protocol';
import { act, fireEvent, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, test } from 'vitest';
import { mockCodex, mockEvents } from '~/testing/codex';

import { WORKSPACE, markThreadOpenInTest, renderSidebarPanel } from './setup';

beforeEach(() => {
  // No router navigation in panel-based workspace.
});

const ACTIVE_THREAD_ID = 'thread-active';
const NEW_THREAD_ID = 'thread-new';
const ACTIVE_CONVERSATION_ID = 'conversation-active';
const NEW_CONVERSATION_ID = 'conversation-new';

describe('SidebarPanel sessions', () => {
  test('activates a newly created thread immediately', async () => {
    const now = new Date().toISOString();

    const threads: ListThreadsResponse = {
      items: [
        {
          threadId: ACTIVE_THREAD_ID,
          workspacePath: WORKSPACE,
          currentConversationId: ACTIVE_CONVERSATION_ID,
          preview: 'Existing session',
          title: null,
          timestamp: now,
          conversationCount: 1,
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
        skill_load_outcome: null,
        rollout_path: `${WORKSPACE}/sessions/${NEW_THREAD_ID}.json`,
      },
      reasoningSummary: 'auto',
    });

    renderSidebarPanel({ openThreadIds: [ACTIVE_THREAD_ID] });

    await screen.findByRole('button', { name: /Existing session/i });

    const createButton = screen.getByRole('button', { name: /^New$/i });
    fireEvent.click(createButton);

    await markThreadOpenInTest(NEW_THREAD_ID);

    const newSessionButton = await screen.findByRole('button', {
      name: /Untitled thread/i,
    });

    expect(newSessionButton).toBeInTheDocument();
    await waitFor(() => {
      expect(newSessionButton).toHaveAttribute('data-active', 'true');
    });
  });

  test('updates thread preview after the first user message', async () => {
    const now = new Date().toISOString();

    const threads: ListThreadsResponse = {
      items: [
        {
          threadId: ACTIVE_THREAD_ID,
          workspacePath: WORKSPACE,
          currentConversationId: ACTIVE_CONVERSATION_ID,
          preview: 'Existing session',
          title: null,
          timestamp: now,
          conversationCount: 1,
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
        skill_load_outcome: null,
        rollout_path: `${WORKSPACE}/sessions/${NEW_THREAD_ID}.json`,
      },
      reasoningSummary: 'auto',
    });

    renderSidebarPanel({ openThreadIds: [ACTIVE_THREAD_ID] });

    const createButton = screen.getByRole('button', { name: /^New$/i });
    fireEvent.click(createButton);

    await markThreadOpenInTest(NEW_THREAD_ID);

    const newSessionButton = await screen.findByRole('button', {
      name: /Untitled thread/i,
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
          title: null,
          timestamp: now,
          conversationCount: 1,
        };
      }
    );

    mockCodex.stub.listThreads.mockResolvedValue({ items: initialSessions });

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
        skill_load_outcome: null,
        rollout_path: `${WORKSPACE}/sessions/thread-02.json`,
      },
      reasoningSummary: 'auto',
    });

    await markThreadOpenInTest('thread-02');

    await screen.findByRole('button', { name: /Session 2/i });
  });

  test('reorders sessions when an older thread receives a new user message', async () => {
    const newestTimestamp = new Date('2024-01-02T00:00:00.000Z').toISOString();
    const olderTimestamp = new Date('2024-01-01T00:00:00.000Z').toISOString();

    const newestThread: ThreadSummary = {
      threadId: 'thread-newest',
      workspacePath: WORKSPACE,
      currentConversationId: 'conversation-newest',
      preview: 'Newest session',
      title: null,
      timestamp: newestTimestamp,
      conversationCount: 1,
    };

    const olderThread: ThreadSummary = {
      threadId: 'thread-older',
      workspacePath: WORKSPACE,
      currentConversationId: 'conversation-older',
      preview: 'Older session',
      title: null,
      timestamp: olderTimestamp,
      conversationCount: 1,
    };

    mockCodex.stub.listThreads.mockResolvedValue({
      items: [newestThread, olderThread],
    });

    const createInitializeThreadResponse = (
      thread: ThreadSummary
    ): InitializeThreadResponse => ({
      sessionConfigured: {
        session_id: thread.currentConversationId,
        model: 'gpt-5-codex',
        model_provider_id: 'openai',
        approval_policy: 'on-request',
        sandbox_policy: { type: 'danger-full-access' },
        cwd: WORKSPACE,
        reasoning_effort: null,
        history_log_id: BigInt(0),
        history_entry_count: 0,
        initial_messages: [],
        skill_load_outcome: null,
        rollout_path: `${WORKSPACE}/sessions/${thread.threadId}.json`,
      },
      reasoningSummary: 'auto',
    });

    mockCodex.stub.initializeThread
      .mockResolvedValueOnce(createInitializeThreadResponse(newestThread))
      .mockResolvedValueOnce(createInitializeThreadResponse(olderThread));

    renderSidebarPanel({
      openThreadIds: [newestThread.threadId, olderThread.threadId],
    });

    const newestSessionButton = await screen.findByRole('button', {
      name: /Newest session/i,
    });
    const olderSessionButton = await screen.findByRole('button', {
      name: /Older session/i,
    });

    expect(
      newestSessionButton.compareDocumentPosition(olderSessionButton) &
        Node.DOCUMENT_POSITION_FOLLOWING
    ).toBeTruthy();

    act(() => {
      mockEvents.emitConversation(
        {
          type: 'user_message',
          message: 'Ping',
          images: null,
        },
        { conversationId: olderThread.currentConversationId }
      );
    });

    await waitFor(() => {
      expect(
        olderSessionButton.compareDocumentPosition(newestSessionButton) &
          Node.DOCUMENT_POSITION_FOLLOWING
      ).toBeTruthy();
    });
  });
});
