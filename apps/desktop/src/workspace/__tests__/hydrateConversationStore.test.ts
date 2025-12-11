// @vitest-environment node
import { QueryClient } from '@tanstack/react-query';
import { describe, expect, test } from 'vitest';
import { createWorkspaceKeys } from '~/lib/workspaceKeys';
import { mockCodex } from '~/testing/codex';

import { createWorkspaceStore } from '../store';

const WORKSPACE_PATH = '/Users/tester/workspace';
const THREAD_ID = 'thread-1';
const CONVERSATION_ID = 'conversation-1';

describe('hydrateConversationStore', () => {
  test('groups initial messages into turns by user_message boundaries', async () => {
    mockCodex.stub.initializeThread.mockResolvedValue({
      sessionConfigured: {
        session_id: CONVERSATION_ID,
        model: 'gpt-5-codex',
        model_provider_id: 'openai',
        approval_policy: 'on-request',
        sandbox_policy: { type: 'danger-full-access' },
        cwd: WORKSPACE_PATH,
        reasoning_effort: null,
        history_log_id: BigInt(0),
        history_entry_count: 0,
        initial_messages: [
          { type: 'user_message', message: 'hello', images: null },
          { type: 'agent_message', message: 'hi there' },
          { type: 'agent_message', message: 'more' },
          { type: 'user_message', message: 'second', images: null },
          { type: 'agent_message', message: 'reply second' },
        ],
        rollout_path: `${WORKSPACE_PATH}/history/${CONVERSATION_ID}.jsonl`,
      },
      reasoningSummary: 'auto',
    });

    const workspaceStore = createWorkspaceStore({
      workspacePath: WORKSPACE_PATH,
      normalizedWorkspacePath: null,
      keys: createWorkspaceKeys(WORKSPACE_PATH),
      queryClient: new QueryClient(),
    });

    await workspaceStore
      .getState()
      .actions.loadThread(THREAD_ID, { force: true });

    const conversationId = workspaceStore
      .getState()
      .actions.getThreadConversationId(THREAD_ID);
    expect(conversationId).toBe(CONVERSATION_ID);

    const conversationStore = workspaceStore
      .getState()
      .actions.getConversationStore(conversationId);
    const transcript = conversationStore.getState().conversation.transcript;

    expect(transcript.turnOrder).toHaveLength(2);

    const [firstTurnId, secondTurnId] = transcript.turnOrder;
    expect(transcript.turns[firstTurnId!]?.status).toBe('completed');
    expect(transcript.turns[secondTurnId!]?.status).toBe('completed');
    expect(
      transcript.turns[firstTurnId!]?.cells.map((cell) => cell.kind)
    ).toEqual(['user-message', 'agent-message', 'agent-message']);
    expect(
      transcript.turns[secondTurnId!]?.cells.map((cell) => cell.kind)
    ).toEqual(['user-message', 'agent-message']);
  });

  test('adopts explicit tool turn_id for the whole buffered turn', async () => {
    mockCodex.stub.initializeThread.mockResolvedValue({
      sessionConfigured: {
        session_id: CONVERSATION_ID,
        model: 'gpt-5-codex',
        model_provider_id: 'openai',
        approval_policy: 'on-request',
        sandbox_policy: { type: 'danger-full-access' },
        cwd: WORKSPACE_PATH,
        reasoning_effort: null,
        history_log_id: BigInt(0),
        history_entry_count: 0,
        initial_messages: [
          { type: 'user_message', message: 'hello', images: null },
          {
            type: 'exec_command_begin',
            call_id: 'call-1',
            turn_id: 'turn-backend-1',
            command: ['ls'],
            cwd: WORKSPACE_PATH,
            parsed_cmd: [],
            source: 'agent',
          },
          {
            type: 'exec_command_end',
            call_id: 'call-1',
            turn_id: 'turn-backend-1',
            command: ['ls'],
            cwd: WORKSPACE_PATH,
            parsed_cmd: [],
            source: 'agent',
            exit_code: 0,
            stdout: '',
            stderr: '',
            aggregated_output: '',
            formatted_output: '',
            duration: '0',
          },
          { type: 'agent_message', message: 'done' },
        ],
        rollout_path: `${WORKSPACE_PATH}/history/${CONVERSATION_ID}.jsonl`,
      },
      reasoningSummary: 'auto',
    });

    const workspaceStore = createWorkspaceStore({
      workspacePath: WORKSPACE_PATH,
      normalizedWorkspacePath: null,
      keys: createWorkspaceKeys(WORKSPACE_PATH),
      queryClient: new QueryClient(),
    });

    await workspaceStore
      .getState()
      .actions.loadThread(THREAD_ID, { force: true });

    const conversationId = workspaceStore
      .getState()
      .actions.getThreadConversationId(THREAD_ID);
    const conversationStore = workspaceStore
      .getState()
      .actions.getConversationStore(conversationId);
    const transcript = conversationStore.getState().conversation.transcript;

    expect(transcript.turnOrder).toHaveLength(1);
    expect(transcript.turnOrder[0]).toBe('turn-backend-1');
    expect(
      transcript.turns['turn-backend-1']?.cells.map((cell) => cell.kind)
    ).toEqual(['user-message', 'exec', 'exec', 'agent-message']);
  });
});
