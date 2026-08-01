// @ts-check
import tseslint from 'typescript-eslint';

export default tseslint.config(
  {
    ignores: [
      '**/dist/**',
      '**/node_modules/**',
      'examples/**',
      'spike/tests-generated/**',
      'coverage/**',
    ],
  },
  ...tseslint.configs.recommended,
  {
    rules: {
      // Unused vars are a real, common source of dead code in this repo's
      // history (stale imports left behind after a refactor) -- keep this
      // an error, not a warning, so CI actually catches it.
      '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_' }],
      // `raw`/`unmodeled` bags (ADR-001) are intentionally untyped `any` in
      // several places -- don't fight the architecture, just don't let it
      // spread carelessly into new, typed code.
      '@typescript-eslint/no-explicit-any': 'off',
    },
  },
);
