import type { Meta, StoryObj } from '@storybook/react-vite';
import {
  TranscriptList,
  type TranscriptListRenderCell,
  type TranscriptTurn as SharedTranscriptTurn,
} from '@pasture/transcript-ui';

import { sampleTranscript } from '../../__stories__/mocks/data';
import type { TranscriptCell } from '@pasture/transcript-ui';
import { TranscriptCells } from '../TranscriptCells';

const renderCell: TranscriptListRenderCell = (
  cell,
  { nthUserMessage }: { nthUserMessage?: number }
) => (
  <TranscriptCells
    cell={cell as TranscriptCell}
    conversationId="storybook"
    nthUserMessage={nthUserMessage}
  />
);

const meta: Meta<typeof TranscriptList> = {
  title: 'Components/Conversation/TranscriptList',
  component: TranscriptList,
  parameters: {
    layout: 'padded',
  },
};

export default meta;

type Story = StoryObj<typeof TranscriptList>;

export const Default: Story = {
  args: {
    turns: sampleTranscript.turns as Record<string, SharedTranscriptTurn>,
    turnOrder: sampleTranscript.turnOrder,
    expandedTurns: {},
    renderCell,
    onToggleTurn: () => {},
  },
};

export const WithExpandedTurns: Story = {
  args: {
    turns: sampleTranscript.turns as Record<string, SharedTranscriptTurn>,
    turnOrder: sampleTranscript.turnOrder,
    expandedTurns: {
      'turn-1': true,
    },
    renderCell,
    onToggleTurn: () => {},
  },
};

export const EmptyTranscript: Story = {
  args: {
    turns: {} as Record<string, SharedTranscriptTurn>,
    turnOrder: [],
    expandedTurns: {},
    renderCell,
    onToggleTurn: () => {},
  },
};

export const InScrollableContainer: Story = {
  render: (args) => (
    <div className="h-96 overflow-y-auto bg-muted/30 p-4 rounded-lg border border-border">
      <TranscriptList
        {...args}
        renderCell={(cell, { nthUserMessage }) => (
          <TranscriptCells
            cell={cell as TranscriptCell}
            conversationId="storybook"
            nthUserMessage={nthUserMessage}
          />
        )}
      />
    </div>
  ),
  args: {
    turns: sampleTranscript.turns as Record<string, SharedTranscriptTurn>,
    turnOrder: sampleTranscript.turnOrder,
    expandedTurns: {},
    renderCell,
    onToggleTurn: () => {},
  },
};
