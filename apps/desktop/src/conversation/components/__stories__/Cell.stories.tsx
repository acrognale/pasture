import type { Meta, StoryObj } from '@storybook/react-vite';

import { Cell } from '../Cell';
import { CellIcon } from '../CellIcon';

const meta: Meta<typeof Cell> = {
  title: 'Components/Foundation/Cell',
  component: Cell,
  parameters: {
    layout: 'padded',
  },
};

export default meta;

type Story = StoryObj<typeof Cell>;

export const Default: Story = {
  args: {
    icon: <CellIcon status="info" />,
    children: 'This is a default cell with some content.',
  },
};

export const User: Story = {
  args: {
    icon: <CellIcon status="info" />,
    children: 'How do I implement authentication in my application?',
  },
};

export const Agent: Story = {
  args: {
    icon: <CellIcon status="info" />,
    children:
      "I'll help you implement authentication. Let me break this down into steps...",
  },
};

export const Success: Story = {
  args: {
    icon: <CellIcon status="success" />,
    children: 'Task completed successfully',
  },
};

export const Warning: Story = {
  args: {
    icon: <CellIcon status="warning" />,
    children: 'Warning: This operation may take some time',
  },
};

export const Danger: Story = {
  args: {
    icon: <CellIcon status="failure" />,
    children: 'Error: Failed to connect to the server',
  },
};

export const Running: Story = {
  args: {
    icon: <CellIcon status="running" />,
    children: 'Processing your request...',
  },
};

export const LongContent: Story = {
  args: {
    icon: <CellIcon status="info" />,
    children: `Authentication can be implemented in several ways depending on your requirements:

1. **Session-based authentication**: Traditional approach using cookies and sessions
2. **Token-based authentication**: Modern approach using JWT tokens
3. **OAuth 2.0**: For third-party authentication providers

Each approach has its own trade-offs in terms of security, scalability, and complexity. Would you like me to elaborate on any specific approach?`,
  },
};

export const WithComplexContent: Story = {
  args: {
    icon: <CellIcon status="info" />,
    children: (
      <div className="flex flex-col gap-2">
        <p>Here's what I found:</p>
        <ul className="list-disc list-inside">
          <li>3 authentication providers configured</li>
          <li>JWT tokens expire in 24 hours</li>
          <li>Refresh tokens expire in 7 days</li>
        </ul>
        <p className="text-success-foreground">All security checks passed</p>
      </div>
    ),
  },
};

export const AllIcons: Story = {
  render: () => (
    <div className="flex flex-col gap-2 bg-background">
      <Cell icon={<CellIcon status="info" />}>Cell with info icon</Cell>
      <Cell icon={<CellIcon status="success" />}>Cell with success icon</Cell>
      <Cell icon={<CellIcon status="warning" />}>Cell with warning icon</Cell>
      <Cell icon={<CellIcon status="failure" />}>Cell with failure icon</Cell>
      <Cell icon={<CellIcon status="running" />}>Cell with running icon</Cell>
      <Cell icon={<CellIcon status="in-progress" />}>
        Cell with in-progress icon
      </Cell>
      <Cell icon={<CellIcon status="explore" />}>Cell with explore icon</Cell>
      <Cell icon={<CellIcon status="pending" />}>Cell with pending icon</Cell>
    </div>
  ),
};

export const Conversation: Story = {
  render: () => (
    <div className="flex flex-col gap-1 bg-background max-w-3xl">
      <Cell icon={<CellIcon status="info" />}>
        What files are in the src directory?
      </Cell>
      <Cell icon={<CellIcon status="running" />}>Running: ls src/</Cell>
      <Cell icon={<CellIcon status="success" />}>
        Command completed successfully
      </Cell>
      <Cell icon={<CellIcon status="info" />}>
        I found 12 files in the src directory, including components/, utils/,
        and index.tsx
      </Cell>
    </div>
  ),
};
