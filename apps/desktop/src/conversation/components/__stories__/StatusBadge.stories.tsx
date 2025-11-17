import type { Meta, StoryObj } from '@storybook/react-vite';

import { StatusBadge } from '../StatusBadge';

const meta: Meta<typeof StatusBadge> = {
  title: 'Components/Foundation/StatusBadge',
  component: StatusBadge,
  parameters: {
    layout: 'centered',
  },
  argTypes: {
    status: {
      control: 'select',
      options: ['running', 'succeeded', 'failed', 'pending'],
    },
    label: {
      control: 'text',
    },
  },
};

export default meta;

type Story = StoryObj<typeof StatusBadge>;

export const Running: Story = {
  args: {
    status: 'running',
  },
};

export const Succeeded: Story = {
  args: {
    status: 'succeeded',
  },
};

export const Failed: Story = {
  args: {
    status: 'failed',
  },
};

export const Pending: Story = {
  args: {
    status: 'pending',
  },
};

export const CustomLabel: Story = {
  args: {
    status: 'running',
    label: 'In Progress...',
  },
};

export const AllStates: Story = {
  render: () => (
    <div className="flex flex-wrap gap-3 p-6 bg-background">
      <StatusBadge status="running" />
      <StatusBadge status="succeeded" />
      <StatusBadge status="failed" />
      <StatusBadge status="pending" />
    </div>
  ),
};

export const CustomLabels: Story = {
  render: () => (
    <div className="flex flex-wrap gap-3 p-6 bg-background">
      <StatusBadge status="running" label="Executing..." />
      <StatusBadge status="succeeded" label="Complete" />
      <StatusBadge status="failed" label="Error" />
      <StatusBadge status="pending" label="Queued" />
    </div>
  ),
};

export const InContext: Story = {
  render: () => (
    <div className="flex flex-col gap-4 p-6 bg-background max-w-md">
      <div className="flex items-center justify-between p-3 bg-card rounded-lg border border-border">
        <span className="text-sm text-foreground">Build Process</span>
        <StatusBadge status="running" />
      </div>
      <div className="flex items-center justify-between p-3 bg-card rounded-lg border border-border">
        <span className="text-sm text-foreground">Tests</span>
        <StatusBadge status="succeeded" />
      </div>
      <div className="flex items-center justify-between p-3 bg-card rounded-lg border border-border">
        <span className="text-sm text-foreground">Deployment</span>
        <StatusBadge status="failed" />
      </div>
      <div className="flex items-center justify-between p-3 bg-card rounded-lg border border-border">
        <span className="text-sm text-foreground">Code Review</span>
        <StatusBadge status="pending" />
      </div>
    </div>
  ),
};
