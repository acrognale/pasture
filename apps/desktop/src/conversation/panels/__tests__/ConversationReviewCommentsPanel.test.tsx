import { act, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { useEffect } from 'react';

import type { ComposerBarControls } from '~/composer/components/ComposerBar';
import { ConversationPanelServicesProvider, useConversationPanelServices } from '~/conversation/panels/ConversationPanelServices';
import { PanelManagerProvider } from '~/panels/PanelManagerProvider';
import { PanelRuntimeProvider } from '~/panels/PanelRuntimeContext';
import { reviewCommentStore } from '~/review/commentsStore';
import { makeTurnReviewKey } from '~/review/reviewKeys';
import { renderWithProviders } from '~/testing/harness';

import { ConversationReviewCommentsPanel } from '../ConversationReviewCommentsPanel';

const WORKSPACE_PATH = '/tmp/workspace';

function RegisterComposerControls({ controls }: { controls: ComposerBarControls }) {
  const services = useConversationPanelServices();
  useEffect(() => {
    services.registerComposerControls(controls);
    return () => services.registerComposerControls(null);
  }, [controls, services]);
  return null;
}

describe('ConversationReviewCommentsPanel', () => {
  it('inserts consolidated feedback and clears comments on submit', async () => {
    const setDraft = vi.fn();
    const focus = vi.fn();
    let draft = '';
    const controls: ComposerBarControls = {
      focus,
      setDraft: (value) => {
        draft = value;
        setDraft(value);
      },
      appendDraft: vi.fn(),
      getDraft: () => draft,
      appendAttachments: vi.fn(),
    };

    reviewCommentStore.getState().actions.reset();

    const reviewKey = makeTurnReviewKey({
      conversationId: 'conversation-1',
      baseEventId: null,
      targetEventId: 'turn-1',
    });

    act(() => {
      reviewCommentStore.getState().actions.addComment({
        reviewKey,
        filePath: 'app/main.ts',
        side: 'modified',
        lineNumber: 2,
        text: 'Please update this line',
        navigation: {
          mode: 'turn',
          workspacePath: WORKSPACE_PATH,
          conversationId: 'conversation-1',
          reviewKey,
          baseEventId: null,
          targetEventId: 'turn-1',
          filePath: 'app/main.ts',
          oldPath: null,
          newPath: null,
          commentableLines: [2],
        },
      });
    });

    renderWithProviders(
      <PanelManagerProvider>
        <ConversationPanelServicesProvider>
          <RegisterComposerControls controls={controls} />
          <PanelRuntimeProvider
            value={{
              hostId: 'host-1',
              dockId: 'utility',
              instanceId: 'instance-1',
              params: {
                mode: 'turn',
                workspacePath: WORKSPACE_PATH,
                conversationId: 'conversation-1',
                reviewKey,
              },
              state: null,
              setState: vi.fn(),
              reveal: null,
              consumeReveal: vi.fn(),
              close: vi.fn(),
            }}
          >
            <ConversationReviewCommentsPanel />
          </PanelRuntimeProvider>
        </ConversationPanelServicesProvider>
      </PanelManagerProvider>
    );

    await screen.findByText('1 comment');
    const submitButton = screen.getByRole('button', { name: /submit/i });
    expect(submitButton).toBeEnabled();

    await userEvent.click(submitButton);

    expect(setDraft).toHaveBeenCalledTimes(1);
    expect(setDraft.mock.calls[0]?.[0]).toMatch(/Here is my consolidated review of this diff/i);
    expect(setDraft.mock.calls[0]?.[0]).toMatch(/app\/main\.ts/);
    expect(setDraft.mock.calls[0]?.[0]).toMatch(/line 2/);
    expect(setDraft.mock.calls[0]?.[0]).toMatch(/Please update this line/);
    expect(focus).toHaveBeenCalled();

    expect(
      reviewCommentStore.getState().commentsByReviewKey[reviewKey]
    ).toBeUndefined();
  });
});
