import type { Meta, StoryObj } from '@storybook/react-vite';

import { EmptyReviewState } from '../EmptyReviewState';

const meta: Meta<typeof EmptyReviewState> = {
  title: 'Components/Review/EmptyReviewState',
  component: EmptyReviewState,
  parameters: {
    layout: 'padded',
  },
};

export default meta;

type Story = StoryObj<typeof EmptyReviewState>;

export const Default: Story = {};

export const InCard: Story = {
  render: () => (
    <div className="h-96 w-full rounded-lg border border-border bg-card">
      <EmptyReviewState />
    </div>
  ),
};

export const InFullHeight: Story = {
  render: () => (
    <div className="h-screen w-full bg-background">
      <EmptyReviewState />
    </div>
  ),
};
