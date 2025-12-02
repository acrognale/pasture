import {
  TranscriptView,
  type TranscriptAgentMessageCell,
  type TranscriptState,
  type TranscriptTurn,
} from '@pasture/transcript-ui';
import { screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { buildControllerFromFixture } from '~/conversation/__tests__/fixtures';
import { renderWithProviders } from '~/testing/harness';
import { WorkspaceProvider } from '~/workspace';

import { createTranscriptOverrides } from '../transcriptOverrides';

describe('TranscriptList', () => {
  it('renders the exploration collapse with expected entries and agent output', () => {
    const state = buildControllerFromFixture('explore-the-code.jsonl');
    const { turnOrder } = state.conversation.transcript;
    const expandedTurns = turnOrder[0] ? { [turnOrder[0]]: true } : {};
    const overrides = createTranscriptOverrides({
      conversationId: 'test-conversation',
    });

    renderWithProviders(
      <WorkspaceProvider workspacePath="/tmp/workspace">
        <TranscriptView
          transcript={state.conversation.transcript as TranscriptState}
          expandedTurns={expandedTurns}
          onToggleTurn={vi.fn()}
          overrides={overrides}
        />
      </WorkspaceProvider>
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

  it('does not render collapsed entries twice when a turn has completed', () => {
    const state = buildControllerFromFixture('explore-the-code.jsonl');
    const overrides = createTranscriptOverrides({
      conversationId: 'test-conversation',
    });

    renderWithProviders(
      <WorkspaceProvider workspacePath="/tmp/workspace">
        <TranscriptView
          transcript={state.conversation.transcript as TranscriptState}
          expandedTurns={{}}
          onToggleTurn={vi.fn()}
          overrides={overrides}
        />
      </WorkspaceProvider>
    );

    expect(screen.getAllByText('explore the code')).toHaveLength(1);
    expect(screen.queryByText('List ls')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: /hidden/i })).toBeInTheDocument();
  });

  it('collapses through the last agent response when multiple agent messages exist', () => {
    const state = buildControllerFromFixture('explore-the-code.jsonl');
    const { turns, turnOrder } = state.conversation.transcript;
    const turnId = turnOrder[0];
    expect(turnId).toBeDefined();
    const originalTurn = turnId ? turns[turnId] : null;
    expect(originalTurn).not.toBeNull();
    if (!turnId || !originalTurn) {
      throw new Error('Missing turn data in fixture');
    }
    const finalAgentCell = originalTurn.cells.find(
      (cell): cell is TranscriptAgentMessageCell =>
        cell.kind === 'agent-message'
    );
    expect(finalAgentCell).toBeDefined();
    if (!finalAgentCell) {
      throw new Error('Fixture missing agent message');
    }
    const earlyAgentCell: TranscriptAgentMessageCell = {
      ...finalAgentCell,
      id: `${finalAgentCell.id}-early`,
      message: 'Bootstrapping before running commands.',
      eventIds: [...finalAgentCell.eventIds, `${finalAgentCell.id}-early`],
      timestamp: new Date(
        Date.parse(finalAgentCell.timestamp) - 1000
      ).toISOString(),
      streaming: false,
    };
    const mutatedTurns: Record<string, TranscriptTurn> = {
      ...turns,
      [turnId]: {
        ...originalTurn,
        cells: [
          originalTurn.cells[0],
          earlyAgentCell,
          ...originalTurn.cells.slice(1),
        ],
      },
    };
    const overrides = createTranscriptOverrides({
      conversationId: 'test-conversation',
    });

    renderWithProviders(
      <WorkspaceProvider workspacePath="/tmp/workspace">
        <TranscriptView
          transcript={
            {
              ...state.conversation.transcript,
              turns: mutatedTurns,
            } as TranscriptState
          }
          expandedTurns={{}}
          onToggleTurn={vi.fn()}
          overrides={overrides}
        />
      </WorkspaceProvider>
    );

    expect(screen.getAllByText('explore the code')).toHaveLength(1);
    expect(screen.queryByText('List ls')).not.toBeInTheDocument();
  });
});
