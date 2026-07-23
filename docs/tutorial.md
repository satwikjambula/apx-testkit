# Tutorial: apx-testkit component by component

A complete walkthrough of every `@apx/testkit` component, the page
patterns they're built for, authorization, and what isn't covered yet.
Every code example below is either copied verbatim from the real source or
was run fresh from a clean clone while writing this doc — if something
doesn't match what you see, that's a real bug, please file an issue.

Not sure this tool is for you yet? Read docs/support-matrix.md and
docs/limitations.md first — this is pre-alpha, verified against a small
number of real apps, and honest about what doesn't work yet.

## Contents

1. [Getting started](#1-getting-started)
2. [Components](#2-components)
   - [2.1 Items (forms, data entry)](#21-items-forms-data-entry)
   - [2.2 Buttons](#22-buttons)
   - [2.3 Regions (generic)](#23-regions-generic)
   - [2.4 Cards](#24-cards)
   - [2.5 Faceted Search](#25-faceted-search)
   - [2.6 Interactive Report](#26-interactive-report)
   - [2.7 Navigation & console](#27-navigation--console)
   - [2.8 Lifecycle waits](#28-lifecycle-waits)
   - [2.9 Coverage mapping](#29-coverage-mapping)
   - [2.10 Regression detection](#210-regression-detection)
   - [2.11 Interactive Grid](#211-interactive-grid)
   - [2.12 Dynamic Actions (metadata only)](#212-dynamic-actions-metadata-only)
3. [Page types & patterns](#3-page-types--patterns)
   - [3.1 Forms / data entry](#31-forms--data-entry)
   - [3.2 Reports](#32-reports)
   - [3.3 Cards & faceted search pages](#33-cards--faceted-search-pages)
   - [3.4 Master-detail](#34-master-detail)
   - [3.5 Dashboards](#35-dashboards)
   - [3.6 Drawer / modal pages](#36-drawer--modal-pages)
4. [Authorization](#4-authorization)
5. [What's not covered yet](#5-whats-not-covered-yet)

---

## 1. Getting started

### Prerequisites

- Node 22
- An APEXlang export of an Oracle APEX 26.1+ app (a folder containing
  `application.apx` and a `pages/` subdirectory — that's what "Export to
  APEXlang" from App Builder or VS Code produces). Don't have one yet? The
  examples below use the project's own committed fixture, so you can follow
  along without one.

### Clone and build

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

### Generate your first page object + spec

```bash
node packages/generator/dist/cli.js packages/generator/test/fixtures/reference-fixtures --out /tmp/my-first-tests
```

```
Generated 1 page object(s) + spec(s) (0 marked skip: auth required) into /tmp/my-first-tests
```

Two files appeared: `p00003-employee.page.ts` (a typed page object) and
`p00003-employee.spec.ts` (a smoke spec exercising it). Section 2 below
covers every primitive these two files — and any spec you write by hand —
are built from.

### Wire it into a runnable Playwright project

The generated files import `@apx/testkit` and expect an `APP_BASE` export
from a sibling `../playwright.config.ts` — that's the one convention every
generated file assumes.

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

```bash
npm install
npx playwright install chromium   # once, if you haven't already
npx playwright test
```

### Auto-regenerate while you work

```bash
node packages/generator/dist/cli.js /path/to/your/export --out tests-generated --watch
```

Regenerates on every `.apx` change (debounced 250ms so a multi-file export
burst triggers one regeneration, not several). Ctrl+C to stop.

---

## 2. Components

Every component lives in `packages/testkit/src/`, is exported from
`@apx/testkit`'s top level, and follows the same rule: **no raw CSS
selectors, ever.** Everything goes through documented `apex.*` JavaScript
APIs (`apex.item()`, `apex.region()`) or Playwright's accessibility-tree
locators. When APEX's DOM changes across a release, the fix happens once
here — not in every spec that uses it.

Each section below states plainly what's **VERIFIED** (confirmed live,
trust it), **PARTIAL** (works but with a known gap), or **UNVERIFIED**
(implemented, not yet confirmed against a real app in every respect).

### 2.1 Items (forms, data entry)

**Status: VERIFIED.** The only component with a fully confirmed DOM
contract: a `.apx` pageItem identifier maps to its DOM node id VERBATIM,
for every item type tested (textField, textarea, numberField, selectList,
datePicker, hidden), and `apex.item(id)` setValue/getValue round-trips
through it.

```ts
import { ApexItem, expectItemsPresent, itemRoundTrip } from '@apx/testkit';

// Ergonomic class, for hand-written specs:
const name = new ApexItem(page, 'P410_NAME');
await name.setValue('Ada Lovelace');
console.log(await name.getValue());     // 'Ada Lovelace'
console.log(await name.exists());       // true

// Plain functions, what generated code uses:
await expectItemsPresent(page, ['P410_NAME', 'P410_EMAIL', 'P410_ID']); // throws listing any missing
const roundTripped = await itemRoundTrip(page, 'P410_NAME', 'apx-testgen');
```

This is the component to reach for on any data-entry form — it's the one
piece of the toolkit you can build assertions on with full confidence.

### 2.2 Buttons

**Status: PARTIAL.** There is no verified button-id-to-DOM convention yet
(the "BUTTON DISCOVERY" report is still open — see
docs/grammar-assumptions.md). Rather than guess a selector, buttons are
located by accessible role + name — the `.apx` `label` field, via
Playwright's accessibility tree:

```ts
import { buttonByLabel, clickButton } from '@apx/testkit';

await expect(buttonByLabel(page, 'Save')).toBeVisible();
await clickButton(page, 'Save'); // same as buttonByLabel(page, 'Save').click()
```

This works for ordinary labeled buttons. It is NOT verified for icon-only
buttons, or buttons whose accessible name diverges from their visible
label (heavily template-customized ones).

### 2.3 Regions (generic)

**Status: VERIFIED, generic surface only.** Region *identifiers* (mapping
a `.apx` region's static id to a DOM/region id) are still an open ledger
item — do not assume they're the same string. But once you have a
region's runtime id (read it off the live DOM, or from a discovery pass —
see `probeRegions` below), `ApexRegion`'s methods are confirmed live on two
independently-typed regions (an Interactive Report and a Cards region):

```ts
import { ApexRegion, probeRegions, refreshRegion } from '@apx/testkit';

// Diagnostics: does apex.region() recognize this id? (non-widget regions
// like staticContent/form are expected to report false -- not a failure)
const probes = await probeRegions(page, ['R14614638417487636']);

// Fire-and-forget refresh, or the class form for repeated calls:
await refreshRegion(page, 'R14614638417487636');

const region = new ApexRegion(page, 'R14614638417487636');
await region.refresh();
await region.getSessionState();
await region.getCurrentRecordId();
await region.setCurrentRecordId('42');
await region.getRecordValues();
await region.setRecordValues({ ENAME: 'ADAMS' });
await region.getSelectedValues();
await region.setSelectedValues(['1', '2']);
await region.focus();
await region.getViewName(); // confirmed on Interactive Report only -- throws on Cards
```

Calling a method the region's widget type doesn't implement throws a clear
error (`"...is not a function on this widget type"`) instead of silently
returning `undefined` — that's deliberate, not a bug to work around.

`apex.region(id).call(action)` — the generic action-dispatch API some APEX
widgets support — was tested against Interactive Report with a dozen
plausible action names and rejected every one with `"Call not
supported."`. Don't reach for `.call()`; use the direct methods above.

### 2.4 Cards

**Status: VERIFIED, with one known-broken method pair.** Extends
`ApexRegion` with pagination and selection:

```ts
import { ApexCardsRegion } from '@apx/testkit';

const cards = new ApexCardsRegion(page, 'R14614559648487636');
const info = await cards.getPageInfo();
// { rowHeight, recordsPerRow, firstOffset, lastOffset, pageSize, pageOffset, scrollOffset, viewOffset }

await cards.firstPage();
await cards.lastPage();
await cards.nextPage();
await cards.previousPage();
await cards.gotoPage(3);
await cards.loadMore();

await cards.getSelectedRecords();
await cards.setSelectedRecords(['1', '2']);
await cards.selectAll();
```

**`getRecords()` and `getModel()` are confirmed BROKEN** — they exist on
the widget's method list but throw a genuine runtime error (`Cannot read
properties of undefined (reading 'each')`) from inside APEX's own client
code, both immediately after navigation and after an awaited `refresh()`.
They're left in the typed API so the failure stays visible rather than
silently missing, but treat them as needing their own investigation, not a
working contract.

### 2.5 Faceted Search

**Status: VERIFIED**, including one real lifecycle bug found and fixed:

```ts
import { ApexFacetsRegion } from '@apx/testkit';

const facets = new ApexFacetsRegion(page, 'R14614638417487636');

// IMPORTANT: use fetchCountsAndWait(), not fetchCounts() + immediate read --
// a single fetchCounts()-then-read was confirmed unreliable (returned null)
// even in a genuinely fresh browser context. fetchCountsAndWait() waits for
// the real apexafterrefresh event instead.
await facets.fetchCountsAndWait();
const total = await facets.getTotalResourceCount(); // a real number, e.g. 24

await facets.clear();
await facets.clearFacets();
await facets.apply();
await facets.enable();
await facets.disable();

// Per-facet methods: parameter shape (facetId: string) is INFERRED by
// naming convention, not directly exercised live -- verify against your
// own app before trusting these:
await facets.getFacetCount('some-facet-id');
await facets.getFacetValueCounts('some-facet-id');
await facets.showFacet('some-facet-id');
await facets.hideFacet('some-facet-id');
```

### 2.6 Interactive Report

**Status: generic `ApexRegion` only — no dedicated component.** This is a
real finding, not an oversight: Interactive Report's search/sort/pagination
internals are implemented as `_`-prefixed methods on the underlying widget
instance (`_search`, `_paginate`, `_reset`, `_download`, ...) — private by
jQuery-UI-widget-factory convention. The only PUBLIC instance methods
beyond the generic region API are `refresh`, `openDialogChat`,
`openInlineChat`, `closeChat` (APEX 26.1 ships an AI chat integration on
IR). There is no safe, documented way to drive IR search/sort/pagination
via a JS method call — use the generic `ApexRegion` for what it does
support, and drive search/pagination through the actual UI (fill the
search field, click pagination links) for anything else:

```ts
import { ApexRegion } from '@apx/testkit';

const report = new ApexRegion(page, 'R11643575732369775');
await report.refresh();
await report.getViewName();      // 'REPORT', 'CHART', etc.
await report.getSessionState();
```

### 2.7 Navigation & console

**Status: VERIFIED.** The entry point every spec — generated or
hand-written — should use to load a page:

```ts
import { apexPageUrl, armConsoleGuard, gotoApexPage, normalizeTitle } from '@apx/testkit';

const url = apexPageUrl(APP_BASE, 'employee'); // lowercases the alias, joins cleanly
const errors = await gotoApexPage(page, url);  // arms console guard BEFORE navigating,
                                                // waits for apex.item to exist as a boot signal
// ... later ...
expect(errors).toEqual([]);

// Never compare titles with raw equality -- runtime titles differ from
// .apx source by invisible dash/space characters:
expect(normalizeTitle(await page.title())).toBe(normalizeTitle('Employee'));

// Lower-level, if you need to arm the guard without navigating yet:
const rawErrors = armConsoleGuard(page);
```

### 2.8 Lifecycle waits

**Status: VERIFIED**, general-purpose. Waits for a real APEX client event
(`apexbeforerefresh`/`apexafterrefresh`, confirmed live) instead of polling
or a fixed timeout:

```ts
import { callRegionMethodAndWaitForEvent, waitForRegionEvent } from '@apx/testkit';

// Call a region method AND wait for the resulting event before resolving:
await callRegionMethodAndWaitForEvent(page, 'R14614638417487636', 'fetchCounts', {
  eventName: 'apexafterrefresh', // the default
  timeoutMs: 10_000,             // the default
});

// Or: something ELSE triggers the refresh (e.g. a button click), and you
// just need to wait for it -- call this BEFORE the triggering action:
const wait = waitForRegionEvent(page, 'R14614638417487636', 'apexafterrefresh');
await someButtonThatTriggersARefresh.click();
await wait;
```

These are jQuery custom events, not native DOM `CustomEvent`s — confirmed
live that `element.addEventListener('apexafterrefresh', ...)` never fires;
only `apex.jQuery`'s own event system sees them, which is what these
functions use internally. This pattern answers "did operation X finish" —
it is NOT a general replacement for every wait in the toolkit (see the
caveat in section 3.6).

### 2.9 Coverage mapping

**Status: VERIFIED**, opt-in, zero overhead unless enabled. Every
item/region/button primitive above already records what it touches — you
just need to turn recording on and read the report:

```bash
APX_COVERAGE_LOG=./coverage.jsonl npx playwright test
node /path/to/apx-testkit/packages/generator/dist/coverage-cli.js /path/to/your/export ./coverage.jsonl
```

```
page 410: Data Entry – Simple Form (data-entry-simple-form)
  items:   6/9 (67%) -- untouched: P410_FIELD_HELP, P410_INLINE_HELP, P410_START_DATE
  regions: 0/5 (0%) -- untouched: basic-fields-container, buttons-container_1, ...
  buttons: 1/1 (100%)
```

Buttons are matched by LABEL (there's no verified button-id convention —
see 2.2), everything else by `.apx` identifier. This is "which declared
components did my suite touch," not code-line coverage.

**Untrackable region types are reported separately, not counted as
"untouched."** A region whose type has no `@apx/testkit` component at all
(`interactiveGrid`, `tree`, `calendar`, `chart`, `map` — matching the
region-shaped `UnsupportedComponentError` stubs in
`packages/testkit/src/components/unsupported.ts`; see
docs/ecosystem-roadmap.md Tier 2/3) can never show a real touch, no matter
how thoroughly it's tested by hand through some other means. Counting it
alongside a genuinely-untested trackable region would conflate "nobody
wrote a test for this" with "this can't be tracked yet." Those regions are
excluded from the touched/total percentage and listed in their own line
instead:

```
page 10: Mixed (MIXED)
  items:   1/1 (100%)
  regions: 1/1 (100%)
  untrackable (no @apx/testkit component for this type): emp-grid (interactiveGrid)
  buttons: 0/0 (n/a)
```

### 2.10 Regression detection

**Status: VERIFIED**, and unlike everything else in this list, needs no
live app at all -- it's pure AST-to-AST comparison between two exports:

```bash
node /path/to/apx-testkit/packages/generator/dist/diff-cli.js <old-export-dir> <new-export-dir>
```

```
~ page 3: Employee (EMPLOYEE)
    title: "Employee" -> "Employee Record"
  + item P3_EMAIL
  ~ item P3_ENAME
      label: "Name" -> "Full Name"
  - item P3_JOB
  ~ button save
      label: "Save" -> "Save Changes"
    affected: p00003-employee.page.ts, p00003-employee.spec.ts

- page 5: Legacy Page (LEGACY)
    no longer generated: p00005-legacy.page.ts, p00005-legacy.spec.ts

+ page 7: Reports (REPORTS)
    generated: p00007-reports.page.ts, p00007-reports.spec.ts

Summary: 1 added, 1 removed, 1 changed, 0 unchanged
```

Field-by-field diffs (with old->new values) are shown for everything the
AST actually types: page alias/name/title/`authentication`, item type/
label/required/sourceColumn, region type/name/source, button label/action,
and dynamic action trigger/condition/nested-actions (2.12). For anything
NOT typed yet (LOVs, server-side validations, processes — see the
parser-coverage correction in docs/ecosystem-roadmap.md), every component
also gets an order-independent comparison of its full `raw` bag; if that
differs, you'll see `other metadata changed (raw properties differ --
...)` without a claim about *what* changed. That's the honest signal for
untyped constructs: "go look
here," not a specific claim this project can't back up.

Every added/removed/changed page also lists the generated `.page.ts`/
`.spec.ts` filenames a regeneration touches — computed from the exact same
naming helpers `apx-testgen` itself uses (`pageObjectFileName()`/
`specFileName()` in `page-object.ts`), so this can never drift from what
the generator actually names things.

Use this in CI to catch exactly the case the whole project cares about:
an AI agent (or a colleague) edits a page, and you want to know precisely
what changed — and which generated test files to review — before
regenerating tests. `--json <path>` gives the same report as structured
data for scripting.

---

### 2.11 Interactive Grid

**Status: PARTIALLY VERIFIED, hand-wired only.** Real, live-verified
methods against a real Interactive Grid region -- Oracle's own "Sample
Interactive Grids" gallery app -- but the generator cannot construct this
component automatically. Read the caveat below before using it.

```ts
import { ApexInteractiveGridRegion } from '@apx/testkit';

// You must supply the REAL runtime static id -- do not assume it matches
// the .apx export's region identifier (see the caveat below).
const ig = new ApexInteractiveGridRegion(page, 'emp');

const actions = await ig.getActions();       // apex.actions instance: add/remove/invoke/toggle/list/...
const views = await ig.getViews();           // e.g. { grid, chart }
const currentViewId = await ig.getCurrentViewId(); // e.g. 'grid'
const currentView = await ig.getCurrentView();     // the active view's controller object
const selected = await ig.getSelectedRecords();    // currently selected rows

// Inherited from the generic ApexRegion (region.ts):
await ig.refresh();
```

**Critical caveat: the region's runtime static id can differ from its
`.apx` export identifier.** Confirmed live: a region declared as `region
basic-editing (type: interactiveGrid ...)` in the export resolved at
runtime to static id `emp` (DOM widget container `#emp_ig`) --
`apex.region('basic-editing')` returned `null`; `apex.region('emp')`
worked. This is why `@apx/testgen` cannot auto-wire this component up from
metadata alone, unlike Interactive Report/Cards/Faceted Search (where the
export identifier has matched the runtime id in every app checked). To
find the real static id, inspect the live DOM for a widget container whose
id follows `<static id>_ig`.

**Confirmed working** (via `apex.region(id).widget().interactiveGrid(method)`,
the jQuery UI widget-factory pattern): `getActions`, `getViews`,
`getCurrentView`, `getCurrentViewId`, `getSelectedRecords`. **Confirmed
REJECTED** with a clear "no such method" error (not a silent failure):
`model`, `view`, `getRegion`.

**Navigation note:** the app used to verify this enables
`pageAccessProtection: argumentsMustHaveChecksum`, which blocks
`gotoApexPage()`'s bare-`page.goto()` navigation strategy -- even
immediately after a successful login, even to the exact page just landed
on. Reach protected pages via real UI link clicks instead:

```ts
await page.getByRole('link', { name: /^Editing/ }).click();
await page.waitForLoadState('domcontentloaded');
await page.getByRole('link', { name: /^Basic Editing/ }).click();
await page.waitForLoadState('domcontentloaded');
```

See `spike/tests/interactive-grid-demo.spec.ts` for the full working
example, and docs/quirks/26.1.json for both findings with complete
evidence.

---

### 2.12 Dynamic Actions (metadata only)

**Status: TYPED, parser-only — no runtime component.** `@apx/parser`
projects `dynamicAction` blocks into `ApexPage.dynamicActions`, evidenced
by Oracle's own "Sample Dynamic Actions" gallery app (329 real
`dynamicAction`s parsed across every real export this project has, zero
warnings):

```ts
import { parseApp } from '@apx/parser';

const result = parseApp(loadExport('/path/to/export'));
const page = result.ast.pages.find((p) => p.alias === 'EDIT');
for (const da of page.dynamicActions) {
  console.log(da.identifier, da.when, da.clientSideCondition);
  for (const action of da.actions) {
    console.log('  ', action.action, action.fireWhenEventResultIs);
  }
}
```

`da.when` is the trigger (`selectionType`, `items`/`button`/`region`,
`event` — `null` event means APEX's implicit default for that selector
type, not "no event"). `da.clientSideCondition` is `null` for
unconditional DAs (confirmed common, not a gap). `da.actions` is the
ordered list of nested steps, each with `fireWhenEventResultIs` marking
true- vs. false-action lists.

`apx-diff` (2.10) already diffs this field-by-field, including a nested
diff of the actions list — see that section for what a changed DA looks
like in a real diff report.

**What this does NOT give you**: a way to *trigger* a named Dynamic
Action from a live browser. That's a completely separate, still-unsolved
problem — no known generic, documented JS API exists to fire a DA by name
(see docs/ecosystem-roadmap.md "Dynamic Action triggering"). Typed
metadata makes DAs diffable and inspectable, not controllable.

**Scoping note**: the component name `action` is overloaded in the
grammar. A `dynamicAction`'s nested `action` children (what `da.actions`
projects) are a different construct from a stand-alone, page-level
`action` nested directly inside a `region` (a row-level action alongside
`column` nodes — seen in `apextogo`). Only the former is typed; the
latter still falls into `unmodeled`.

---

## 3. Page types & patterns

Everything below is built from the section 2 primitives — there's no
separate "forms API" or "reports API" beyond what's already listed. This
section is about which primitives fit which page shape, and what's
genuinely different about each.

### 3.1 Forms / data entry

The bread-and-butter case, and the most-verified one. Items (2.1) for
every field, `buttonByLabel` (2.2) for Save/Cancel/etc. Generated specs
already do exactly this — see the example in section 1.

### 3.2 Reports

Interactive Report pages: use the generic `ApexRegion` (2.3/2.6) for
refresh and view-name checks. There is currently no generated assertion
for report content (row counts, search results) — that's an open item
(see docs/ecosystem-roadmap.md); write it by hand with `ApexRegion` plus
whatever `apex.item()`-backed search field the report exposes.

### 3.3 Cards & faceted search pages

Use `ApexCardsRegion` (2.4) for the cards region and `ApexFacetsRegion`
(2.5) together — they're typically the same page (see the real example in
`spike/tests/faceted-search-cards-demo.spec.ts`):

```ts
const facets = new ApexFacetsRegion(page, facetsRegionId);
await facets.fetchCountsAndWait();
expect(await facets.getTotalResourceCount()).toBeGreaterThan(0);

const cards = new ApexCardsRegion(page, cardsRegionId);
const info = await cards.getPageInfo();
expect(info.pageSize).toBeGreaterThan(0);
```

### 3.4 Master-detail

No dedicated component — a master-detail page is just two regions (each
with its own items/buttons) composed on one page. Use `ApexItem`/
`ApexRegion`/`buttonByLabel` against each region's own identifiers/items,
the same as any other page. If the detail region is Cards or Faceted
Search, use those components for it (3.3); if it's a plain form region,
plain items (3.1).

### 3.5 Dashboards

**Not yet supported — real ground truth exists, no component built.**
Dashboards commonly include Oracle JET charts (confirmed present, SVG-
rendered) — but their container DOM ids are JET-generated hashes
(`chart1000639411058$cp5`), NOT the `.apx` static id, unlike every other
component in this toolkit. A chart component would need its own short
discovery pass into what `apex.region(id).widget()` actually exposes
before it could ship with the same confidence as the rest of this list.
See docs/ecosystem-roadmap.md Tier 2.

### 3.6 Drawer / modal pages

**Known broken, not yet root-caused.** Pages with `pageMode: modalDialog`
don't load via a plain friendly-URL GET — confirmed live (a real page
returns 400 on direct navigation). These need a parent-page/dialog context
that neither the generator nor `gotoApexPage` constructs today. If you hit
this, it's the known gap, not a regression in your setup.

---

## 4. Authorization

Every ground-truth page used to build most of this toolkit is
`authentication: public`. Pages requiring login still get real generated
tests, not a permanent skip: each non-public page's spec logs in via
`login()` in a `test.beforeEach`, gated at runtime on
`APX_LOGIN_TEST_USERNAME`/`APX_LOGIN_TEST_PASSWORD` — set both to actually
run the suite against a real account; leave either unset and the tests
skip cleanly instead of failing. This assumes the app's DEFAULT APEX
authentication scheme with a standard `P101_USERNAME`/`P101_PASSWORD`
login page at `<app-base>/login`; an app using a CUSTOM authentication
scheme (no `P101` login page in its export at all) will fail loudly and
specifically from inside `login()` itself (e.g. "P101_USERNAME not
found") rather than hang — that's the correct, intended outcome for those
apps, not something the generator special-cases around.

For login-protected pages in hand-written specs, use the `login()` fixture
directly:

```ts
import { login } from '@apx/testkit';

await page.goto(`${APP_BASE}/login`);
await login(page, {
  username: process.env.APEX_USER!,
  password: process.env.APEX_PASSWORD!,
  // optional overrides, defaults shown:
  usernameItemId: 'P101_USERNAME',
  passwordItemId: 'P101_PASSWORD',
  submitButtonName: /sign.?in|log.?in/i,
  timeoutMs: 15_000,
});
```

**Status: partially verified.** Field ids (`P101_USERNAME`/
`P101_PASSWORD`) are confirmed live against a real second APEX app with a
genuine login page — no changes needed there. `login()` also had one real
race-condition bug found and fixed (it now waits for an actual URL change
via `page.waitForURL` instead of a single point-in-time check) — see
docs/grammar-assumptions.md for the full story of how that was found. The
fix itself hasn't been independently re-verified yet.

**Never hardcode credentials in a committed spec** — read them from
environment variables, the way `spike/tests/auth-login-verify.spec.ts`
does (`APX_LOGIN_TEST_USERNAME`/`APX_LOGIN_TEST_PASSWORD`, both required,
neither hardcoded, test skips cleanly if either is unset).

To avoid logging in once per test, save the session and reuse it:

```ts
import { loginAndSaveState } from '@apx/testkit';

await loginAndSaveState(browser, `${APP_BASE}/login`, credentials, './auth.json');
// then, in playwright.config.ts:
// use: { storageState: './auth.json' }
```

---

## 5. What's not covered yet

Full list in docs/limitations.md and docs/ecosystem-roadmap.md; the
headline gaps:

- **Interactive Grid generator support** — `ApexInteractiveGridRegion` (2.11)
  is real and live-verified, but the generator cannot auto-construct it:
  the region's runtime static id can differ from its `.apx` identifier
  (confirmed live). Construct it by hand with the real static id.
- **Trees as a content/data-display pattern** — the only Tree widget seen
  is the universal left-nav, reused for one app's login picker; not a
  distinct page-content region.
- **Charts** — no dedicated component, but the generic `ApexRegion` (2.3)
  works today: `new ApexRegion(page, '<real static id>').refresh()` is
  confirmed live. Two caveats confirmed live: `apex.region(id).widget()`
  returns `null` for charts (unlike Interactive Grid/Cards/IR), and the
  runtime static id can differ from the `.apx` export identifier — same
  pattern as 2.11. See docs/quirks/26.1.json for the full investigation
  (what `ojChart`'s widget-factory methods do and don't do).
- **Region *assertions*** (as opposed to the `ApexRegion` API, which
  exists) — the region-identifier-to-DOM convention is still open, so the
  generator doesn't emit region-presence checks yet.
- **`required` item behavior** — no required item exists in any
  ground-truth app used so far, so "required items reject empty submit"
  isn't asserted anywhere yet.
- **Snapshot testing** — needs a masking-policy design first (live-data
  pages will be flaky as naive snapshots) before any code.
- **Data-dependent assertions** — permanent, by design; the generator has
  no way to know what data your instance holds.

If you hit one of these, it's a known gap, not a bug — but file an issue
anyway if the workaround isn't obvious; that's exactly the signal this
project needs right now.
