import type { ConversationId } from '~/codex.gen/ConversationId';
import { ConversationPane } from '~/conversation/ConversationPane';
import { ConversationProvider } from '~/conversation/store';
import { mockCodex, mockEvents } from '~/testing/codex';
import { renderWithProviders } from '~/testing/harness';
import { WorkspaceProvider } from '~/workspace';

export const WORKSPACE = '/Users/tester/workspace';

export const setupConversationTest = (
  conversationId: ConversationId = 'test-conversation'
) => {
  const timestamp = new Date().toISOString();

  mockCodex.stub.listConversations.mockResolvedValue({
    items: [
      {
        conversationId,
        path: `${WORKSPACE}/history/${conversationId}.json`,
        cwd: WORKSPACE,
        preview: '',
        timestamp,
      },
    ],
    nextCursor: null,
  });

  mockCodex.stub.initializeConversation.mockResolvedValue({
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
        <ConversationPane
          workspacePath={workspacePath}
          conversationId={conversationId}
        />
      </ConversationProvider>
    </WorkspaceProvider>
  );
