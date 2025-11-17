import type { Meta, StoryObj } from '@storybook/react-vite';
import { StatusIndicator } from '~/conversation/components/StatusIndicator';

const logAction =
  (label: string) =>
  (...args: unknown[]) =>
    console.log(`[story:${label}]`, ...args);

type StatusIndicatorComponent = typeof StatusIndicator;

const nowMinus = (seconds: number) =>
  new Date(Date.now() - seconds * 1000).toISOString();

const meta: Meta<StatusIndicatorComponent> = {
  title: 'Components/Conversation/StatusIndicator',
  component: StatusIndicator,
  args: {
    running: true,
    startedAt: nowMinus(90),
    header: 'Drafting release notes',
    interruptControlId: 'interrupt-conversation-button',
    onInterrupt: () => logAction('interrupt')(),
  },
};

export default meta;

type Story = StoryObj<StatusIndicatorComponent>;

export const Default: Story = {};

export const LongRunning: Story = {
  args: {
    startedAt: nowMinus(12 * 60),
    header: 'Executing lengthy command',
  },
};

export const WithoutHeader: Story = {
  args: {
    header: null,
  },
};
