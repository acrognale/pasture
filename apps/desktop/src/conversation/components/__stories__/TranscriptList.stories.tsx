import type { Meta, StoryObj } from '@storybook/react-vite';
import { buildTranscriptView } from '~/conversation/transcript/view';

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

const entries = buildTranscriptView(sampleTranscript.cells);

export const Default: Story = {
  args: {
    cells: sampleTranscript.cells,
    entries: entries,
    expandedTurns: {},
    onToggleTurn: () => {},
  },
};

export const WithExpandedTurns: Story = {
  args: {
    cells: sampleTranscript.cells,
    entries: entries,
    expandedTurns: {
      'turn-1': true,
      'turn-2': true,
    },
    onToggleTurn: () => {},
  },
};

export const EmptyTranscript: Story = {
  args: {
    cells: [],
    entries: [],
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
    cells: sampleTranscript.cells,
    entries: entries,
    expandedTurns: {},
    onToggleTurn: () => {},
  },
};
