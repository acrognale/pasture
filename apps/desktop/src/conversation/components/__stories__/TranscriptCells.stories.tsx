import type { Meta, StoryObj } from '@storybook/react-vite';
import { TranscriptCells } from '~/conversation/components/TranscriptCells';
import type { TranscriptCell } from '~/conversation/transcript/types';

import { sampleTranscript } from '../../__stories__/mocks/data';

const meta: Meta<typeof TranscriptCells> = {
  title: 'Components/Conversation/TranscriptCells',
  component: TranscriptCells,
  argTypes: {
    cell: { control: false },
    index: { control: { type: 'number' } },
  },
};

export default meta;

type Story = StoryObj<typeof TranscriptCells>;

const firstTurnId = sampleTranscript.turnOrder[0];
const flatCells =
  (firstTurnId && sampleTranscript.turns[firstTurnId]?.cells) ?? [];

export const Timeline: Story = {
  render: () => (
    <div className="flex flex-col gap-3 bg-background p-6">
      {flatCells.map((cell, index) => (
        <TranscriptCells key={cell.id} cell={cell} index={index + 1} />
      ))}
    </div>
  ),
};

const findCell = (kind: string): TranscriptCell =>
  flatCells.find((cell) => cell.kind === kind) ?? flatCells[0];

const buildSingleCellStory = (kind: string) =>
  ({
    render: () => {
      const cell = findCell(kind);
      const index = flatCells.findIndex((entry) => entry === cell) + 1;
      return (
        <div className="bg-background p-6">
          <TranscriptCells cell={cell} index={index} />
        </div>
      );
    },
  }) satisfies Story;

export const ExecApproval = buildSingleCellStory('exec-approval');
export const PatchApproval = buildSingleCellStory('patch-approval');
export const MarkdownShowcase: Story = {
  render: () => {
    const markdownCells = flatCells.filter((cell) =>
      ['agent-message', 'agent-reasoning'].includes(cell.kind)
    );
    return (
      <div className="flex flex-col gap-4 bg-background p-6">
        {markdownCells.map((cell) => {
          const index = flatCells.findIndex((entry) => entry === cell) + 1;
          return <TranscriptCells key={cell.id} cell={cell} index={index} />;
        })}
      </div>
    );
  },
};
