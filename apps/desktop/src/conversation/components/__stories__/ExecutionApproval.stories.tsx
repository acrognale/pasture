import type { Meta, StoryObj } from '@storybook/react-vite';
import type { TranscriptExecApprovalCell } from '~/conversation/transcript/types';

import { ExecutionApproval } from '../ExecutionApproval';

const meta: Meta<typeof ExecutionApproval> = {
  title: 'Components/Conversation/ExecutionApproval',
  component: ExecutionApproval,
  parameters: {
    layout: 'padded',
  },
};

export default meta;

type Story = StoryObj<typeof ExecutionApproval>;

const createCell = (
  overrides: Partial<TranscriptExecApprovalCell>
): TranscriptExecApprovalCell => ({
  id: 'approval-1',
  timestamp: new Date().toISOString(),
  eventIds: ['evt-1'],
  kind: 'exec-approval',
  callId: 'call-1',
  command: ['echo', 'Hello'],
  cwd: '/path/to/workspace',
  reason: null,
  decision: 'pending',
  ...overrides,
});

export const Pending: Story = {
  args: {
    cell: createCell({
      command: ['npm', 'test'],
      cwd: '/Users/john/projects/my-app',
      reason: 'Running tests to verify the changes work correctly.',
      decision: 'pending',
    }),
  },
};

export const Approved: Story = {
  args: {
    cell: createCell({
      command: ['npm', 'run', 'build'],
      cwd: '/Users/john/projects/my-app',
      reason: 'Building the application for production.',
      decision: 'approved',
    }),
  },
};

export const ApprovedForSession: Story = {
  args: {
    cell: createCell({
      command: ['git', 'status'],
      cwd: '/Users/john/projects/my-app',
      reason: 'Checking git status to see what files have changed.',
      decision: 'approved_for_session',
    }),
  },
};

export const Rejected: Story = {
  args: {
    cell: createCell({
      command: ['rm', '-rf', '/'],
      cwd: '/Users/john/projects/my-app',
      reason: 'DANGER: This command would delete all files on your system.',
      decision: 'rejected',
    }),
  },
};

export const WithoutReason: Story = {
  args: {
    cell: createCell({
      command: ['ls', '-la'],
      cwd: '/Users/john/projects/my-app',
      reason: null,
      decision: 'pending',
    }),
  },
};

export const WithoutCwd: Story = {
  args: {
    cell: createCell({
      command: ['pwd'],
      cwd: '',
      reason: 'Print the current working directory.',
      decision: 'pending',
    }),
  },
};

export const LongCommand: Story = {
  args: {
    cell: createCell({
      command: [
        'docker',
        'run',
        '--rm',
        '-v',
        '$(pwd):/app',
        '-w',
        '/app',
        'node:18',
        'npm',
        'test',
        '--',
        '--coverage',
        '--verbose',
      ],
      cwd: '/Users/john/projects/my-app',
      reason:
        'Running tests in a Docker container to ensure consistent environment.',
      decision: 'pending',
    }),
  },
};

export const GitCommit: Story = {
  args: {
    cell: createCell({
      command: ['git', 'commit', '-m', 'Fix authentication bug'],
      cwd: '/Users/john/projects/my-app',
      reason: 'Committing the fix for the authentication issue.',
      decision: 'pending',
    }),
  },
};

export const DatabaseCommand: Story = {
  args: {
    cell: createCell({
      command: ['psql', '-U', 'postgres', '-c', 'SELECT * FROM users LIMIT 10'],
      cwd: '/Users/john/projects/my-app',
      reason: 'Querying the database to check user data.',
      decision: 'pending',
    }),
  },
};

export const FileOperation: Story = {
  args: {
    cell: createCell({
      command: ['cp', 'src/config.example.ts', 'src/config.ts'],
      cwd: '/Users/john/projects/my-app',
      reason:
        'Copying the example config file to create a local configuration.',
      decision: 'pending',
    }),
  },
};

export const MultilineReason: Story = {
  args: {
    cell: createCell({
      command: ['npm', 'run', 'deploy'],
      cwd: '/Users/john/projects/my-app',
      reason: `Deploying the application to production.

This will:
1. Build the application
2. Run tests
3. Upload to the production server
4. Restart the service

Please ensure all changes have been committed and pushed to the repository.`,
      decision: 'pending',
    }),
  },
};

export const AllDecisions: Story = {
  render: () => (
    <div className="flex flex-col gap-2 max-w-3xl">
      <div className="text-xs text-muted-foreground mb-1">Pending:</div>
      <ExecutionApproval
        cell={createCell({
          command: ['npm', 'test'],
          reason: 'Running tests to verify changes.',
          decision: 'pending',
        })}
      />

      <div className="text-xs text-muted-foreground mb-1 mt-4">Approved:</div>
      <ExecutionApproval
        cell={createCell({
          command: ['npm', 'run', 'build'],
          reason: 'Building the application.',
          decision: 'approved',
        })}
      />

      <div className="text-xs text-muted-foreground mb-1 mt-4">
        Approved for session:
      </div>
      <ExecutionApproval
        cell={createCell({
          command: ['git', 'status'],
          reason: 'Checking git status.',
          decision: 'approved_for_session',
        })}
      />

      <div className="text-xs text-muted-foreground mb-1 mt-4">Rejected:</div>
      <ExecutionApproval
        cell={createCell({
          command: ['rm', '-rf', 'node_modules'],
          reason: 'Deleting node_modules directory.',
          decision: 'rejected',
        })}
      />
    </div>
  ),
};
