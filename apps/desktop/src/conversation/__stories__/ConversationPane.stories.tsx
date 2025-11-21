import type { Meta, StoryObj } from '@storybook/react-vite';
import type { JSX } from 'react';

import { ConversationPane } from '../ConversationPane';
import {
  createSampleConversationState,
  sampleCollapsedTranscript,
  sampleComposerConfig,
  sampleConversationSummaries,
  sampleTranscript,
} from './mocks/data';
import { mockCodexControls, sampleConversationId } from './mocks/state';
import { createInitialTranscriptState } from '~/conversation/transcript/state';
import type { TranscriptCell } from '~/conversation/transcript/types';

const viewportDecorator = (Story: () => JSX.Element) => (
  <div
    className="flex items-stretch justify-center bg-background p-6"
    style={{
      width: 'min(1280px, 100vw)',
      height: 'min(900px, 100vh)',
      margin: '0 auto',
      overflow: 'hidden',
    }}
  >
    <div className="flex h-full w-full overflow-hidden rounded-xl border border-border bg-card shadow-lg">
      <Story />
    </div>
  </div>
);

const meta: Meta<typeof ConversationPane> = {
  title: 'Pages/ConversationPane',
  component: ConversationPane,
  decorators: [viewportDecorator],
  parameters: {
    layout: 'fullscreen',
  },
  args: {
    workspacePath: '/Users/anthony/proj/edex/main',
    conversationId: sampleConversationId,
  },
};

export default meta;

type Story = StoryObj<typeof ConversationPane>;

const setupBaseState = () => {
  mockCodexControls.reset();
  mockCodexControls.setConversations(sampleConversationSummaries);
  mockCodexControls.setConversationState(createSampleConversationState());
  mockCodexControls.setTranscript(sampleTranscript);
  mockCodexControls.setComposerConfig(sampleComposerConfig);
  mockCodexControls.setMutationPending(false);
  mockCodexControls.setInterruptPending(false);
};

export const Default: Story = {
  loaders: [
    () => {
      setupBaseState();
      return {};
    },
  ],
};

export const ActiveTurn: Story = {
  loaders: [
    () => {
      setupBaseState();
      mockCodexControls.setRuntime({
        activeTurnStartedAt: new Date().toISOString(),
        statusHeader: 'Synthesizing response',
      });
      mockCodexControls.setMutationPending(true);
      return {};
    },
  ],
};

export const CollapsedTurns: Story = {
  loaders: [
    () => {
      setupBaseState();
      mockCodexControls.setTranscript(sampleCollapsedTranscript);
      return {};
    },
  ],
};

export const EmptyTranscript: Story = {
  loaders: [
    () => {
      setupBaseState();
      mockCodexControls.setTranscript(createInitialTranscriptState());
      return {};
    },
  ],
};

export const LongTranscript: Story = {
  loaders: [
    () => {
      setupBaseState();
      const firstTurnId = sampleTranscript.turnOrder[0];
      const baseCells =
        (firstTurnId && sampleTranscript.turns[firstTurnId]?.cells) ?? [];
      const longCells = Array.from({ length: 8 }).flatMap((_value, index) => [
        {
          ...(baseCells[0] as TranscriptCell),
          id: `user-${index}`,
          message: `Question ${index + 1}: How does the renderer handle case ${index}?`,
          timestamp: new Date(Date.now() - (index + 1) * 60000).toISOString(),
        },
        {
          ...(baseCells[2] as TranscriptCell),
          id: `reasoning-${index}`,
          text: `Analyzing case ${index + 1}.\n\n${'Details...\n'.repeat(
            (index % 3) + 1
          )}`,
          timestamp: new Date(
            Date.now() - (index + 1) * 60000 + 5000
          ).toISOString(),
        },
        {
          ...(baseCells[8] as TranscriptCell),
          id: `agent-${index}`,
          message: `Summary for case ${index + 1} with actionable next steps.`,
          timestamp: new Date(
            Date.now() - (index + 1) * 60000 + 10000
          ).toISOString(),
        },
      ]);

      mockCodexControls.setTranscript({
        ...sampleTranscript,
        turns: {
          'turn-1': {
            ...sampleTranscript.turns['turn-1'],
            cells: longCells as TranscriptCell[],
          },
        },
        turnOrder: ['turn-1'],
        turnCounter: 1,
      });

      return {};
    },
  ],
};
