import type { Meta, StoryObj } from '@storybook/react-vite';
import { useRef } from 'react';
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

export const WithAttachments: Story = {
  render: (args) => {
    const initialized = useRef(false);
    return (
      <ComposerBar
        {...args}
        onComposerReady={(controls) => {
          if (!controls || initialized.current) {
            return;
          }
          initialized.current = true;
          controls.setDraft('Queued message with screenshots attached.');
          controls.appendAttachments([
            {
              type: 'localImage',
              path: '/tmp/storybook-workspace/.codex-images/mock-1.png',
              width: 640,
              height: 360,
              fileName: 'mock-1.png',
            },
            {
              type: 'localImage',
              path: '/tmp/storybook-workspace/.codex-images/mock-2.png',
              width: 512,
              height: 512,
              fileName: 'mock-2.png',
            },
          ]);
        }}
      />
    );
  },
};
