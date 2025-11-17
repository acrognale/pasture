import type { Preview } from '@storybook/react';

import { StorybookProviders } from '../src/conversation/__stories__/mocks/StorybookProviders';
import '../src/index.css';

const preview: Preview = {
  tags: ['autodocs'],
  parameters: {
    // automatically create action args for all props that start with "on"
    actions: { argTypesRegex: '^on.*' },
    controls: {
      matchers: {
        color: /(background|color)$/i,
        date: /Date$/,
      },
    },
    docs: {
      codePanel: true,
    },
    backgrounds: {
      default: 'dark',
      values: [
        { name: 'dark', value: 'hsl(var(--background))' },
        { name: 'light', value: 'hsl(var(--card))' },
      ],
    },
    viewport: {
      defaultViewport: 'desktop',
      viewports: {
        desktop: {
          name: 'Desktop (1280x900)',
          styles: { width: '1280px', height: '900px' },
          type: 'desktop',
        },
      },
    },
    layout: 'padded',
  },
  loaders: [
    async () => {
      const { mockCodexControls } = await import(
        '../src/conversation/__stories__/mocks/state'
      );
      mockCodexControls.reset();
      return {};
    },
  ],
  decorators: [
    (Story, context) => {
      const workspacePath =
        (context?.args?.workspacePath as string | undefined) ??
        (context?.parameters?.workspacePath as string | undefined) ??
        '/tmp/storybook-workspace';
      return (
        <StorybookProviders workspacePath={workspacePath}>
          <Story />
        </StorybookProviders>
      );
    },
  ],
};

export default preview;
