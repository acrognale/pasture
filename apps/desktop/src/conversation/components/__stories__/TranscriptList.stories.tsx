import { type TranscriptState, TranscriptView } from '@pasture/transcript-ui';
import type { Meta, StoryObj } from '@storybook/react-vite';

import { sampleTranscript } from '../../__stories__/mocks/data';
import { createTranscriptOverrides } from '../transcriptOverrides';

const transcript = sampleTranscript as TranscriptState;
const overrides = createTranscriptOverrides({ conversationId: 'storybook' });

const meta: Meta<typeof TranscriptView> = {
  title: 'Components/Conversation/TranscriptView',
  component: TranscriptView,
  parameters: {
    layout: 'padded',
  },
};

export default meta;

type Story = StoryObj<typeof TranscriptView>;

export const Default: Story = {
  args: {
    transcript,
    expandedTurns: {},
    onToggleTurn: () => {},
    overrides,
  },
};

export const WithExpandedTurns: Story = {
  args: {
    transcript,
    expandedTurns: { 'turn-1': true },
    onToggleTurn: () => {},
    overrides,
  },
};

export const EmptyTranscript: Story = {
  args: {
    transcript: { ...transcript, turns: {}, turnOrder: [] },
    expandedTurns: {},
    onToggleTurn: () => {},
    overrides,
  },
};

export const InScrollableContainer: Story = {
  render: (args) => (
    <div className="h-96 overflow-y-auto bg-muted/30 p-4 rounded-lg border border-border">
      <TranscriptView {...args} overrides={overrides} />
    </div>
  ),
  args: {
    transcript,
    expandedTurns: {},
    onToggleTurn: () => {},
    overrides,
  },
};
