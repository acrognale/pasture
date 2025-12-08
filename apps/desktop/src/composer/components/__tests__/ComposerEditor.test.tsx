import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState } from 'react';
import { describe, expect, test } from 'vitest';
import { mockCodex } from '~/testing/codex';
import { renderWithProviders } from '~/testing/harness';

import { ComposerEditor } from '../ComposerEditor';

describe('ComposerEditor', () => {
  test('renders slash command menu and completes the command text on selection', async () => {
    const user = userEvent.setup();

    const TestComposer = () => {
      const [draft, setDraft] = useState('');
      return (
        <ComposerEditor
          value={draft}
          onChange={setDraft}
          onSubmit={() => undefined}
          workspacePath="/tmp/workspace"
          conversationId="slash-conversation"
          isTurnActive={false}
        />
      );
    };

    renderWithProviders(<TestComposer />);

    const textbox = screen.getByRole('textbox');
    await user.click(textbox);
    await user.type(textbox, '/co');

    const option = await screen.findByRole('option', {
      name: /compact conversation/i,
    });
    await user.click(option);

    await waitFor(() => expect(textbox.textContent).toBe('/compact '));
  });

  test('inserts a file mention at the caret position for mid-sentence mentions', async () => {
    const user = userEvent.setup();

    mockCodex.stub.searchWorkspaceFiles.mockResolvedValue([
      { path: 'src/main.ts', score: 1 },
    ]);

    const TestComposer = () => {
      const [draft, setDraft] = useState('');
      return (
        <ComposerEditor
          value={draft}
          onChange={setDraft}
          onSubmit={() => undefined}
          workspacePath="/tmp/workspace"
          conversationId="file-mention-conversation"
          isTurnActive={false}
        />
      );
    };

    renderWithProviders(<TestComposer />);

    const textbox = screen.getByRole('textbox');
    await user.click(textbox);
    await user.type(textbox, '@ma');

    const option = await screen.findByRole('option', {
      name: /src\/main\.ts/i,
    });
    await user.click(option);

    await waitFor(() => {
      const content = textbox.textContent ?? '';
      expect(content).toContain('@main.ts');
      expect(content.replace(/\s+/g, ' ').trim()).toBe('@main.ts');
    });
  });
});
