import type { Meta, StoryObj } from '@storybook/react-vite';
import type { TranscriptToolCell } from '~/conversation/transcript/types';

import { Tools } from '../Tools';

const meta: Meta<typeof Tools> = {
  title: 'Components/Conversation/Tools',
  component: Tools,
  parameters: {
    layout: 'padded',
  },
};

export default meta;

type Story = StoryObj<typeof Tools>;

const createCell = (
  overrides: Partial<TranscriptToolCell>
): TranscriptToolCell => ({
  id: 'tool-1',
  timestamp: new Date().toISOString(),
  eventIds: ['evt-1'],
  kind: 'tool',
  toolType: 'web-search',
  status: 'succeeded',
  callId: null,
  query: null,
  result: null,
  duration: null,
  invocation: null,
  path: null,
  itemId: null,
  ...overrides,
});

export const MCPToolSuccess: Story = {
  args: {
    cell: createCell({
      toolType: 'mcp',
      status: 'succeeded',
      duration: '245ms',
      invocation: {
        server: 'github',
        tool: 'search_repositories',
        arguments: {
          query: 'react hooks',
          sort: 'stars',
          limit: 10,
        },
      },
      result: {
        repositories: [
          { name: 'react', stars: 215000 },
          { name: 'react-hooks', stars: 12500 },
        ],
        total_count: 2,
      },
    }),
    timestamp: new Date().toISOString(),
  },
};

export const MCPToolRunning: Story = {
  args: {
    cell: createCell({
      toolType: 'mcp',
      status: 'running',
      invocation: {
        server: 'database',
        tool: 'query',
        arguments: {
          sql: 'SELECT * FROM users WHERE active = true',
        },
      },
    }),
    timestamp: new Date().toISOString(),
  },
};

export const MCPToolFailed: Story = {
  args: {
    cell: createCell({
      toolType: 'mcp',
      status: 'failed',
      duration: '105ms',
      invocation: {
        server: 'api',
        tool: 'fetch_data',
        arguments: {
          endpoint: '/users/12345',
        },
      },
      result: {
        error: 'User not found',
        status: 404,
      },
    }),
    timestamp: new Date().toISOString(),
  },
};

export const ViewImageTool: Story = {
  args: {
    cell: createCell({
      toolType: 'view-image',
      status: 'succeeded',
      path: '/Users/john/screenshots/error-screenshot.png',
    }),
    timestamp: new Date().toISOString(),
  },
};

export const SearchTool: Story = {
  args: {
    cell: createCell({
      toolType: 'web-search',
      status: 'succeeded',
      query: 'authentication implementation',
      result: `Found 12 files matching "authentication":
- src/auth/AuthProvider.tsx
- src/auth/login.tsx
- src/utils/validateAuth.ts
- tests/auth.test.ts`,
    }),
    timestamp: new Date().toISOString(),
  },
};

export const ToolWithComplexResult: Story = {
  args: {
    cell: createCell({
      toolType: 'mcp',
      status: 'succeeded',
      duration: '1.2s',
      invocation: {
        server: 'analytics',
        tool: 'get_metrics',
        arguments: {
          timeRange: '7d',
          metrics: ['users', 'sessions', 'pageviews'],
        },
      },
      result: {
        users: {
          total: 15234,
          active: 8912,
          new: 1234,
        },
        sessions: {
          total: 45678,
          avg_duration: '5m 32s',
        },
        pageviews: {
          total: 156789,
          unique: 98765,
        },
        period: {
          start: '2024-11-07',
          end: '2024-11-14',
        },
      },
    }),
    timestamp: new Date().toISOString(),
  },
};

export const AllToolTypes: Story = {
  render: () => (
    <div className="flex flex-col gap-2 max-w-3xl">
      <div className="text-xs text-muted-foreground mb-1">
        MCP Tool - Success:
      </div>
      <Tools
        cell={createCell({
          toolType: 'mcp',
          status: 'succeeded',
          duration: '245ms',
          invocation: {
            server: 'github',
            tool: 'search_code',
            arguments: { query: 'useState' },
          },
          result: { matches: 42 },
        })}
        timestamp={new Date().toISOString()}
      />

      <div className="text-xs text-muted-foreground mb-1 mt-4">
        MCP Tool - Running:
      </div>
      <Tools
        cell={createCell({
          toolType: 'mcp',
          status: 'running',
          invocation: {
            server: 'database',
            tool: 'query',
            arguments: { table: 'users' },
          },
        })}
        timestamp={new Date().toISOString()}
      />

      <div className="text-xs text-muted-foreground mb-1 mt-4">
        MCP Tool - Failed:
      </div>
      <Tools
        cell={createCell({
          toolType: 'mcp',
          status: 'failed',
          duration: '105ms',
          invocation: {
            server: 'api',
            tool: 'fetch',
            arguments: { id: 999 },
          },
          result: { error: 'Not found' },
        })}
        timestamp={new Date().toISOString()}
      />

      <div className="text-xs text-muted-foreground mb-1 mt-4">
        View Image Tool:
      </div>
      <Tools
        cell={createCell({
          toolType: 'view-image',
          status: 'succeeded',
          path: '/path/to/screenshot.png',
        })}
        timestamp={new Date().toISOString()}
      />

      <div className="text-xs text-muted-foreground mb-1 mt-4">
        Search Tool:
      </div>
      <Tools
        cell={createCell({
          toolType: 'web-search',
          status: 'succeeded',
          query: 'TODO comments',
          result: 'Found 15 TODO comments across 8 files',
        })}
        timestamp={new Date().toISOString()}
      />
    </div>
  ),
};
