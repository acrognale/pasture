import { Cell, type TranscriptAgentMessageCell } from '@pasture/transcript-ui';
import type { Meta, StoryObj } from '@storybook/react-vite';
import { MessageCommentProvider } from '~/conversation/comments/MessageCommentContext';
import { MessageCommentDraftProvider } from '~/conversation/comments/MessageCommentDraftContext';

import { AgentMessage } from '../AgentMessage';

const meta: Meta<typeof AgentMessage> = {
  title: 'Components/Message/AgentMessage',
  component: AgentMessage,
  parameters: {
    layout: 'padded',
  },
  args: {
    conversationId: 'conversation-1',
  },
  decorators: [
    (Story, context) => (
      <MessageCommentProvider
        conversationId={context.args.conversationId as string}
        workspacePath="/tmp/workspace"
      >
        <MessageCommentDraftProvider>
          <div className="max-w-3xl">
            <Story />
          </div>
        </MessageCommentDraftProvider>
      </MessageCommentProvider>
    ),
  ],
};

export default meta;

type Story = StoryObj<typeof AgentMessage>;

const createCell = (
  overrides: Partial<TranscriptAgentMessageCell>
): TranscriptAgentMessageCell => ({
  id: 'agent-1',
  timestamp: new Date().toISOString(),
  eventIds: ['evt-1'],
  kind: 'agent-message',
  message: 'Default agent message',
  streaming: false,
  itemId: null,
  ...overrides,
});

export const Simple: Story = {
  args: {
    cell: createCell({
      message: 'I can help you with that. Let me analyze the code first.',
    }),
  },
};

export const WithMarkdown: Story = {
  args: {
    cell: createCell({
      message: `Here is a quick plan:
- List files
- Identify the target
- Apply fixes`,
    }),
  },
};

export const Streaming: Story = {
  args: {
    cell: createCell({
      message:
        'I am currently analyzing your request and will provide a response shortly',
      streaming: true,
    }),
  },
};

export const WithComments: Story = {
  args: {
    cell: createCell({
      message:
        'I inspected the auth flow and found that password reset tokens are stored in plaintext. We should hash them instead.',
    }),
  },
  render: (args) => (
    <div className="space-y-4">
      <AgentMessage {...args} />
      <p className="text-sm text-muted-foreground">
        Select any text in the message body to add an annotation. Annotations
        appear in the right sidebar.
      </p>
    </div>
  ),
};

export const Empty: Story = {
  args: {
    cell: createCell({
      message: '',
    }),
  },
};

export const MultipleMessages: Story = {
  render: (args) => (
    <div className="space-y-3">
      <Cell>
        <AgentMessage
          {...args}
          cell={createCell({
            id: 'agent-1',
            message: 'Let me search for authentication-related files.',
          })}
        />
      </Cell>
      <Cell>
        <AgentMessage
          {...args}
          cell={createCell({
            id: 'agent-2',
            message:
              'I found 3 files. Let me analyze the authentication implementation.',
            streaming: true,
          })}
        />
      </Cell>
      <Cell>
        <AgentMessage
          {...args}
          cell={createCell({
            id: 'agent-3',
            message: `The issue is a missing check around the JWT verification middleware.

I'll fix this now.`,
          })}
        />
      </Cell>
    </div>
  ),
};
