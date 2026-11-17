import js from '@eslint/js';
import tseslint from 'typescript-eslint';
import reactHooks from 'eslint-plugin-react-hooks';
import globals from 'globals';

export default tseslint.config(
  {
    ignores: [
      '**/dist/**',
      '**/.wrangler/**',
      '**/coverage/**',
      '**/worker-configuration.d.ts',
      // The site has its own Vue toolchain.
      'site/**',
      // Agent worktrees are full copies of the repo.
      '.claude/**',
    ],
  },
  js.configs.recommended,
  ...tseslint.configs.strict,
  {
    files: ['apps/client/**/*.{ts,tsx}'],
    languageOptions: { globals: globals.browser },
    plugins: { 'react-hooks': reactHooks },
    rules: reactHooks.configs.recommended.rules,
  },
  {
    files: ['scripts/**/*.mjs'],
    languageOptions: { globals: globals.node },
  },
  {
    // Playwright repro scripts run in Node and pass callbacks into the page.
    files: ['docs/alpha-review/repro/**/*.mjs'],
    languageOptions: { globals: { ...globals.node, ...globals.browser } },
  },
  {
    files: ['**/*.{ts,tsx}'],
    rules: {
      '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_' }],
      '@typescript-eslint/consistent-type-imports': 'error',
    },
  },
);
