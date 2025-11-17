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

export const Timeline: Story = {
  render: () => (
    <div className="flex flex-col gap-3 bg-background p-6">
      {sampleTranscript.cells.map((cell, index) => (
        <TranscriptCells key={cell.id} cell={cell} index={index + 1} />
      ))}
    </div>
  ),
};

const findCell = (kind: string): TranscriptCell =>
  sampleTranscript.cells.find((cell) => cell.kind === kind) ??
  sampleTranscript.cells[0];

const buildSingleCellStory = (kind: string) =>
  ({
    render: () => {
      const cell = findCell(kind);
      const index =
        sampleTranscript.cells.findIndex((entry) => entry === cell) + 1;
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
    const markdownCells = sampleTranscript.cells.filter((cell) =>
      ['agent-message', 'agent-reasoning'].includes(cell.kind)
    );
    return (
      <div className="flex flex-col gap-4 bg-background p-6">
        {markdownCells.map((cell) => {
          const index =
            sampleTranscript.cells.findIndex((entry) => entry === cell) + 1;
          return <TranscriptCells key={cell.id} cell={cell} index={index} />;
        })}
      </div>
    );
  },
};
