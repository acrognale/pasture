import type { Meta, StoryObj } from '@storybook/react-vite';
import type { ComposerTurnConfig } from '~/composer/config';
import { createDefaultComposerConfig } from '~/composer/config';

import { ModelConfigSelector } from '../ModelConfigSelector';

const meta: Meta<typeof ModelConfigSelector> = {
  title: 'Components/Composer/ModelConfigSelector',
  component: ModelConfigSelector,
  parameters: {
    layout: 'centered',
  },
  args: {
    onUpdate: () => {},
    conversationId: 'storybook-conversation',
  },
};

export default meta;

type Story = StoryObj<typeof ModelConfigSelector>;

const defaultConfig: ComposerTurnConfig = createDefaultComposerConfig();

export const Default: Story = {
  args: {
    composerConfig: defaultConfig,
  },
};

export const WithReasoningSummaryVisible: Story = {
  args: {
    composerConfig: {
      ...defaultConfig,
      summary: 'detailed',
    },
  },
};

export const WithReasoningSummaryHidden: Story = {
  args: {
    composerConfig: {
      ...defaultConfig,
      summary: 'none',
    },
  },
};

export const WithHighReasoningEffort: Story = {
  args: {
    composerConfig: {
      ...defaultConfig,
      reasoningEffort: 'high',
    },
  },
};

export const WithMinimalReasoningEffort: Story = {
  args: {
    composerConfig: {
      ...defaultConfig,
      reasoningEffort: 'minimal',
    },
  },
};

export const WithReadOnlySandbox: Story = {
  args: {
    composerConfig: {
      ...defaultConfig,
      sandbox: 'read-only',
    },
  },
};

export const WithFullAccessSandbox: Story = {
  args: {
    composerConfig: {
      ...defaultConfig,
      sandbox: 'danger-full-access',
    },
  },
};

export const WithAlwaysAskApproval: Story = {
  args: {
    composerConfig: {
      ...defaultConfig,
      approval: 'untrusted',
    },
  },
};

export const WithNeverAskApproval: Story = {
  args: {
    composerConfig: {
      ...defaultConfig,
      approval: 'never',
    },
  },
};

export const InComposerContext: Story = {
  render: (args) => (
    <div className="flex w-full max-w-2xl items-center justify-between rounded-lg border border-border bg-card p-3">
      <span className="text-sm text-muted-foreground">
        Model Configuration:
      </span>
      <ModelConfigSelector {...args} />
    </div>
  ),
  args: {
    composerConfig: defaultConfig,
  },
};

export const AllConfigurations: Story = {
  render: () => (
    <div className="flex flex-col gap-6 p-6 bg-background max-w-2xl">
      <div className="space-y-2">
        <h3 className="text-sm font-medium text-foreground">Default Config</h3>
        <div className="rounded-lg border border-border bg-card p-3">
          <ModelConfigSelector
            conversationId="storybook-conversation"
            composerConfig={defaultConfig}
            onUpdate={() => {}}
          />
        </div>
      </div>

      <div className="space-y-2">
        <h3 className="text-sm font-medium text-foreground">
          High Reasoning, Visible Summary
        </h3>
        <div className="rounded-lg border border-border bg-card p-3">
          <ModelConfigSelector
            conversationId="storybook-conversation"
            composerConfig={{
              ...defaultConfig,
              reasoningEffort: 'high',
              summary: 'detailed',
            }}
            onUpdate={() => {}}
          />
        </div>
      </div>

      <div className="space-y-2">
        <h3 className="text-sm font-medium text-foreground">
          Read-only Sandbox, Always Ask
        </h3>
        <div className="rounded-lg border border-border bg-card p-3">
          <ModelConfigSelector
            conversationId="storybook-conversation"
            composerConfig={{
              ...defaultConfig,
              sandbox: 'read-only',
              approval: 'untrusted',
            }}
            onUpdate={() => {}}
          />
        </div>
      </div>

      <div className="space-y-2">
        <h3 className="text-sm font-medium text-foreground">
          Full Access, Never Ask
        </h3>
        <div className="rounded-lg border border-border bg-card p-3">
          <ModelConfigSelector
            conversationId="storybook-conversation"
            composerConfig={{
              ...defaultConfig,
              sandbox: 'danger-full-access',
              approval: 'never',
            }}
            onUpdate={() => {}}
          />
        </div>
      </div>
    </div>
  ),
};
