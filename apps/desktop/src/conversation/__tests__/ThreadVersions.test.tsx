import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import React from 'react';
import { describe, expect, test } from 'vitest';
import type { Conversation } from '~/codex.gen/Conversation';
import { ConversationPane } from '~/conversation/ConversationPane';
import { ConversationProvider } from '~/conversation/store';
import { mockCodex, mockEvents } from '~/testing/codex';
import { renderWithProviders } from '~/testing/harness';
import { WorkspaceProvider, useWorkspaceActions } from '~/workspace';

import { WORKSPACE, setupConversationTest } from './setup';

const THREAD_ID = 'f387a944-c3c2-4cc6-9f21-4fe4853100d5';
const BASE_CONVERSATION_ID = '019ab3a1-b4cc-7812-945e-c5496d0ed6b2';
const FORK_CONVERSATION_ID = '019ab3a1-f1a6-7601-8583-b20987cc7fa7';

const buildConversationsFixture = (): Conversation[] => {
  const createdAtBase = '2025-11-24T02:11:50.617132+00:00';
  const createdAtFork = '2025-11-24T02:12:06.196488+00:00';
  return [
    {
      id: BASE_CONVERSATION_ID,
      threadId: THREAD_ID,
      rolloutPath:
        '/Users/anthony/.codex/sessions/2025/11/23/rollout-2025-11-23T21-11-50-019ab3a1-b4cc-7812-945e-c5496d0ed6b2.jsonl',
      createdAt: createdAtBase,
      label: null,
      parentConversationId: null,
      forkedAtNthUserMessage: null,
    },
    {
      id: FORK_CONVERSATION_ID,
      threadId: THREAD_ID,
      rolloutPath:
        '/Users/anthony/.codex/sessions/2025/11/23/rollout-2025-11-23T21-12-06-019ab3a1-f1a6-7601-8583-b20987cc7fa7.jsonl',
      createdAt: createdAtFork,
      label: null,
      parentConversationId: BASE_CONVERSATION_ID,
      forkedAtNthUserMessage: 1,
    },
  ];
};

describe('Thread version selector integration', () => {
  test('shows version selector for edited user message after reload', async () => {
    setupConversationTest(BASE_CONVERSATION_ID);

    const conversations = buildConversationsFixture();

    mockCodex.stub.listThreads.mockResolvedValueOnce({
      items: [
        {
          threadId: THREAD_ID,
          workspacePath: WORKSPACE,
          currentConversationId: FORK_CONVERSATION_ID,
          preview: 'test 123',
          title: null,
          timestamp: conversations[0]?.createdAt ?? new Date().toISOString(),
          conversationCount: conversations.length,
        },
      ],
    });

    // Initialize thread with the fork conversation as current
    mockCodex.stub.initializeThread.mockResolvedValueOnce({
      sessionConfigured: {
        session_id: FORK_CONVERSATION_ID,
        model: 'gpt-5-codex',
        model_provider_id: 'openai',
        approval_policy: 'on-request',
        sandbox_policy: { type: 'danger-full-access' },
        cwd: WORKSPACE,
        reasoning_effort: null,
        history_log_id: BigInt(0),
        history_entry_count: 0,
        initial_messages: [
          {
            type: 'user_message',
            message:
              '<environment_context>\\n  <cwd>/Users/anthony/proj/edex/test-workspace</cwd>\\n</environment_context>',
            images: null,
          },
          {
            type: 'user_message',
            message: 'test 789',
            images: null,
          },
        ],
        rollout_path: conversations[1]?.rolloutPath ?? '',
      },
      reasoningSummary: 'auto',
    });

    mockCodex.stub.switchConversation
      .mockResolvedValueOnce({
        conversationId: BASE_CONVERSATION_ID,
        sessionConfigured: {
          session_id: BASE_CONVERSATION_ID,
          model: 'gpt-5-codex',
          model_provider_id: 'openai',
          approval_policy: 'on-request',
          sandbox_policy: { type: 'danger-full-access' },
          cwd: WORKSPACE,
          reasoning_effort: null,
          history_log_id: BigInt(0),
          history_entry_count: 0,
          initial_messages: [
            {
              type: 'user_message',
              message:
                '<environment_context>\\n  <cwd>/Users/anthony/proj/edex/test-workspace</cwd>\\n</environment_context>',
              images: null,
            },
            {
              type: 'user_message',
              message: 'test 456',
              images: null,
            },
          ],
          rollout_path: conversations[0]?.rolloutPath ?? '',
        },
        reasoningSummary: 'auto',
      })
      .mockResolvedValueOnce({
        conversationId: FORK_CONVERSATION_ID,
        sessionConfigured: {
          session_id: FORK_CONVERSATION_ID,
          model: 'gpt-5-codex',
          model_provider_id: 'openai',
          approval_policy: 'on-request',
          sandbox_policy: { type: 'danger-full-access' },
          cwd: WORKSPACE,
          reasoning_effort: null,
          history_log_id: BigInt(0),
          history_entry_count: 0,
          initial_messages: [
            {
              type: 'user_message',
              message:
                '<environment_context>\\n  <cwd>/Users/anthony/proj/edex/test-workspace</cwd>\\n</environment_context>',
              images: null,
            },
            {
              type: 'user_message',
              message: 'test 789',
              images: null,
            },
          ],
          rollout_path: conversations[1]?.rolloutPath ?? '',
        },
        reasoningSummary: 'auto',
      });

    mockCodex.stub.listThreadConversations.mockResolvedValueOnce({
      threadId: THREAD_ID,
      currentConversationId: FORK_CONVERSATION_ID,
      conversations,
    });

    const ThreadLoader = ({ threadId }: { threadId: string }) => {
      const { loadThread } = useWorkspaceActions();
      // Load the thread (maps thread -> conversation)
      // and ignore the resolved conversationId; ConversationPane below uses the fork ID.
      React.useEffect(() => {
        void loadThread(threadId, { force: true });
      }, [loadThread, threadId]);
      return null;
    };

    renderWithProviders(
      <WorkspaceProvider workspacePath={WORKSPACE}>
        <ConversationProvider workspacePath={WORKSPACE}>
          <ThreadLoader threadId={THREAD_ID} />
          <ConversationUnderTest />
        </ConversationProvider>
      </WorkspaceProvider>
    );

    await screen.findByRole('textbox');

    // Hydrate transcript via a session_configured event as the runtime would
    mockEvents.emitConversation(
      {
        type: 'session_configured',
        session_id: FORK_CONVERSATION_ID,
        model: 'gpt-5-codex',
        model_provider_id: 'openai',
        approval_policy: 'on-request',
        sandbox_policy: { type: 'danger-full-access' },
        cwd: WORKSPACE,
        reasoning_effort: null,
        history_log_id: BigInt(0),
        history_entry_count: 0,
        initial_messages: [
          {
            type: 'user_message',
            message:
              '<environment_context>\\n  <cwd>/Users/anthony/proj/edex/test-workspace</cwd>\\n</environment_context>',
            images: null,
          },
          {
            type: 'user_message',
            message: 'test 789',
            images: null,
          },
        ],
        rollout_path: conversations[1]?.rolloutPath ?? '',
      },
      { conversationId: FORK_CONVERSATION_ID }
    );

    // Ensure the edited text is visible
    await screen.findByText('test 789', { exact: false });

    // Hover the user message region by focusing the transcript container
    const transcript = await waitFor(() => {
      const node = document.querySelector('[data-conversation-transcript]');
      if (!(node instanceof HTMLElement)) {
        throw new Error('Transcript container not found');
      }
      return node;
    });
    transcript.focus();

    // The version selector should appear with a 2/2 label-- test 789 is the edit, so it should appear after the first version
    await waitFor(() => {
      expect(screen.getByText('2/2', { exact: false })).toBeInTheDocument();
    });

    // click the previous version button
    await userEvent.click(
      screen.getByRole('button', { name: 'Previous version' })
    );

    // the version selector should now show a 1/2 label
    await waitFor(() => {
      expect(screen.getByText('1/2', { exact: false })).toBeInTheDocument();
    });

    await screen.findByText('test 456', { exact: false });

    // click the next version button
    await userEvent.click(screen.getByRole('button', { name: 'Next version' }));

    // the version selector should now show a 2/2 label
    await waitFor(() => {
      expect(screen.getByText('2/2', { exact: false })).toBeInTheDocument();
    });

    await screen.findByText('test 789', { exact: false });
  });
});

const ConversationUnderTest = () => {
  const [activeConversationId, setActiveConversationId] =
    React.useState(FORK_CONVERSATION_ID);

  return (
    <ConversationPane
      workspacePath={WORKSPACE}
      conversationId={activeConversationId}
      onConversationForked={setActiveConversationId}
    />
  );
};
