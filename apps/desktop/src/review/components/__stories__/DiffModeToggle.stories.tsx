import type { Meta, StoryObj } from '@storybook/react-vite';
import { useState } from 'react';

import { DiffModeToggle } from '../DiffModeToggle';

const meta: Meta<typeof DiffModeToggle> = {
  title: 'Components/Review/DiffModeToggle',
  component: DiffModeToggle,
  parameters: {
    layout: 'centered',
  },
  args: {
    onClick: () => {},
  },
};

export default meta;

type Story = StoryObj<typeof DiffModeToggle>;

export const Active: Story = {
  args: {
    label: 'Unified',
    active: true,
  },
};

export const Inactive: Story = {
  args: {
    label: 'Split',
    active: false,
  },
};

export const LongLabel: Story = {
  args: {
    label: 'Side by Side',
    active: true,
  },
};

export const ToggleGroup: Story = {
  render: () => (
    <div className="flex items-center gap-1 rounded-lg bg-muted p-1">
      <DiffModeToggle label="Unified" active={true} onClick={() => {}} />
      <DiffModeToggle label="Split" active={false} onClick={() => {}} />
    </div>
  ),
};

export const InteractivePair: Story = {
  render: function InteractiveStory() {
    const [mode, setMode] = useState<'unified' | 'split'>('unified');

    return (
      <div className="flex items-center gap-1 rounded-lg bg-muted p-1">
        <DiffModeToggle
          label="Unified"
          active={mode === 'unified'}
          onClick={() => setMode('unified')}
        />
        <DiffModeToggle
          label="Split"
          active={mode === 'split'}
          onClick={() => setMode('split')}
        />
      </div>
    );
  },
};
