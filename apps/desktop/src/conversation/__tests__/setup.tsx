import type { ConversationId } from '@pasture/protocol';
import { useEffect } from 'react';
import { ConversationPane } from '~/conversation/ConversationPane';
import { ConversationProvider } from '~/conversation/store';
import { mockCodex, mockEvents } from '~/testing/codex';
import { renderWithProviders } from '~/testing/harness';
import { WorkspaceProvider, useWorkspaceActions } from '~/workspace';

export const WORKSPACE = '/Users/tester/workspace';

export const setupConversationTest = (
  conversationId: ConversationId = 'test-conversation'
) => {
  const timestamp = new Date().toISOString();

  mockCodex.stub.listThreads.mockResolvedValue({
    items: [
      {
        threadId: conversationId,
        workspacePath: WORKSPACE,
        currentConversationId: conversationId,
        preview: '',
        title: null,
        timestamp,
        conversationCount: 1,
      },
    ],
  });

  mockCodex.stub.initializeThread.mockResolvedValue({
    conversationId,
    sessionConfigured: {
      session_id: conversationId,
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
      rollout_path: `${WORKSPACE}/history/${conversationId}.json`,
    },
    reasoningSummary: 'auto',
  });

  mockCodex.stub.getComposerConfig.mockResolvedValue({
    model: null,
    reasoningEffort: null,
    summary: null,
    sandbox: null,
    approval: null,
    webSearchEnabled: false,
  });

  mockEvents.setDefaultConversationId(conversationId);

  return conversationId;
};

export const renderConversationPane = (
  conversationId: ConversationId,
  workspacePath = WORKSPACE
) =>
  renderWithProviders(
    <WorkspaceProvider workspacePath={workspacePath}>
      <ConversationProvider workspacePath={workspacePath}>
        <ThreadLoader threadId={conversationId} />
        <ConversationPane
          workspacePath={workspacePath}
          conversationId={conversationId}
        />
      </ConversationProvider>
    </WorkspaceProvider>
  );

const ThreadLoader = ({ threadId }: { threadId: string }) => {
  const { loadThread } = useWorkspaceActions();
  useEffect(() => {
    void loadThread(threadId, { force: true });
  }, [loadThread, threadId]);
  return null;
};
