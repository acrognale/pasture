import type { Meta, StoryObj } from '@storybook/react-vite';

import { sampleTranscript } from '../../__stories__/mocks/data';
import { TranscriptList } from '../TranscriptList';

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
    turns: sampleTranscript.turns,
    turnOrder: sampleTranscript.turnOrder,
    expandedTurns: {},
    onToggleTurn: () => {},
  },
};

export const WithExpandedTurns: Story = {
  args: {
    turns: sampleTranscript.turns,
    turnOrder: sampleTranscript.turnOrder,
    expandedTurns: {
      'turn-1': true,
    },
    onToggleTurn: () => {},
  },
};

export const EmptyTranscript: Story = {
  args: {
    turns: {},
    turnOrder: [],
    expandedTurns: {},
    onToggleTurn: () => {},
  },
};

export const InScrollableContainer: Story = {
  render: (args) => (
    <div className="h-96 overflow-y-auto bg-muted/30 p-4 rounded-lg border border-border">
      <TranscriptList {...args} />
    </div>
  ),
  args: {
    turns: sampleTranscript.turns,
    turnOrder: sampleTranscript.turnOrder,
    expandedTurns: {},
    onToggleTurn: () => {},
  },
};
