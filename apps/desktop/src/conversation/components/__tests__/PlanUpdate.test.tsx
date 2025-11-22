import { render, screen } from '@testing-library/react';
import { describe, expect, test } from 'vitest';
import type { TranscriptPlanCell } from '~/conversation/transcript/types';

import { PlanUpdate } from '../PlanUpdate';

const createPlanCell = (): TranscriptPlanCell => ({
  id: 'plan-1',
  kind: 'plan',
  timestamp: '2024-06-01T12:00:00.000Z',
  eventIds: ['plan-event'],
  explanation: 'Ensure the release checklist is complete before cutover.',
  steps: [
    { step: 'Review outstanding bug reports', status: 'completed' },
    { step: 'Draft release announcement', status: 'in_progress' },
    { step: 'Schedule post-release follow-up', status: 'pending' },
  ],
});

describe('PlanUpdate', () => {
  test('renders explanation and plan steps', () => {
    const cell = createPlanCell();

    render(<PlanUpdate cell={cell} timestamp="12:00" />);

    expect(
      screen.getByText('Review outstanding bug reports')
    ).toBeInTheDocument();
    expect(screen.getByText('Draft release announcement')).toBeInTheDocument();
    expect(
      screen.getByText('Schedule post-release follow-up')
    ).toBeInTheDocument();
  });
});
