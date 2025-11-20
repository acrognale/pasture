// @vitest-environment node
import { describe, expect, it } from 'vitest';
import {
  buildControllerFromFixture,
  loadFixtureEvents,
} from '~/conversation/__tests__/fixtures';
import type {
  TranscriptAgentReasoningCell,
  TranscriptExecCommandCell,
  TranscriptExplorationCall,
  TranscriptUserMessageCell,
} from '~/conversation/transcript/types';
import { buildTranscriptView } from '~/conversation/transcript/view';

import type { ConversationControllerState } from '../reducer';
import { createConversationStore } from '../store';

const getUserMessages = (state: ConversationControllerState) =>
  state.conversation.transcript.cells.filter(
    (cell): cell is TranscriptUserMessageCell => cell.kind === 'user-message'
  );

const describeCall = (call: TranscriptExplorationCall): string => {
  const parsed = call.parsed[0];
  if (!parsed) {
    return call.command.join(' ');
  }
  switch (parsed.type) {
    case 'list_files':
      return `List ${parsed.path ?? parsed.cmd}`;
    case 'read':
      return `Read ${parsed.name ?? parsed.path ?? parsed.cmd}`;
    case 'search': {
      const query = parsed.query ?? parsed.cmd;
      const suffix = parsed.path ? ` in ${parsed.path}` : '';
      return `Search ${query}${suffix}`;
    }
    default:
      return parsed.cmd;
  }
};

describe('ConversationReducer fixtures', () => {
  it('does not duplicate user messages after tool-driven turns', () => {
    const state = buildControllerFromFixture('explore-the-code.jsonl');
    const userMessages = getUserMessages(state);
    expect(userMessages).toHaveLength(1);
    expect(userMessages[0]?.message).toBe('explore the code');

    const { cells } = state.conversation.transcript;
    expect(cells).toHaveLength(4);

    const execCell = cells.find(
      (cell): cell is TranscriptExecCommandCell => cell.kind === 'exec'
    );
    expect(execCell?.exploration?.calls).toHaveLength(5);
    const explorationSummaries =
      execCell?.exploration?.calls.map((call) => describeCall(call)) ?? [];
    expect(explorationSummaries).toEqual([
      'List ls',
      'Read README.md',
      'Read factorial3.py',
      'Read hello.py',
      'Read foobar.py',
    ]);

    const agentCell = cells.find((cell) => cell.kind === 'agent-message');
    expect(agentCell?.message).toContain('factorial3.py');
    expect(agentCell?.message).toContain('hello.py');
    expect(agentCell?.message).toContain('foobar.py');

    const entries = buildTranscriptView(cells);
    expect(entries[0]).toEqual({ type: 'cell', index: 0 });
    expect(entries[1]).toMatchObject({
      type: 'collapsed-turn',
      userIndex: 0,
      finalAgentIndex: 2,
    });
    expect(entries[2]).toEqual({ type: 'cell', index: 3 });
  });

  it('emits reasoning text when agent_reasoning arrives with empty body', () => {
    const store = createConversationStore();
    store.getState().ingestEvent({
      conversationId: 'conversation',
      turnId: 'session',
      event: {
        type: 'session_configured',
        session_id: 'conversation',
        model: 'gpt-5-codex-latest',
        model_provider_id: 'openai',
        approval_policy: 'on-request',
        sandbox_policy: { type: 'danger-full-access' },
        cwd: '/tmp/workspace',
        reasoning_effort: 'medium',
        history_log_id: BigInt(0),
        history_entry_count: 0,
        rollout_path: '/tmp/session.jsonl',
        initial_messages: null,
      },
      timestamp: new Date().toISOString(),
    });
    store.getState().ingestEvent({
      conversationId: 'conversation',
      turnId: 'turn-1',
      event: { type: 'agent_reasoning_delta', delta: 'Outlining approach' },
      timestamp: new Date().toISOString(),
    });
    store.getState().ingestEvent({
      conversationId: 'conversation',
      turnId: 'turn-1',
      event: { type: 'agent_reasoning_delta', delta: ' and next steps' },
      timestamp: new Date().toISOString(),
    });
    store.getState().ingestEvent({
      conversationId: 'conversation',
      turnId: 'turn-1',
      event: { type: 'agent_reasoning', text: '' },
      timestamp: new Date().toISOString(),
    });

    const reasoningCell = store
      .getState()
      .conversation.transcript.cells.find(
        (cell) => cell.kind === 'agent-reasoning'
      );
    expect(reasoningCell).toBeDefined();
    expect(
      reasoningCell && 'text' in reasoningCell ? reasoningCell.text : ''
    ).toMatch(/Outlining approach and next steps/);
  });

  it('toggles reasoning visibility via summary preference updates', () => {
    const store = createConversationStore();
    store.getState().setReasoningSummaryPreference('auto');
    expect(
      store.getState().conversation.transcript.reasoningSummaryFormat
    ).toBe('experimental');

    store.getState().setReasoningSummaryPreference('none');
    expect(
      store.getState().conversation.transcript.reasoningSummaryFormat
    ).toBe('none');
  });

  it('adds reasoning cells from reasoning-cells fixture when summaries enabled', () => {
    const store = createConversationStore();
    store.getState().setReasoningSummaryPreference('auto');

    const events = loadFixtureEvents('reasoning-cells.jsonl');
    events.forEach((payload) => store.getState().ingestEvent(payload));

    const reasoningCells = store
      .getState()
      .conversation.transcript.cells.filter(
        (cell): cell is TranscriptAgentReasoningCell =>
          cell.kind === 'agent-reasoning'
      );
    expect(reasoningCells.length).toBeGreaterThan(0);
    expect(reasoningCells.some((cell) => cell.visible)).toBe(true);
    expect(reasoningCells.some((cell) => cell.text.length > 0)).toBe(true);
  });

  it('replays resumed conversations without overwriting earlier user messages', () => {
    const state = buildControllerFromFixture('resume.jsonl');
    const userMessages = state.conversation.transcript.cells.filter(
      (cell): cell is TranscriptUserMessageCell => cell.kind === 'user-message'
    );
    expect(userMessages.map((cell) => cell.message)).toEqual(['hello', 'test']);
    const agentMessages = state.conversation.transcript.cells.filter(
      (cell) => cell.kind === 'agent-message'
    );
    expect(agentMessages.map((cell) => cell.message)).toEqual([
      'Hi! How can I help you today?',
      'What would you like me to help you test?',
    ]);
  });
});
