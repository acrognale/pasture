import type { Meta, StoryObj } from '@storybook/react-vite';
import { TranscriptCells } from '~/conversation/components/TranscriptCells';
import type {
  TranscriptCell,
  TranscriptCellKind,
} from '~/conversation/transcript/types';

import { sampleTranscript } from '../../__stories__/mocks/data';

const meta: Meta<typeof TranscriptCells> = {
  title: 'Components/Conversation/TranscriptCells',
  component: TranscriptCells,
  argTypes: {
    cell: { control: false },
  },
};

export default meta;

type Story = StoryObj<typeof TranscriptCells>;

const firstTurnId = sampleTranscript.turnOrder[0];
const flatCells: TranscriptCell[] = firstTurnId
  ? (sampleTranscript.turns[firstTurnId]?.cells ?? [])
  : [];

const getFallbackCell = (): TranscriptCell => {
  const defaultCell = flatCells[0];
  if (!defaultCell) {
    throw new Error('Sample transcript is missing cells for stories.');
  }
  return defaultCell;
};

export const Timeline: Story = {
  render: () => (
    <div className="flex flex-col gap-3 bg-background p-6">
      {flatCells.map((cell) => (
        <TranscriptCells key={cell.id} cell={cell} />
      ))}
    </div>
  ),
};

const findCell = (kind: TranscriptCellKind): TranscriptCell =>
  flatCells.find((cell) => cell.kind === kind) ?? getFallbackCell();

const buildSingleCellStory = (kind: TranscriptCellKind) =>
  ({
    render: () => {
      const cell = findCell(kind);
      return (
        <div className="bg-background p-6">
          <TranscriptCells cell={cell} />
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
          return <TranscriptCells key={cell.id} cell={cell} />;
        })}
      </div>
    );
  },
};
