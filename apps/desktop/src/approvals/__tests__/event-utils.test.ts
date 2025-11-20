import { describe, expect, it } from 'vitest';
import type { ConversationEventPayload } from '~/codex.gen/ConversationEventPayload';
import type { ParsedCommand } from '~/codex.gen/ParsedCommand';

import { mapConversationEventToApprovalRequest } from '../event-utils';

const basePayload = (
  event: ConversationEventPayload['event'],
  overrides?: Partial<ConversationEventPayload>
): ConversationEventPayload => ({
  conversationId: 'conversation',
  eventId: 'event-1',
  timestamp: new Date().toISOString(),
  ...overrides,
  event,
});

describe('mapConversationEventToApprovalRequest', () => {
  it('creates exec approval requests', () => {
    const payload = basePayload({
      type: 'exec_approval_request',
      call_id: 'call-1',
      command: ['bash', '-lc', 'ls'],
      cwd: '/tmp',
      reason: 'Need to inspect files',
      risk: null,
      parsed_cmd: [] satisfies ParsedCommand[],
      turn_id: 'turn-1',
    });

    expect(mapConversationEventToApprovalRequest(payload)).toEqual({
      kind: 'exec',
      eventId: 'event-1',
      conversationId: 'conversation',
      callId: 'call-1',
      command: ['bash', '-lc', 'ls'],
      cwd: '/tmp',
      reason: 'Need to inspect files',
    });
  });

  it('creates patch approval requests', () => {
    const payload = basePayload({
      type: 'apply_patch_approval_request',
      call_id: 'call-2',
      changes: {
        'file.ts': {
          type: 'update',
          unified_diff: '--- a\n+++ b',
          move_path: null,
        },
      },
      reason: null,
      grant_root: '/tmp',
    });

    expect(mapConversationEventToApprovalRequest(payload)).toEqual({
      kind: 'patch',
      eventId: 'event-1',
      conversationId: 'conversation',
      callId: 'call-2',
      fileChanges: {
        'file.ts': {
          type: 'update',
          unified_diff: '--- a\n+++ b',
          move_path: null,
        },
      },
      reason: null,
      grantRoot: '/tmp',
    });
  });

  it('ignores replayed events', () => {
    const payload = basePayload(
      {
        type: 'exec_approval_request',
        call_id: 'call-1',
        command: ['bash'],
        cwd: '.',
        reason: null,
        risk: null,
        parsed_cmd: [] satisfies ParsedCommand[],
        turn_id: 'turn-1',
      },
      { eventId: 'initial::0' }
    );

    expect(mapConversationEventToApprovalRequest(payload)).toBeNull();
  });

  it('returns null for non approval events', () => {
    const payload = basePayload({
      type: 'agent_message',
      message: 'done',
    });

    expect(mapConversationEventToApprovalRequest(payload)).toBeNull();
  });
});
