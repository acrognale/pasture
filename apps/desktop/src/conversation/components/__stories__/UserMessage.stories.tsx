import type { Meta, StoryObj } from '@storybook/react-vite';
import type { TranscriptUserMessageCell } from '~/conversation/transcript/types';

import { UserMessage } from '../UserMessage';

const meta: Meta<typeof UserMessage> = {
  title: 'Components/Message/UserMessage',
  component: UserMessage,
  parameters: {
    layout: 'padded',
  },
};

export default meta;

type Story = StoryObj<typeof UserMessage>;

const createCell = (
  overrides: Partial<TranscriptUserMessageCell>
): TranscriptUserMessageCell => ({
  id: 'user-1',
  timestamp: new Date().toISOString(),
  eventIds: ['evt-1'],
  kind: 'user-message',
  message: 'Default user message',
  messageKind: 'plain',
  images: null,
  itemId: null,
  ...overrides,
});

export const Simple: Story = {
  args: {
    cell: createCell({
      message: 'Can you help me fix this bug?',
    }),
    timestamp: new Date().toISOString(),
  },
};

export const MultiLine: Story = {
  args: {
    cell: createCell({
      message: `I'm seeing an error when I try to submit the form.

The error message says "Invalid credentials" but I'm sure the password is correct.

Can you help me debug this?`,
    }),
    timestamp: new Date().toISOString(),
  },
};

export const WithSlashCommand: Story = {
  args: {
    cell: createCell({
      message: 'Search for authentication-related files',
      messageKind: 'search',
    }),
    timestamp: new Date().toISOString(),
  },
};

export const WithImages: Story = {
  args: {
    cell: createCell({
      message: "Here's a screenshot of the error I'm getting",
      images: ['screenshot1.png', 'screenshot2.png'],
    }),
    timestamp: new Date().toISOString(),
  },
};

export const WithImagesAndCommand: Story = {
  args: {
    cell: createCell({
      message: "Analyze this screenshot and tell me what's wrong",
      messageKind: 'analyze',
      images: ['error-screenshot.png'],
    }),
    timestamp: new Date().toISOString(),
  },
};

export const Empty: Story = {
  args: {
    cell: createCell({
      message: '',
    }),
    timestamp: new Date().toISOString(),
  },
};

export const LongMessage: Story = {
  args: {
    cell: createCell({
      message: `I have a complex issue with my application that I need help with.

The problem started after I upgraded from React 17 to React 18. Now when users try to submit the registration form, the validation doesn't work correctly and sometimes the form submits even when there are validation errors.

I've checked the validation logic and it looks correct, but something must have changed with how React 18 handles state updates or form events.

Can you help me investigate this issue? I need to figure out:
1. What changed in React 18 that might affect form handling
2. How to fix the validation logic
3. Whether there are any other breaking changes I should be aware of

The relevant code is in src/components/RegistrationForm.tsx and src/hooks/useFormValidation.ts.`,
    }),
    timestamp: new Date().toISOString(),
  },
};

export const CodeSnippet: Story = {
  args: {
    cell: createCell({
      message: `Why doesn't this work?

function greet(name) {
  return "Hello " + name;
}

console.log(greet());`,
    }),
    timestamp: new Date().toISOString(),
  },
};

export const Question: Story = {
  args: {
    cell: createCell({
      message: 'What files are in the src directory?',
    }),
    timestamp: new Date().toISOString(),
  },
};

export const Task: Story = {
  args: {
    cell: createCell({
      message:
        'Please update the authentication system to use JWT tokens with expiration',
    }),
    timestamp: new Date().toISOString(),
  },
};

export const Conversation: Story = {
  render: () => (
    <div className="flex flex-col gap-1 max-w-3xl">
      <UserMessage
        cell={createCell({
          message: 'Search for all TypeScript files in src/',
          messageKind: 'search',
        })}
        timestamp={new Date().toISOString()}
      />
      <UserMessage
        cell={createCell({
          message:
            'Now find all files that import React and show me their structure',
        })}
        timestamp={new Date().toISOString()}
      />
      <UserMessage
        cell={createCell({
          message: "Here are some screenshots of the errors I'm seeing",
          images: ['error1.png', 'error2.png', 'error3.png'],
        })}
        timestamp={new Date().toISOString()}
      />
      <UserMessage
        cell={createCell({
          message: `Based on what you found, can you:
1. Fix the authentication bug
2. Add proper error handling
3. Update the tests`,
        })}
        timestamp={new Date().toISOString()}
      />
    </div>
  ),
};

export const AllVariations: Story = {
  render: () => (
    <div className="flex flex-col gap-3 max-w-3xl">
      <div>
        <div className="text-xs text-muted-foreground mb-1">
          Simple message:
        </div>
        <UserMessage
          cell={createCell({ message: 'Can you help me?' })}
          timestamp={new Date().toISOString()}
        />
      </div>
      <div>
        <div className="text-xs text-muted-foreground mb-1">
          With slash command:
        </div>
        <UserMessage
          cell={createCell({
            message: 'Find all React components',
            messageKind: 'search',
          })}
          timestamp={new Date().toISOString()}
        />
      </div>
      <div>
        <div className="text-xs text-muted-foreground mb-1">With images:</div>
        <UserMessage
          cell={createCell({
            message: 'Look at these screenshots',
            images: ['img1.png', 'img2.png'],
          })}
          timestamp={new Date().toISOString()}
        />
      </div>
      <div>
        <div className="text-xs text-muted-foreground mb-1">
          With both command and images:
        </div>
        <UserMessage
          cell={createCell({
            message: 'Analyze these error screenshots',
            messageKind: 'analyze',
            images: ['error.png'],
          })}
          timestamp={new Date().toISOString()}
        />
      </div>
    </div>
  ),
};
