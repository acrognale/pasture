import type { Meta, StoryObj } from '@storybook/react-vite';
import type { TranscriptErrorCell } from '~/conversation/transcript/types';

import { Errors } from '../Errors';

const meta: Meta<typeof Errors> = {
  title: 'Components/Conversation/Errors',
  component: Errors,
  parameters: {
    layout: 'padded',
  },
};

export default meta;

type Story = StoryObj<typeof Errors>;

const createCell = (
  overrides: Partial<TranscriptErrorCell>
): TranscriptErrorCell => ({
  id: 'error-1',
  timestamp: new Date().toISOString(),
  eventIds: ['evt-1'],
  kind: 'error',
  severity: 'error',
  message: 'An error occurred',
  ...overrides,
});

export const Fatal: Story = {
  args: {
    cell: createCell({
      severity: 'error',
      message:
        'Fatal error: Unable to connect to the server. Please check your network connection and try again.',
    }),
    timestamp: new Date().toISOString(),
  },
};

export const Stream: Story = {
  args: {
    cell: createCell({
      severity: 'stream',
      message:
        'Warning: The API returned a partial response. Some data may be incomplete.',
    }),
    timestamp: new Date().toISOString(),
  },
};

export const AuthenticationError: Story = {
  args: {
    cell: createCell({
      severity: 'error',
      message:
        'Authentication failed: Invalid API key. Please check your credentials in settings.',
    }),
    timestamp: new Date().toISOString(),
  },
};

export const RateLimitError: Story = {
  args: {
    cell: createCell({
      severity: 'error',
      message:
        'Rate limit exceeded: Too many requests. Please wait 60 seconds before trying again.',
    }),
    timestamp: new Date().toISOString(),
  },
};

export const FileNotFoundError: Story = {
  args: {
    cell: createCell({
      severity: 'error',
      message:
        'File not found: src/components/NonExistent.tsx\n\nThe requested file does not exist in the workspace.',
    }),
    timestamp: new Date().toISOString(),
  },
};

export const ParseError: Story = {
  args: {
    cell: createCell({
      severity: 'stream',
      message:
        'Warning: Failed to parse response from AI model. Retrying with simplified prompt.',
    }),
    timestamp: new Date().toISOString(),
  },
};

export const TimeoutError: Story = {
  args: {
    cell: createCell({
      severity: 'error',
      message:
        'Request timeout: The operation took too long to complete and was cancelled after 30 seconds.',
    }),
    timestamp: new Date().toISOString(),
  },
};

export const MultilineError: Story = {
  args: {
    cell: createCell({
      severity: 'error',
      message: `Compilation error in src/App.tsx:

Line 42: Type 'string' is not assignable to type 'number'
Line 43: Property 'value' does not exist on type 'FormData'
Line 44: Expected 2 arguments, but got 1

Please fix these errors before continuing.`,
    }),
    timestamp: new Date().toISOString(),
  },
};

export const ShortError: Story = {
  args: {
    cell: createCell({
      severity: 'error',
      message: 'Connection refused',
    }),
    timestamp: new Date().toISOString(),
  },
};

export const AllSeverities: Story = {
  render: () => (
    <div className="flex flex-col gap-2 max-w-3xl">
      <div className="text-xs text-muted-foreground mb-1">Fatal error:</div>
      <Errors
        cell={createCell({
          severity: 'error',
          message: 'Fatal error: System crashed unexpectedly',
        })}
        timestamp={new Date().toISOString()}
      />
      <div className="text-xs text-muted-foreground mb-1 mt-4">
        Stream error (warning):
      </div>
      <Errors
        cell={createCell({
          severity: 'stream',
          message:
            'Warning: Partial data received, continuing with available information',
        })}
        timestamp={new Date().toISOString()}
      />
    </div>
  ),
};
