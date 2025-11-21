import { describe, expect, it } from 'vitest';

import { createInitialTranscriptState } from '../state';
import type { TranscriptState } from '../types';
import { countTranscriptCells, flattenTranscript } from '../view';

const baseTimestamp = '2024-07-01T12:00:00.000Z';

const createTranscript = (): TranscriptState => ({
  ...createInitialTranscriptState(),
  turns: {
    'turn-1': {
      id: 'turn-1',
      cells: [
        {
          id: 'evt-user',
          kind: 'user-message',
          timestamp: baseTimestamp,
          eventIds: ['evt-user'],
          message: 'Summarize the latest changes.',
          messageKind: 'plain',
          images: null,
          itemId: null,
        },
        {
          id: 'evt-agent-1',
          kind: 'agent-message',
          timestamp: baseTimestamp,
          eventIds: ['evt-agent-1'],
          message: 'Here is the summary.',
          streaming: false,
          itemId: null,
        },
      ],
      startedAt: baseTimestamp,
      completedAt: baseTimestamp,
      status: 'completed',
    },
    'turn-2': {
      id: 'turn-2',
      cells: [
        {
          id: 'evt-plan',
          kind: 'plan',
          timestamp: baseTimestamp,
          eventIds: ['evt-plan'],
          explanation: 'Creating a plan',
          steps: [{ step: 'Step 1', status: 'in_progress' }],
        },
      ],
      startedAt: baseTimestamp,
      completedAt: baseTimestamp,
      status: 'completed',
    },
  },
  turnOrder: ['turn-1', 'turn-2'],
});

describe('transcript view helpers', () => {
  it('flattens transcript turns in order', () => {
    const transcript = createTranscript();
    const entries = flattenTranscript(transcript);
    expect(entries.map((entry) => entry.turnId)).toEqual([
      'turn-1',
      'turn-1',
      'turn-2',
    ]);
    expect(entries.map((entry) => entry.cell.id)).toEqual([
      'evt-user',
      'evt-agent-1',
      'evt-plan',
    ]);
  });

  it('counts total transcript cells across turns', () => {
    const transcript = createTranscript();
    expect(countTranscriptCells(transcript)).toBe(3);
  });
});
