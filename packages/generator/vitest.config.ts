import { defineConfig } from 'vitest/config';

/**
 * Vitest's default file discovery picks up any `*.spec.ts`/`*.test.ts`
 * anywhere under this package -- which includes the GENERATED `.spec.ts`
 * fixtures committed under `test/golden/expected/` (golden fixtures for
 * P0 item 5, runtime-review). Those are data, not test suites -- exclude
 * them explicitly so vitest doesn't try to load and execute them as if
 * they were real Playwright specs (they import from `../playwright.config.js`,
 * a path that only makes sense in a real generated-tests output
 * directory, and use Playwright's `test`/`expect`, not vitest's).
 */
export default defineConfig({
  test: {
    exclude: ['**/node_modules/**', '**/dist/**', 'test/golden/expected/**', 'test/golden/fixtures/**'],
  },
});
