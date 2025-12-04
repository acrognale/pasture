import { reactApp } from '@pasture/configs';

export default reactApp({
  tsconfigRootDir: import.meta.dirname,
  storybook: true,
  rules: {
    '@typescript-eslint/no-unnecessary-type-assertion': 'off',
  },
  ignores: [
    'dist/**',
    'src/components/ui/**',
    'src/routeTree.gen.ts',
    'src/codex.gen/**',
    'src-tauri/**',
    '.storybook/**',
    '../codex/**',
  ],
});
