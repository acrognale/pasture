import eslint from '@eslint/js';

// Generated protocol types live in src/; skip linting to avoid noisy warnings.
export default [
  {
    ignores: ['src/**/*', 'dist/**/*', 'node_modules/**/*'],
  },
  {
    files: ['**/*.js'],
    rules: eslint.configs.recommended.rules,
  },
];
