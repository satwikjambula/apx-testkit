# Tutorial: your first generated test suite

A step-by-step walkthrough: clone the repo, generate a page object + smoke
spec from a real `.apx` page, wire it into your own Playwright project, and
go a bit further (auto-regeneration, hand-written specs, coverage). Every
command below was run fresh from a clean clone while writing this doc —
if something doesn't match what you see, that's a real bug, please file an
issue.

Not sure this tool is for you yet? Read docs/support-matrix.md and
docs/limitations.md first — this is pre-alpha, verified against a small
number of real apps, and honest about what doesn't work yet.

## 0. Prerequisites

- Node 22
- An APEXlang export of an Oracle APEX 26.1+ app (a folder containing
  `application.apx` and a `pages/` subdirectory — that's what "Export to
  APEXlang" from App Builder or VS Code produces). Don't have one yet? This
  tutorial's first few steps use the project's own committed example
  fixture, so you can follow along without one.

## 1. Clone and build

```bash
git clone https://github.com/satwikjambula/apx-testkit.git
cd apx-testkit
npm install
(cd packages/parser && npx tsc -p tsconfig.json)
(cd packages/testkit && npx tsc -p tsconfig.json)
(cd packages/generator && npx tsc -p tsconfig.json)
```

`npm install` at the repo root is required even if you only ever use the
CLI from here — `@apx/testkit` is a real runtime dependency of every
generated file, and it needs to be built once (`dist/` doesn't ship
pre-built).

## 2. Generate your first page object + spec

```bash
node packages/generator/dist/cli.js packages/generator/test/fixtures/mini-export --out /tmp/my-first-tests
```

You should see:

```
Generated 1 page object(s) + spec(s) (0 marked skip: auth required) into /tmp/my-first-tests
```

Two files appeared: `p00003-employee.page.ts` and
`p00003-employee.spec.ts`. Open them — this is the whole product in
miniature. The page object is a typed accessor built entirely on
`@apx/testkit` primitives, no raw selectors:

```ts
export class EmployeePage {
  static readonly alias = 'employee';
  constructor(private readonly page: Page) {}
  url(): string { return apexPageUrl(APP_BASE, EmployeePage.alias); }
  async goto(): Promise<string[]> { return gotoApexPage(this.page, this.url()); }
  get empno(): ApexItem { return new ApexItem(this.page, 'P3_EMPNO'); }
  get ename(): ApexItem { return new ApexItem(this.page, 'P3_ENAME'); }
  async clickSave(): Promise<void> { await buttonByLabel(this.page, 'Save').click(); }
}
```

And the spec exercises it, never talking to `@apx/testkit` directly for
navigation or items:

```ts
test('apex.item round-trip on P3_ENAME', async ({ page }) => {
  const po = new EmployeePage(page);
  await po.goto();
  await po.ename.setValue('apx-testgen');
  expect(await po.ename.getValue()).toBe('apx-testgen');
});
```

Same input always produces byte-identical output — run the command again
into a different `--out` directory and `diff -r` the two; nothing will
differ.

## 3. Point it at your own export

```bash
node packages/generator/dist/cli.js /path/to/your/export --out tests-generated
```

The CLI checks that `/path/to/your/export` exists and contains a `pages/`
subdirectory, and tells you plainly if either is missing rather than
failing with a raw stack trace. Warnings from the parser (unrecognized
`.apx` constructs) print to stderr but don't stop generation — everything
unrecognized lands in `raw` bags rather than being silently dropped; see
`docs/grammar-assumptions.md` if you want to know exactly what's typed vs.
raw today.

## 4. Wire it into a runnable Playwright project

The generated files import `@apx/testkit` and expect an `APP_BASE` export
from a sibling `../playwright.config.ts` — that's the one convention every
generated file assumes. A minimal project looks like this:

**`package.json`**
```json
{
  "name": "my-apex-tests",
  "private": true,
  "type": "module",
  "dependencies": {
    "@apx/testkit": "file:/absolute/path/to/apx-testkit/packages/testkit"
  },
  "devDependencies": {
    "@playwright/test": "^1.48.0",
    "@types/node": "^22.0.0",
    "typescript": "^5.5.0"
  }
}
```

(`@apx/testkit` isn't published to npm yet — link it by path to your local
clone. `@types/node` is easy to forget and you'll get a confusing
`TS2688` without it.)

**`playwright.config.ts`**
```ts
import { defineConfig } from '@playwright/test';

export const APP_BASE =
  process.env.APEX_BASE_URL ?? 'https://your-instance.example.com/ords/r/your-workspace/your-app';

export default defineConfig({
  testDir: '.',
  testMatch: ['tests-generated/**/*.spec.ts'],
  use: { baseURL: APP_BASE },
});
```

Then:
```bash
npm install
npx playwright install chromium   # once, if you haven't already
npx playwright test
```

## 5. Auto-regenerate while you work

Add `--watch` and leave it running in a terminal or VS Code task while you
edit pages in App Builder / VS Code's APEXlang support and re-export:

```bash
node packages/generator/dist/cli.js /path/to/your/export --out tests-generated --watch
```

It regenerates on every `.apx` change (debounced 250ms, so a multi-file
export burst triggers one regeneration, not several). Ctrl+C to stop.

## 6. Going further: a hand-written spec

Generated specs cover the runtime-verified floor (page loads, console is
clean, items exist, one round-trips). For anything else, write your own
spec against the same primitives — never a raw selector:

```ts
import { apexPageUrl, ApexItem, buttonByLabel, expect, gotoApexPage, test } from '@apx/testkit';
import { APP_BASE } from '../playwright.config.js';

test('employee page loads and the name field round-trips', async ({ page }) => {
  await gotoApexPage(page, apexPageUrl(APP_BASE, 'employee'));
  const name = new ApexItem(page, 'P3_ENAME');
  await name.setValue('Ada Lovelace');
  expect(await name.getValue()).toBe('Ada Lovelace');
  await expect(buttonByLabel(page, 'Save')).toBeVisible();
});
```

If your page has an Interactive Report, Cards, or Faceted Search region,
`@apx/testkit` has typed wrappers for those too (`ApexRegion`,
`ApexCardsRegion`, `ApexFacetsRegion`) — see the module comments in
`packages/testkit/src/components/` for exactly what's verified vs. still
open on each.

## 7. Coverage mapping (optional)

See which declared items/regions/buttons your suite actually touches:

```bash
APX_COVERAGE_LOG=./coverage.jsonl npx playwright test
node /path/to/apx-testkit/packages/generator/dist/coverage-cli.js /path/to/your/export ./coverage.jsonl
```

Recording only happens when `APX_COVERAGE_LOG` is set — zero overhead
otherwise. The report shows touched-vs-declared per page, not code-line
coverage.

## 8. Login-protected pages (optional)

Pages without `authentication: public` are generated as
`test.describe.skip()` — the generator doesn't know your credentials.
`@apx/testkit` has a `login()` fixture for hand-written specs:

```ts
import { login } from '@apx/testkit';

await page.goto(`${APP_BASE}/login`);
await login(page, { username: process.env.APEX_USER!, password: process.env.APEX_PASSWORD! });
```

Never hardcode credentials in a committed spec — read them from
environment variables, and check `docs/limitations.md` for the current
state of `auth.ts` verification before relying on it in CI.

## What's next

- `docs/limitations.md` — the honest gap list (what doesn't work yet).
- `docs/support-matrix.md` — exactly which claims are verified, against
  which apps.
- `docs/ecosystem-roadmap.md` — where this is headed.
- `examples/employee-page/` — the exact output from step 2, committed, so
  you can read it without running anything.
