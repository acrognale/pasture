import { describe, expect, it } from 'vitest';

import type {
  TranscriptAgentMessageCell,
  TranscriptAgentReasoningCell,
  TranscriptPlanCell,
  TranscriptStatusCell,
  TranscriptUserMessageCell,
} from '../types';
import { buildTranscriptView } from '../view';

const baseTimestamp = '2024-07-01T12:00:00.000Z';

const userCell = (): TranscriptUserMessageCell => ({
  id: 'evt-user',
  kind: 'user-message' as const,
  timestamp: baseTimestamp,
  eventIds: ['evt-user'],
  message: 'Summarize the latest changes.',
  messageKind: 'plain',
  images: null,
  itemId: null,
});

const agentReasoningCell = (id: string): TranscriptAgentReasoningCell => ({
  id,
  kind: 'agent-reasoning' as const,
  timestamp: baseTimestamp,
  eventIds: [id],
  text: 'Thinking...',
  streaming: false,
  visible: true,
  itemId: null,
});

const agentMessageCell = (id: string): TranscriptAgentMessageCell => ({
  id,
  kind: 'agent-message' as const,
  timestamp: baseTimestamp,
  eventIds: [id],
  message: 'Here is the summary.',
  streaming: false,
  itemId: null,
});

const planCell = (id: string): TranscriptPlanCell => ({
  id,
  kind: 'plan' as const,
  timestamp: baseTimestamp,
  eventIds: [id],
  explanation: 'Creating a plan',
  steps: [{ step: 'Step 1', status: 'in_progress' }],
});

const turnAbortedCell = (id: string): TranscriptStatusCell => ({
  id,
  kind: 'status' as const,
  timestamp: baseTimestamp,
  eventIds: [id],
  statusType: 'turn-aborted',
  summary: 'Turn was interrupted',
  data: { reason: 'interrupted' },
});

describe('buildTranscriptView', () => {
  it('collapses intermediate cells between user and agent message', () => {
    const cells = [
      userCell(),
      agentReasoningCell('evt-reasoning-1'),
      agentReasoningCell('evt-reasoning-2'),
      agentMessageCell('evt-agent'),
    ];

    const view = buildTranscriptView(cells);
    expect(view).toHaveLength(2);
    expect(view[0]).toEqual({ type: 'cell', index: 0 });
    expect(view[1]).toEqual({
      type: 'collapsed-turn',
      turnId: 'turn::0::3::evt-user::evt-agent',
      userIndex: 0,
      hiddenIndices: [1, 2],
      finalAgentIndex: 3,
    });
  });

  it('falls back to standalone cells when no agent message is present', () => {
    const cells = [userCell(), agentReasoningCell('evt-reasoning-1')];

    const view = buildTranscriptView(cells);
    expect(view).toHaveLength(2);
    expect(view[0]).toEqual({ type: 'cell', index: 0 });
    expect(view[1]).toEqual({ type: 'cell', index: 1 });
  });

  it('collapses intermediate cells when turn is interrupted', () => {
    const cells = [
      userCell(),
      agentReasoningCell('evt-reasoning-1'),
      planCell('evt-plan'),
      turnAbortedCell('evt-aborted'),
    ];

    const view = buildTranscriptView(cells);
    expect(view).toHaveLength(2);
    expect(view[0]).toEqual({ type: 'cell', index: 0 });
    expect(view[1]).toEqual({
      type: 'collapsed-turn',
      turnId: 'turn::0::3::evt-user::evt-aborted',
      userIndex: 0,
      hiddenIndices: [1, 2],
      finalAgentIndex: 3,
    });
  });
});
