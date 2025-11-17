import type { Meta, StoryObj } from '@storybook/react-vite';
import { sampleConversationSummaries } from '~/conversation/__stories__/mocks/data';

import { ComposerBar } from '../ComposerBar';

const meta: Meta<typeof ComposerBar> = {
  title: 'Components/Composer/ComposerBar Responsive',
  component: ComposerBar,
  parameters: {
    layout: 'padded',
  },
  args: {
    workspacePath: '/tmp/storybook-workspace',
    conversationId: sampleConversationSummaries[0]?.conversationId ?? 'session',
    isTurnActive: false,
    interruptPending: false,
    onInterrupt: () => {},
    onScrollToBottom: () => {},
    onRequestFocus: () => {},
    onComposerReady: () => {},
  },
};

export default meta;

type Story = StoryObj<typeof ComposerBar>;

export const DesktopWidth: Story = {
  render: (args) => (
    <div className="w-full max-w-4xl">
      <ComposerBar {...args} />
    </div>
  ),
};

export const TabletWidth: Story = {
  render: (args) => (
    <div className="w-full max-w-2xl">
      <ComposerBar {...args} />
    </div>
  ),
};

export const NarrowWidth: Story = {
  render: (args) => (
    <div className="w-full max-w-xl">
      <ComposerBar {...args} />
    </div>
  ),
};

export const MobileWidth: Story = {
  render: (args) => (
    <div className="w-full max-w-sm">
      <ComposerBar {...args} />
    </div>
  ),
};

export const ResponsiveDemo: Story = {
  render: (args) => (
    <div className="space-y-8">
      <div>
        <h3 className="text-sm font-medium mb-2 text-foreground">
          Desktop (1024px+)
        </h3>
        <div className="w-full max-w-4xl border border-border rounded-lg p-2">
          <ComposerBar {...args} />
        </div>
      </div>

      <div>
        <h3 className="text-sm font-medium mb-2 text-foreground">
          Tablet (768px)
        </h3>
        <div className="w-full max-w-2xl border border-border rounded-lg p-2">
          <ComposerBar {...args} />
        </div>
      </div>

      <div>
        <h3 className="text-sm font-medium mb-2 text-foreground">
          Narrow (640px)
        </h3>
        <div className="w-full max-w-xl border border-border rounded-lg p-2 bg-amber-50">
          <ComposerBar {...args} />
        </div>
      </div>

      <div>
        <h3 className="text-sm font-medium mb-2 text-foreground">
          Mobile (375px)
        </h3>
        <div className="w-full max-w-sm border border-border rounded-lg p-2 bg-red-50">
          <ComposerBar {...args} />
        </div>
      </div>
    </div>
  ),
};
