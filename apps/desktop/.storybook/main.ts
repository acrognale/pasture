import type { StorybookConfig } from '@storybook/react-vite';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import type { Alias } from 'vite';

const configDir = path.dirname(fileURLToPath(import.meta.url));
const config: StorybookConfig = {
  framework: {
    name: '@storybook/react-vite',
    options: {},
  },
  addons: [
    '@storybook/addon-docs',
    '@storybook/addon-a11y',
    '@storybook/addon-links',
  ],
  stories: ['../src/**/*.stories.tsx', '../src/**/*.stories.ts'],
  async viteFinal(config) {
    const existingAlias = config.resolve?.alias;
    const normalizedAlias: Alias[] = Array.isArray(existingAlias)
      ? existingAlias
      : existingAlias
        ? Object.entries(existingAlias).map(([find, replacement]) => ({
            find,
            replacement,
          }))
        : [];

    const projectAliases: Alias[] = [
      {
        find: /^~\/auth\/useAuthState$/,
        replacement: path.resolve(
          configDir,
          '../src/conversation/__stories__/mocks/hooks/useAuthState.ts'
        ),
      },
      {
        find: /^~\/composer\/hooks\/useComposerConfig$/,
        replacement: path.resolve(
          configDir,
          '../src/conversation/__stories__/mocks/hooks/useComposerConfig.ts'
        ),
      },
      {
        find: /^~\/composer\/hooks\/useSlashCommands$/,
        replacement: path.resolve(
          configDir,
          '../src/conversation/__stories__/mocks/hooks/useSlashCommands.ts'
        ),
      },
      {
        find: /^~\/conversation\/hooks\/useSendMessage$/,
        replacement: path.resolve(
          configDir,
          '../src/conversation/__stories__/mocks/hooks/useSendMessage.ts'
        ),
      },
      {
        find: /^~\/conversation\/hooks\/useInterruptConversation$/,
        replacement: path.resolve(
          configDir,
          '../src/conversation/__stories__/mocks/hooks/useInterruptConversation.ts'
        ),
      },
      {
        find: /^~\/conversation\/store\/hooks$/,
        replacement: path.resolve(
          configDir,
          '../src/conversation/__stories__/mocks/hooks/useConversationState.ts'
        ),
      },
      {
        find: /^~\/workspace$/,
        replacement: path.resolve(
          configDir,
          '../src/conversation/__stories__/mocks/workspace.tsx'
        ),
      },
      {
        find: /^~\/review\/TurnReviewContext$/,
        replacement: path.resolve(
          configDir,
          '../src/conversation/__stories__/mocks/review/TurnReviewContext.tsx'
        ),
      },
      {
        find: /^~\/review\/TurnReviewPane$/,
        replacement: path.resolve(
          configDir,
          '../src/conversation/__stories__/mocks/review/TurnReviewPane.tsx'
        ),
      },
      {
        find: '~',
        replacement: path.resolve(configDir, '../src'),
      },
    ];

    return {
      ...config,
      resolve: {
        ...config.resolve,
        alias: [...projectAliases, ...normalizedAlias],
      },
      define: {
        ...(config.define ?? {}),
        'process.env': {},
      },
    };
  },
};

export default config;
