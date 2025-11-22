import type { Meta, StoryObj } from '@storybook/react-vite';
import type { TranscriptExecCommandCell } from '~/conversation/transcript/types';

import { ExecutionResult } from '../ExecutionResult';

const meta: Meta<typeof ExecutionResult> = {
  title: 'Components/Conversation/ExecutionResult',
  component: ExecutionResult,
  parameters: {
    layout: 'padded',
  },
};

export default meta;

type Story = StoryObj<typeof ExecutionResult>;

const createCell = (
  overrides: Partial<TranscriptExecCommandCell>
): TranscriptExecCommandCell => ({
  id: 'exec-1',
  timestamp: new Date().toISOString(),
  eventIds: ['evt-1'],
  kind: 'exec',
  callId: 'call-1',
  command: ['echo', 'Hello World'],
  cwd: '/path/to/workspace',
  parsed: [],
  status: 'succeeded',
  stdout: '',
  stderr: '',
  exitCode: 0,
  aggregatedOutput: '',
  formattedOutput: '',
  streaming: false,
  duration: null,
  outputChunks: [],
  exploration: null,
  ...overrides,
});

export const Success: Story = {
  args: {
    cell: createCell({
      command: ['npm', 'test'],
      stdout:
        'PASS  src/components/Cell.test.tsx\n  Cell\n    ✓ renders correctly (23ms)\n\nTest Suites: 1 passed, 1 total\nTests:       1 passed, 1 total',
      status: 'succeeded',
      exitCode: 0,
    }),
  },
};

export const Failed: Story = {
  args: {
    cell: createCell({
      command: ['npm', 'run', 'build'],
      stderr:
        "ERROR: Failed to compile\n\nsrc/App.tsx:12:5 - error TS2322: Type 'string' is not assignable to type 'number'.\n\n12     count: \"invalid\"\n       ~~~~~",
      status: 'failed',
      exitCode: 1,
    }),
  },
};

export const Running: Story = {
  args: {
    cell: createCell({
      command: ['npm', 'install'],
      aggregatedOutput:
        'added 524 packages in 12s\n\n145 packages are looking for funding',
      status: 'running',
      streaming: true,
      exitCode: null,
    }),
  },
};

export const LongOutput: Story = {
  args: {
    cell: createCell({
      command: ['ls', '-la'],
      stdout: `total 128
drwxr-xr-x  15 user  staff   480 Nov 14 10:30 .
drwxr-xr-x   8 user  staff   256 Nov 13 09:15 ..
-rw-r--r--   1 user  staff   123 Nov 14 10:30 .gitignore
-rw-r--r--   1 user  staff  1234 Nov 14 10:30 README.md
drwxr-xr-x  10 user  staff   320 Nov 14 10:30 src
drwxr-xr-x   5 user  staff   160 Nov 14 10:30 dist
-rw-r--r--   1 user  staff  5678 Nov 14 10:30 package.json
-rw-r--r--   1 user  staff 45678 Nov 14 10:30 package-lock.json
drwxr-xr-x 500 user  staff 16000 Nov 14 10:30 node_modules`,
      status: 'succeeded',
      exitCode: 0,
    }),
  },
};

export const MixedOutput: Story = {
  args: {
    cell: createCell({
      command: ['node', 'script.js'],
      stdout:
        'Processing file 1...\nProcessing file 2...\nProcessing file 3...\nDone!',
      stderr:
        'Warning: File 2 is deprecated\nWarning: Consider updating file 3',
      status: 'succeeded',
      exitCode: 0,
    }),
  },
};

export const EmptyOutput: Story = {
  args: {
    cell: createCell({
      command: ['touch', 'newfile.txt'],
      stdout: '',
      stderr: '',
      status: 'succeeded',
      exitCode: 0,
    }),
  },
};

export const GitCommand: Story = {
  args: {
    cell: createCell({
      command: ['git', 'status'],
      stdout: `On branch main
Your branch is up to date with 'origin/main'.

Changes not staged for commit:
  modified:   src/components/Cell.tsx
  modified:   src/components/CellIcon.tsx

no changes added to commit`,
      status: 'succeeded',
      exitCode: 0,
    }),
  },
};

export const SearchCommand: Story = {
  args: {
    cell: createCell({
      command: ['grep', '-r', 'TODO', 'src/'],
      stdout:
        'src/components/Cell.tsx:15:// TODO: Add accessibility attributes\nsrc/utils/format.ts:42:// TODO: Optimize performance\nsrc/App.tsx:8:// TODO: Add error boundary',
      status: 'succeeded',
      exitCode: 0,
    }),
  },
};

export const ErrorWithExitCode: Story = {
  args: {
    cell: createCell({
      command: ['curl', 'https://invalid-url.example.com'],
      stderr: 'curl: (6) Could not resolve host: invalid-url.example.com',
      status: 'failed',
      exitCode: 6,
    }),
  },
};

export const AllStates: Story = {
  render: () => (
    <div className="flex flex-col gap-2 max-w-3xl">
      <ExecutionResult
        cell={createCell({
          command: ['npm', 'test'],
          stdout: 'All tests passed!',
          status: 'succeeded',
          exitCode: 0,
        })}
      />
      <ExecutionResult
        cell={createCell({
          command: ['npm', 'run', 'build'],
          stderr: 'Build failed: syntax error',
          status: 'failed',
          exitCode: 1,
        })}
      />
      <ExecutionResult
        cell={createCell({
          command: ['npm', 'install'],
          aggregatedOutput: 'Installing packages...',
          status: 'running',
          streaming: true,
        })}
      />
    </div>
  ),
};
