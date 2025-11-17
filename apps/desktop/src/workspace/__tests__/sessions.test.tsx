import { act, fireEvent, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, test, vi } from 'vitest';
import type { ListConversationsParams } from '~/codex.gen/ListConversationsParams';
import { encodeWorkspaceId } from '~/lib/routing';
import { mockCodex, mockEvents } from '~/testing/codex';

import {
  getActiveConversationId,
  mockNavigate,
  resetActiveConversationId,
  setActiveConversationId,
} from './routerTestUtils';
import { WORKSPACE, renderSidebarPanel } from './setup';

vi.mock('@tanstack/react-router', async (importOriginal) => {
  const actual =
    await importOriginal<typeof import('@tanstack/react-router')>();
  return {
    ...actual,
    useRouter: () => ({ navigate: mockNavigate }),
    useRouterState: ({ select }: { select: (state: unknown) => unknown }) => {
      const state = {
        matches: [
          {
            routeId: '/workspaces/$workspaceId/conversations/$conversationId',
            params: { conversationId: getActiveConversationId() },
          },
        ],
      };
      return select(state as never);
    },
  };
});

beforeEach(() => {
  resetActiveConversationId();
  mockNavigate.mockReset();
  mockNavigate.mockImplementation(
    ({ params }: { params?: { conversationId?: string | null } }) => {
      if (params && typeof params.conversationId !== 'undefined') {
        setActiveConversationId(params.conversationId ?? null);
      }
      return Promise.resolve();
    }
  );
});

const ACTIVE_SESSION_ID = 'session-active';
const NEW_SESSION_ID = 'session-new';

describe('SidebarPanel sessions', () => {
  test('activates a newly created session immediately', async () => {
    const now = new Date().toISOString();

    mockCodex.stub.listConversations.mockResolvedValue({
      items: [
        {
          conversationId: ACTIVE_SESSION_ID,
          path: `${WORKSPACE}/sessions/${ACTIVE_SESSION_ID}.json`,
          cwd: WORKSPACE,
          preview: 'Existing session',
          timestamp: now,
        },
      ],
      nextCursor: null,
    });

    mockCodex.stub.newConversation.mockResolvedValue({
      conversationId: NEW_SESSION_ID,
      model: 'gpt-5-codex',
      reasoningEffort: 'medium',
      rolloutPath: `${WORKSPACE}/sessions/${NEW_SESSION_ID}.json`,
    });

    setActiveConversationId(ACTIVE_SESSION_ID);

    renderSidebarPanel();

    await screen.findByRole('button', { name: /Existing session/i });

    const createButton = screen.getByRole('button', { name: /^New$/i });
    fireEvent.click(createButton);

    const newSessionButton = await screen.findByRole('button', {
      name: /New session/i,
    });

    expect(newSessionButton).toBeInTheDocument();

    const expectedWorkspaceId = encodeWorkspaceId(WORKSPACE);

    await waitFor(() => {
      const [payload] = mockNavigate.mock.calls.at(-1) ?? [];
      expect(payload?.to).toBe(
        '/workspaces/$workspaceId/conversations/$conversationId'
      );
      expect(payload?.params).toMatchObject({
        workspaceId: expectedWorkspaceId,
        conversationId: NEW_SESSION_ID,
      });
    });
  });

  test('updates session preview after the first user message', async () => {
    const now = new Date().toISOString();

    mockCodex.stub.listConversations.mockResolvedValue({
      items: [
        {
          conversationId: ACTIVE_SESSION_ID,
          path: `${WORKSPACE}/sessions/${ACTIVE_SESSION_ID}.json`,
          cwd: WORKSPACE,
          preview: 'Existing session',
          timestamp: now,
        },
      ],
      nextCursor: null,
    });

    mockCodex.stub.newConversation.mockResolvedValue({
      conversationId: NEW_SESSION_ID,
      model: 'gpt-5-codex',
      reasoningEffort: 'medium',
      rolloutPath: `${WORKSPACE}/sessions/${NEW_SESSION_ID}.json`,
    });

    setActiveConversationId(ACTIVE_SESSION_ID);

    renderSidebarPanel();

    const createButton = screen.getByRole('button', { name: /^New$/i });
    fireEvent.click(createButton);

    const newSessionButton = await screen.findByRole('button', {
      name: /New session/i,
    });

    await waitFor(() => {
      expect(newSessionButton).toHaveAttribute('data-active', 'true');
    });

    act(() => {
      mockEvents.emitConversation(
        {
          type: 'user_message',
          message: 'Hello Codex',
          images: null,
        },
        { conversationId: NEW_SESSION_ID }
      );
    });

    const updatedButton = await screen.findByRole('button', {
      name: /Hello Codex/i,
    });

    expect(updatedButton).toHaveAttribute('data-active', 'true');
  });

  test('loads additional sessions when clicking Load more', async () => {
    const now = new Date().toISOString();

    const initialSessions = Array.from({ length: 25 }, (_, index) => {
      const conversationId =
        index === 0
          ? ACTIVE_SESSION_ID
          : `session-${index.toString().padStart(2, '0')}`;
      return {
        conversationId,
        path: `${WORKSPACE}/sessions/${conversationId}.json`,
        cwd: WORKSPACE,
        preview: `Session ${index}`,
        timestamp: now,
      };
    });

    const nextPage = Array.from({ length: 5 }, (_, index) => {
      const conversationId = `new-session-${index}`;
      return {
        conversationId,
        path: `${WORKSPACE}/sessions/${conversationId}.json`,
        cwd: WORKSPACE,
        preview: `Next ${index}`,
        timestamp: now,
      };
    });

    mockCodex.stub.listConversations.mockImplementation(
      (params: ListConversationsParams) => {
        if (!params.cursor) {
          return Promise.resolve({
            items: initialSessions,
            nextCursor: 'cursor-1',
          });
        }

        return Promise.resolve({ items: nextPage, nextCursor: null });
      }
    );

    setActiveConversationId(ACTIVE_SESSION_ID);

    renderSidebarPanel();

    await screen.findByRole('button', { name: /Session 0/i });

    const loadMoreButton = await screen.findByRole('button', {
      name: /Load more/i,
    });

    fireEvent.click(loadMoreButton);

    await waitFor(() => {
      nextPage.forEach((session) => {
        expect(
          screen.getByRole('button', { name: new RegExp(session.preview, 'i') })
        ).toBeInTheDocument();
      });
    });
  });
});
