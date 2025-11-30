import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState } from 'react';
import { describe, expect, test } from 'vitest';
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
});
