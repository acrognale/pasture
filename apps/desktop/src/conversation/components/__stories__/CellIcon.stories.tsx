import type { Meta, StoryObj } from '@storybook/react-vite';

import { CellIcon } from '../CellIcon';

const meta: Meta<typeof CellIcon> = {
  title: 'Components/Foundation/CellIcon',
  component: CellIcon,
  parameters: {
    layout: 'centered',
  },
  argTypes: {
    status: {
      control: 'select',
      options: [
        'success',
        'failure',
        'warning',
        'running',
        'pending',
        'in-progress',
        'info',
        'explore',
      ],
    },
  },
};

export default meta;

type Story = StoryObj<typeof CellIcon>;

export const Success: Story = {
  args: {
    status: 'success',
  },
};

export const Failure: Story = {
  args: {
    status: 'failure',
  },
};

export const Warning: Story = {
  args: {
    status: 'warning',
  },
};

export const Info: Story = {
  args: {
    status: 'info',
  },
};

export const Running: Story = {
  args: {
    status: 'running',
  },
};

export const Pending: Story = {
  args: {
    status: 'pending',
  },
};

export const InProgress: Story = {
  args: {
    status: 'in-progress',
  },
};

export const User: Story = {
  args: {},
};

export const Agent: Story = {
  args: {},
};

export const Explore: Story = {
  args: {
    status: 'explore',
  },
};

export const AllStates: Story = {
  render: () => (
    <div className="flex flex-col gap-4 p-6 bg-background">
      <div className="grid grid-cols-2 gap-4">
        <div className="flex items-center gap-3">
          <CellIcon status="success" />
          <span className="text-sm text-foreground">Success</span>
        </div>
        <div className="flex items-center gap-3">
          <CellIcon status="failure" />
          <span className="text-sm text-foreground">Failure</span>
        </div>
        <div className="flex items-center gap-3">
          <CellIcon status="warning" />
          <span className="text-sm text-foreground">Warning</span>
        </div>
        <div className="flex items-center gap-3">
          <CellIcon status="info" />
          <span className="text-sm text-foreground">Info</span>
        </div>
        <div className="flex items-center gap-3">
          <CellIcon status="running" />
          <span className="text-sm text-foreground">Running (animated)</span>
        </div>
        <div className="flex items-center gap-3">
          <CellIcon status="pending" />
          <span className="text-sm text-foreground">Pending</span>
        </div>
        <div className="flex items-center gap-3">
          <CellIcon status="in-progress" />
          <span className="text-sm text-foreground">In Progress</span>
        </div>
        <div className="flex items-center gap-3">
          <CellIcon status="explore" />
          <span className="text-sm text-foreground">Explore</span>
        </div>
      </div>
    </div>
  ),
};

export const DifferentSizes: Story = {
  render: () => (
    <div className="flex items-center gap-6 p-6 bg-background">
      <span className="text-xs">
        <CellIcon status="success" />
      </span>
      <span className="text-sm">
        <CellIcon status="success" />
      </span>
      <span className="text-base">
        <CellIcon status="success" />
      </span>
      <span className="text-lg">
        <CellIcon status="success" />
      </span>
      <span className="text-xl">
        <CellIcon status="success" />
      </span>
      <span className="text-2xl">
        <CellIcon status="success" />
      </span>
    </div>
  ),
};
