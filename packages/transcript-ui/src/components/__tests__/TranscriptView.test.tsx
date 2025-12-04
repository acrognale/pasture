// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest';
import { render, screen } from '@testing-library/react';
import React from 'react';
import { describe, expect, it } from 'vitest';

import type { TranscriptState } from '../../types';
import { TranscriptView } from '../TranscriptView';

const buildTranscript = (): TranscriptState => ({
  turns: {
    turn1: {
      id: 'turn1',
      cells: [
        {
          id: 'cell-user',
          timestamp: '2024-01-01T00:00:00Z',
          eventIds: [],
          kind: 'user-message',
          message: 'Hello world',
          messageKind: 'plain',
          images: null,
          itemId: null,
        },
        {
          id: 'cell-agent',
          timestamp: '2024-01-01T00:01:00Z',
          eventIds: [],
          kind: 'agent-message',
          message: 'Agent reply',
          streaming: false,
          itemId: null,
        },
      ],
      startedAt: null,
      completedAt: null,
      status: 'active',
    },
  },
  turnOrder: ['turn1'],
  latestReasoningHeader: null,
  pendingReasoningText: null,
  shouldBreakExecGroup: false,
  openUserMessageCell: null,
  openAgentMessageCell: null,
  reasoningSummaryFormat: 'none',
  latestTurnDiff: null,
  turnDiffHistory: [],
  activeTurnId: 'turn1',
});

describe('TranscriptView', () => {
  it('renders default mapping for common cell kinds', () => {
    render(
      <TranscriptView transcript={buildTranscript()} enableCollapsing={false} />
    );

    expect(screen.getByText('Hello world')).toBeInTheDocument();
    expect(screen.getByText('Agent reply')).toBeInTheDocument();
  });

  it('applies per-kind overrides when provided', () => {
    render(
      <TranscriptView
        transcript={buildTranscript()}
        enableCollapsing={false}
        overrides={{
          'user-message': ({ defaultNode }) => (
            <div data-testid="custom-user">{defaultNode}</div>
          ),
        }}
      />
    );

    expect(screen.getByTestId('custom-user')).toBeInTheDocument();
    expect(screen.getAllByText('Hello world').length).toBeGreaterThan(0);
  });
});
