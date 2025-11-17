import type { Meta, StoryObj } from '@storybook/react-vite';
import { fn } from 'storybook/test';
import { ComposerBar } from '~/composer/components/ComposerBar';
import { sampleConversationSummaries } from '~/conversation/__stories__/mocks/data';

type ComposerBarComponent = typeof ComposerBar;

const meta: Meta<ComposerBarComponent> = {
  title: 'Components/Composer/ComposerBar',
  component: ComposerBar,
  args: {
    workspacePath: '/tmp/storybook-workspace',
    conversationId: sampleConversationSummaries[0]?.conversationId ?? 'session',
    isTurnActive: false,
    interruptPending: false,
    onInterrupt: fn(),
    onScrollToBottom: fn(),
    onRequestFocus: fn(),
    onComposerReady: fn(),
  },
};

export default meta;

type Story = StoryObj<ComposerBarComponent>;

export const Idle: Story = {};

export const ActiveTurn: Story = {
  args: {
    isTurnActive: true,
    stopButtonId: 'interrupt-conversation-button',
  },
};
