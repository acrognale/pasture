import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { buildControllerFromFixture } from '~/conversation/__tests__/fixtures';

import { TranscriptList } from '../TranscriptList';

describe('TranscriptList', () => {
  it('renders the exploration collapse with expected entries and agent output', () => {
    const state = buildControllerFromFixture('explore-the-code.jsonl');
    const { turns, turnOrder } = state.conversation.transcript;
    const expandedTurns = turnOrder[0]
      ? { [turnOrder[0]]: true }
      : {};

    render(
      <TranscriptList
        turns={turns}
        turnOrder={turnOrder}
        expandedTurns={expandedTurns}
        onToggleTurn={vi.fn()}
      />
    );

    expect(screen.getAllByText('explore the code')).toHaveLength(1);
    expect(screen.getByText('List ls')).toBeInTheDocument();
    expect(screen.getByText('Read README.md')).toBeInTheDocument();
    expect(screen.getByText('Read factorial3.py')).toBeInTheDocument();
    expect(screen.getByText('Read hello.py')).toBeInTheDocument();
    expect(screen.getByText('Read foobar.py')).toBeInTheDocument();
    expect(
      screen.getByText(/Repository has three simple Python scripts/i)
    ).toBeInTheDocument();
  });
});
