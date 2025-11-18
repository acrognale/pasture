import { act, waitFor } from '@testing-library/react';
import { useEffect } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { ApprovalsStore } from '~/approvals/store';
import type { CodexEvent } from '~/codex.gen/CodexEvent';
import type { EventMsg } from '~/codex.gen/EventMsg';
import { useWorkspaceApprovalsStore } from '~/workspace';
import { WorkspaceProvider } from '~/workspace/WorkspaceProvider';

import { renderWithProviders } from '../../../testing/harness';
import { ConversationProvider } from '../ConversationProvider';

const listeners = new Set<(event: CodexEvent) => void>();

vi.mock('~/codex/events', () => {
  const derivePreviewFromEvent = (event: EventMsg): string | null => {
    switch (event.type) {
      case 'user_message':
        return event.message;
      case 'agent_message':
        return event.message;
      case 'agent_reasoning':
        return event.text;
      case 'task_started':
        return 'Task started';
      case 'task_complete':
        return event.last_agent_message ?? 'Task complete';
      default:
        return null;
    }
  };

  return {
    isTauriEnvironment: () => true,
    ensureTauriEnvironment: () => undefined,
    createOptimisticUserEvent: (conversationId: string, text: string) => ({
      conversationId,
      eventId: `optimistic-${Date.now()}`,
      event: { type: 'user_message', message: text, images: null } as EventMsg,
      timestamp: new Date().toISOString(),
    }),
    derivePreviewFromEvent,
    isConversationEvent: (
      event: CodexEvent
    ): event is CodexEvent & { kind: 'conversation-event' } =>
      event.kind === 'conversation-event',
    isAuthUpdatedEvent: (
      event: CodexEvent
    ): event is CodexEvent & { kind: 'auth-updated' } =>
      event.kind === 'auth-updated',
    getAuthUpdatedPayload: (event: CodexEvent & { kind: 'auth-updated' }) =>
      event.payload,
    getConversationEventPayload: (
      event: CodexEvent & { kind: 'conversation-event' }
    ) => event.payload,
    subscribeToCodexEvents: (listener: (event: CodexEvent) => void) => {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
  };
});

const emitCodexEvent = (event: CodexEvent) => {
  listeners.forEach((listener) => listener(event));
};

const ApprovalsProbe = () => {
  const approvalsStore = useWorkspaceApprovalsStore();
  useEffect(() => {
    approvalsProbe.store = approvalsStore;
  }, [approvalsStore]);
  return null;
};

const approvalsProbe: {
  store: ApprovalsStore | null;
} = {
  store: null,
};

const renderProvider = () =>
  renderWithProviders(
    <WorkspaceProvider workspacePath="/tmp/workspace">
      <ConversationProvider workspacePath="/tmp/workspace">
        <ApprovalsProbe />
      </ConversationProvider>
    </WorkspaceProvider>
  );

describe('ConversationProvider approvals', () => {
  beforeEach(() => {
    approvalsProbe.store = null;
    listeners.clear();
  });

  it('enqueues exec approval requests from live events', async () => {
    renderProvider();
    await waitFor(() => expect(approvalsProbe.store).not.toBeNull());
    const event: CodexEvent = {
      kind: 'conversation-event',
      payload: {
        conversationId: 'conversation',
        eventId: 'evt-1',
        event: {
          type: 'exec_approval_request',
          call_id: 'call-1',
          command: ['bash', '-lc', 'ls'],
          cwd: '/tmp',
          reason: 'Need to inspect files',
          risk: null,
          parsed_cmd: [],
        },
        timestamp: new Date().toISOString(),
      },
    };

    act(() => {
      emitCodexEvent(event);
    });

    const approvals = approvalsProbe.store?.getState();
    expect(approvals?.activeRequest).toMatchObject({
      kind: 'exec',
      eventId: 'evt-1',
      conversationId: 'conversation',
      callId: 'call-1',
      command: ['bash', '-lc', 'ls'],
    });
    expect(approvals?.queue).toHaveLength(0);
  });

  it('queues patch approvals after exec approvals', async () => {
    renderProvider();
    await waitFor(() => expect(approvalsProbe.store).not.toBeNull());

    act(() => {
      emitCodexEvent({
        kind: 'conversation-event',
        payload: {
          conversationId: 'conversation',
          eventId: 'evt-1',
          event: {
            type: 'exec_approval_request',
            call_id: 'call-1',
            command: ['bash'],
            cwd: '/tmp',
            reason: null,
            risk: null,
            parsed_cmd: [],
          },
          timestamp: new Date().toISOString(),
        },
      });
      emitCodexEvent({
        kind: 'conversation-event',
        payload: {
          conversationId: 'conversation',
          eventId: 'evt-2',
          event: {
            type: 'apply_patch_approval_request',
            call_id: 'call-2',
            changes: {
              'file.ts': {
                update: { unified_diff: '--- a\n+++ b', move_path: null },
              },
            },
            reason: null,
            grant_root: null,
          },
          timestamp: new Date().toISOString(),
        },
      });
    });

    const approvals = approvalsProbe.store?.getState();
    expect(approvals?.activeRequest?.kind).toBe('exec');
    expect(approvals?.queue).toHaveLength(1);
    expect(approvals?.queue[0]).toMatchObject({
      kind: 'patch',
      eventId: 'evt-2',
      callId: 'call-2',
    });
  });
});
