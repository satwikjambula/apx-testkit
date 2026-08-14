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
   - [2.13 Chart](#213-chart)
   - [2.14 Report columns](#214-report-columns)
   - [2.15 Region actions (Cards/List row-level)](#215-region-actions-cardslist-row-level)
   - [2.16 Documentation generation](#216-documentation-generation)
   - [2.17 Flow Map (navigation graph)](#217-flow-map-navigation-graph)
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

### Why this exists (short version — the fuller version is in the README)

You have an Oracle APEX app, and someone — you, a teammate, a QA person —
is about to start testing it. This tool turns your app's APEXlang export
into a real, runnable Playwright suite: one typed page object plus one
smoke spec per page, generated deterministically from your app's own
metadata, never guessed from the DOM. See the README's
["Why it exists"](../README.md#why-it-exists) section for the fuller
why/what/trust framing. Everything below is the concrete "what do I
actually type" walkthrough.

### Prerequisites

- **Node 22.**
- An **APEXlang export** of an Oracle APEX 26.1+ app: a folder containing
  `application.apx` and a `pages/` subdirectory of `.apx` text files. This
  is a text-based snapshot of your app's pages that *Oracle itself*
  generates — apx-testkit only ever reads it, never writes it (there is
  deliberately no `.apx` writer — see the README's "Scope commitments").
  Oracle's own App Builder User's Guide documents the format under
  "Reading APEXlang Syntax," and both App Builder and VS Code's Oracle SQL
  Developer extension expose an "Export to APEXlang" action for an
  existing app.

  **Honesty note, per this project's own verification discipline
  (ADR-004):** this project has no live App Builder or workspace access
  (see `.ai/knowledge/verification.md`), so the exact current menu wording
  and click-path for "Export to APEXlang" have **not** been re-verified
  live by this project — the paragraph above is sourced from Oracle's own
  documentation and this project's prior notes, not first-hand
  observation. If what you see in your own App Builder differs, trust
  your own screen and Oracle's official docs over this paragraph, and
  please file an issue so this gets corrected with real evidence.

  **Don't have an export yet, or just want to see the tool work first?**
  "Onboard your app in about 10 minutes" below uses this project's own
  committed fixture, so you can follow along with zero APEX access at all,
  and swap in your own export directory the moment you have one.

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

### Onboard your app in about 10 minutes

This is the literal answer to "I have an APEX app, a user is about to test
it, what do I actually do." It uses the project's own committed fixture as
the running example — source at
`packages/generator/test/fixtures/reference-fixtures`, generated output
already committed at `examples/employee-page/` so you can read the
destination before running anything — and every command below was re-run
fresh from a clean clone while writing this doc. The moment you have your
own export, only step (b)'s first argument changes; everything else is
identical.

**(a) Get an APEXlang export of the app you want to test.** From your own
app: use App Builder's or VS Code's "Export to APEXlang" action (see the
honesty note above — verify the exact menu wording against your own App
Builder version, not this doc). You'll end up with a folder shaped like
this:
```
my-app-export/
├── application.apx
└── pages/
    ├── p00001-home.apx
    ├── p00003-employee.apx
    └── ...
```
For this walkthrough, skip straight to (b) — the committed fixture at
`packages/generator/test/fixtures/reference-fixtures` is already a real
(minimal, one-page) export in exactly this shape.

**(b) Run the generator against it.**
```bash
node packages/generator/dist/cli.js packages/generator/test/fixtures/reference-fixtures --out /tmp/my-first-tests
```
```
Generated 1 page object(s) + spec(s) (0 marked skip: auth required) into /tmp/my-first-tests
```
Two files appeared: `p00003-employee.page.ts` (a typed page object) and
`p00003-employee.spec.ts` (a smoke spec exercising it). Against your own
export, swap the first argument for your export directory and `--out` for
wherever you want the tests to land — the rest of the command is
unchanged. Section 2 below covers every primitive these two files — and
any spec you write by hand — are built from.

**(c) What you now have, and why it matters.** Open
`examples/employee-page/` in this repo — it's the exact, byte-identical
output of the command above. In plain terms, for the one page
(`Employee`) in this fixture, you now have a test that:

- **loads the page and checks the browser console stayed clean** — catches
  a page that throws a JavaScript error the moment it loads;
- **checks the page title matches what the export declares** — catches a
  page that silently redirected or failed to render;
- **checks every form field (`pageItem`) the export declares is actually
  present on the page** — catches a field a later change accidentally
  removed or renamed;
- **types into the Name field and reads it back** — catches a field that
  looks present but is actually broken (disabled, wrong id, breaks on
  input);
- **checks every labeled button the export declares is actually present**
  — catches a Save/Cancel/etc. button that disappeared.

None of these know or care what your data means — they check that the
*page itself* still renders and behaves the way its own metadata says it
should. That's a floor, not a strategy (see "Why not just hand-write
Playwright tests?" in the README): it doesn't replace testing your
business logic, it replaces re-deriving "does this page still
render/validate" by hand, per page, forever.

**(d) Handing this to someone else to actually run.** What you hand them
depends on what they need:
- **Just the generated tests, to run against a real app** — give them the
  generated `.page.ts`/`.spec.ts` files (or the export directory plus this
  same one-line generator command, if they should regenerate it
  themselves), the `package.json`/`playwright.config.ts` from "Wire it
  into a runnable Playwright project" below, and the real base URL of the
  running APEX app the export came from.
- **The ability to regenerate as the app changes** — give them the export
  directory and this repo (or `@apx/testkit`/`@apx/mcp`, once published)
  — see "Auto-regenerate while you work" below.

Either way, what they actually run is:
```bash
npm install --install-links   # see the note below "Wire it into a runnable
                               # Playwright project" for why --install-links,
                               # not plain npm install, matters here
npx playwright install chromium   # once, if not already installed
APEX_BASE_URL=https://their-real-instance.example.com/ords/r/workspace/app npx playwright test
```
and what they see is a pass/fail per check, per page — e.g. `5 passed` if
every check in (c) holds against their real, running app.

**Run the exact command above against this walkthrough's synthetic
fixture, with no `APEX_BASE_URL` set, and all 5 tests correctly FAIL**
with a DNS/connection error (`net::ERR_NAME_NOT_RESOLVED`) — confirmed by
running it this way while writing this doc. That's expected, not a bug:
this fixture doesn't correspond to any real running server anywhere. The
tests only pass against the real app the export came from — see "Wire it
into a runnable Playwright project" immediately below for the exact
`package.json`/`playwright.config.ts` that points at your own app.

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
`TS2688` without it. Publishing readiness — correct `package.json`
metadata and a tag-triggered `.github/workflows/publish.yml` — is prepared
as of 2026-08-02, but no version has actually been published; once it is,
replace the `file:` line above with `"@apx/testkit": "^0.1.0"` and drop
`--install-links` below in favor of a plain `npm install`. See
docs/ecosystem-roadmap.md "Tenth round" for the readiness decision.)

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
npm install --install-links
npx playwright install chromium   # once, if you haven't already
npx playwright test
```

**Use `npm install --install-links`, not plain `npm install`, here** —
confirmed while writing this doc: a plain `npm install` with a `file:`
dependency leaves `node_modules/@apx/testkit` as a *symlink* into your
apx-testkit clone, and Node then resolves `@playwright/test` against
*that clone's own* `node_modules` instead of your project's, which throws
`Error: Requiring @playwright/test second time` the moment Playwright
loads your config. `--install-links` (npm 7+) copies the package instead
of symlinking it, which avoids this entirely. This is a real, reproducible
gotcha in linking any unpublished workspace package this way, not specific
to apx-testkit — worth knowing regardless of which local package you're
linking.

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
import { buttonByLabel, clickButton, expectButtonsPresent } from '@apx/testkit';

await expect(buttonByLabel(page, 'Save')).toBeVisible();
await clickButton(page, 'Save'); // same as buttonByLabel(page, 'Save').click()

// Non-mutating presence check -- confirmed live against 9 real buttons
// (Sample Charts, Area page). Auto-generated for every labeled button on
// every page -- see 2.9.
await expectButtonsPresent(page, ['Save', 'Cancel']);
```

This works for ordinary labeled buttons. It is NOT verified for icon-only
buttons, or buttons whose accessible name diverges from their visible
label (heavily template-customized ones). `expectButtonsPresent` is
logically weaker than `clickButton` (existence vs. clickability), so it
adds a live-verified signal specifically for pages whose buttons are
declared but never exercised by a click assertion.

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

**Region id resolution (ADR-003)**: a region's runtime id is NOT always
its `.apx` export identifier. Check `ApexRegion.htmlDomId` from the
parsed AST first — when set, it IS the runtime id, verbatim (confirmed
live on Chart, Interactive Grid, AND Interactive Report; this was
originally believed narrower and corrected in place — see
`docs/quirks/26.1.json` `region-id-not-static-id`). When `htmlDomId` is
null, the export identifier is usually the runtime id (~93% of the
Interactive Report/Cards/Faceted Search regions in this project's local
corpus), but treat that as a fallback, not a guarantee:

```ts
import { expectRegionsResolve } from '@apx/testkit';

// Resolve per ADR-003 before calling -- the generator does this
// automatically for interactiveReport/cards/facetedSearch regions.
const runtimeId = region.htmlDomId ?? region.identifier;
await expectRegionsResolve(page, [runtimeId]);
```

`expectRegionsResolve` is a safe pass/fail assertion specifically for
`interactiveReport`/`cards`/`facetedSearch` region types — confirmed live
that all three resolve as real `apex.region()` widget regions. Do NOT
call it against `form`/`staticContent` regions; those are confirmed NOT
to resolve as widget regions at all, by design. `@apx/testgen` auto-emits
this check per page for every region of a resolvable type, with an
explicit comment listing which other region types on that page were
skipped and why — never a silent omission.

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

**Status: generic `ApexRegion` for the JS API; VERIFIED UI-locator-driven
search/sort via `interactive-report.ts`.** This is a real finding, not an
oversight: Interactive Report's search/sort/pagination internals ARE
implemented as `_`-prefixed methods on the underlying widget instance
(`_search`, `_paginate`, `_reset`, `_download`, ...) — private by
jQuery-UI-widget-factory convention, confirmed still true, not
re-litigated. The only PUBLIC instance methods beyond the generic region
API are `refresh`, `openDialogChat`, `openInlineChat`, `closeChat` (APEX
26.1 ships an AI chat integration on IR). There is no safe, documented way
to drive IR search/sort/pagination via a JS method call — use the generic
`ApexRegion` for what it does support:

```ts
import { ApexRegion } from '@apx/testkit';

const report = new ApexRegion(page, 'R11643575732369775');
await report.refresh();
await report.getViewName();      // 'REPORT', 'CHART', etc.
await report.getSessionState();
```

**Search and sort ARE covered, through a genuinely different path** —
driving the actual visible UI via Playwright accessible-role locators
(`interactive-report.ts`), confirmed live against the same app/page
(Eighth round, 2026-08-01):

```ts
import { getColumnSortState, searchInteractiveReport, sortReportColumn } from '@apx/testkit';

const regionId = 'R11643575732369775'; // real runtime static id, see 2.3's caveat

// Unquoted multi-word terms match ANY word (OR) -- confirmed live,
// "Item 2" unquoted matched every row because "Item" alone is common to
// all of them. Quote for exact-phrase matching:
await searchInteractiveReport(page, regionId, '"Item 2"');

await sortReportColumn(page, regionId, 'Priority', 'ascending');
await getColumnSortState(page, 'Priority'); // 'ascending' | 'descending' | null, reads aria-sort
```

`sortReportColumn()` ALWAYS force-clicks the column header's sort-trigger
link — confirmed live and reproducible on 3 independent columns: APEX's
own `stickyTableHeader` widget renders an always-present visual clone of
the header row, exactly overlapping the real one from the moment the page
loads (no scroll needed), which fails Playwright's default actionability
check but correctly forwards clicks to the same handler when forced.
Pagination is NOT covered — a real accessible `Pagination` region exists,
but no live multi-page dataset was available to verify next/prev click
behavior; see docs/quirks/26.1.json
`interactive-report-accessible-locator-search-sort` for full evidence, and
2.14 for column header locators specifically.

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

**Visual view (`--html`).** The terminal report above is text-only and easy
to skim for one page, but tedious to scan across a large app. Add
`--html <report.html>` (alongside, not instead of, the default text
report) to get a self-contained HTML heatmap + checklist view of the
exact same `CoverageReport` data — no new analysis, just a different
rendering of what's already computed:

```bash
node /path/to/apx-testkit/packages/generator/dist/coverage-cli.js \
  /path/to/your/export ./coverage.jsonl --html ./coverage-report.html
```

The output is one file, no external CSS/JS, safe to open directly from
disk or attach as a CI artifact:

- **Summary cards** at the top for overall items/regions/buttons
  (touched/total + percentage), color-coded green (high coverage) through
  red (low/zero) — gray for `n/a` (nothing declared).
- **A per-page heatmap row** — one row per page, one colored cell per
  category (items/regions/buttons), same color scale as the summary
  cards, so you can spot which pages are weak at a glance without
  expanding anything.
- **A per-page checklist**, collapsed by default (click a page row to
  expand): a ✓/✗ list of every untouched identifier per category (touched
  identifiers are summarized as a single count — only untouched
  identifiers are tracked by name in `CoverageReport`, so that's the only
  granularity there is to show), plus untrackable regions listed
  separately in their own line, same distinction as the text report.

Same determinism guarantee as every other generated artifact in this
project: the same `CoverageReport` always renders byte-identical HTML —
safe to diff across runs. Both `renderCoverageHtml()` (a full standalone
document) and `renderCoverageHtmlFragment()` (just the report content,
for embedding into a host page's own DOM) are exported from
`@apx/testgen/coverage-html` for programmatic use — e.g. a future CI
dashboard that wants to embed this view directly instead of shelling out.

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
label/required/sourceColumn, region type/name/source/calendarSettings/
chartSettings, button label/action, and dynamic action trigger/condition/
nested-actions (2.12). For anything
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

**Human-readable mode**: `--format human` renders the same, already-computed
`DiffReport` as prose instead of the indented `+`/`-`/`~` tree above — one
sentence per added/removed/changed page, meant for a PR description or a
Slack message rather than a terminal. Nothing new is computed; this is a
templating layer over the exact same data the structured (default) output
uses, so it never drifts from it.

```bash
node /path/to/apx-testkit/packages/generator/dist/diff-cli.js <old-export-dir> <new-export-dir> --format human
```

```
Page 3: Employee (EMPLOYEE): Changed title: "Employee" -> "Employee Record", Added item P3_EMAIL, Changed item P3_ENAME (label: "Name" -> "Full Name"), Changed button save (label: "Save" -> "Save Changes"). Affects: p00003-employee.page.ts, p00003-employee.spec.ts.
Page 7: Reports (REPORTS) -- added. Will generate: p00007-reports.page.ts, p00007-reports.spec.ts.

Summary: 1 added, 0 removed, 0 changed, 0 unchanged
```

`--format structured` (the default, unchanged) and `--format human` are
both driven off the same `computeDiff()` result — `--json <path>` still
writes the full structured `DiffReport` regardless of which `--format` you
picked for the console output, so scripting and prose reading aren't
mutually exclusive. `formatDiffHuman()`/`formatPageHuman()` are also
exported from `@apx/testgen/diff` for anything that wants prose output
without shelling out to the CLI (e.g. a future CI comment bot).

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

**Auto-generated assertion**: `@apx/testgen` emits a test per page for
every Interactive Grid region whose `htmlDomId` is set (ADR-003 layer 1)
— `expect(typeof await ig.getCurrentViewId()).toBe('string')`, confirming
the region wired up correctly. Regions without `htmlDomId` are listed in
the generated file's header comment as explicitly skipped, not silently
omitted — their runtime id is genuinely unconstructible from static data.

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
type, not "no event"; `customEvent` is populated specifically when
`event === 'custom'`, e.g. `event: custom` / `customEvent:
apexendrecordedit`). `da.clientSideCondition` is `null` for unconditional
DAs (confirmed common, not a gap). `da.actions` is the ordered list of
nested steps, each with an optional `name` (distinct from the parent
DA's `name` — confirmed common, ~11% of real actions have one) and
`fireWhenEventResultIs` marking true- vs. false-action lists.

Every field here was cross-checked against Oracle's own published
APEXlang EBNF grammar (see CLAUDE.md) — `customEvent` and action-level
`name` were added specifically because that check surfaced them as real,
documented fields this project's own live-parsed data confirmed but
hadn't typed yet.

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

### 2.13 Chart

**Status: VERIFIED, graduated from a stub.** Real, live-verified methods
against real Chart regions — Oracle's own "Sample Charts" gallery app, on
three independent chart types (Area, Bar, Pie). This corrected an earlier
wrong finding (see the caveat below) — read it before assuming
`apex.region(id).widget()` doesn't work for charts.

```ts
import { ApexChartRegion } from '@apx/testkit';

// You must supply the REAL runtime static id -- see the caveat below.
// JET chart widgets initialize asynchronously; wait for the precondition
// first (see "Initialization race" below) before constructing this class.
const chart = new ApexChartRegion(page, 'pie1');

const type = await chart.getOption('type');        // e.g. 'pie'
const fullConfig = await chart.getOption();         // full config: type/series/groups/xAxis/legend/...
await chart.setOption('selectionMode', 'multiple'); // real setter, confirmed round-trip

// Inherited from the generic ApexRegion (region.ts):
await chart.refresh();
```

**Correction, for the record:** this project previously claimed
`apex.region(id).widget()` returns `null` for chart regions, based on a
single region tested once. Re-tested live and found FALSE — it returns a
real jQuery-wrapped element, confirmed independently on three chart types,
corroborated by the Sample Charts app's own exported JS code calling
`apex.region("stackCategoryChart").widget().ojChart(...)` directly. The
real jQuery UI widget-factory plugin, `ojChart`, IS reachable through
`widget().ojChart(method, ...args)` — not a dead end requiring a raw
jQuery selector. `getProperty`/`getOption` remain confirmed NOT valid
method names ("no such method" errors) — the real method is the standard
widget-factory `option`, used both as a getter and a confirmed-working
setter (round-trip verified: get → set → get reflects the new value
immediately).

**Critical caveat: the region's runtime static id can differ from its
`.apx` export identifier** — same pattern as Interactive Grid (2.11). This
now has a diagnosed root cause: `ApexRegion.htmlDomId`
(`advanced { htmlDomId: ... }` in the export), when set, deterministically
predicts the runtime id as `<htmlDomId>_jet`. Confirmed exactly on
`pie-chart` → `pie1`, `donut-chart-sorting` → `donut1`,
`bar-chart-stack-label-stack-category` → `stackCategoryChart`. When
`htmlDomId` is absent — confirmed on 66/97 real chart regions in Sample
Charts — the runtime id is an APEX-internal auto-generated numeric id with
no corresponding field anywhere in the static export at all; that case is
genuinely undiscoverable without live access, so `@apx/testgen` cannot
auto-wire every chart region up from metadata alone.

**Initialization race, confirmed live:** JET chart widgets attach
`ojChart` asynchronously, after `page.waitForLoadState('domcontentloaded')`
resolves. Calling `getOption()`/`setOption()` immediately after navigation
can race this. Wait for the actual precondition first:

```ts
await page.waitForFunction((id) => {
  const region = (window as any).apex?.region?.(id);
  return typeof region?.widget?.()?.ojChart === 'function';
}, 'pie1');
```

See `spike/tests/chart-demo.spec.ts` for the full working example, and
docs/quirks/26.1.json (`chart-region-widget-returns-null`,
`chart-widget-initialization-race`, `region-id-not-static-id`) for all
three findings with complete evidence.

**Auto-generated assertion**: `@apx/testgen` emits a test per page for
every Chart region whose `htmlDomId` is set, waiting for the
initialization-race precondition automatically and asserting the live
type resolves to a real, non-empty string. This is deliberately **not**
an exact-match assertion against the declared `chartSettings.type` —
confirmed live that APEX's declarative `donut` type reports as JET's
`pie` at runtime (JET has no separate donut widget type; APEX's donut is
`pie` + a nonzero `styleDefaults.pieInnerRadius`). Asserting equality
broadly across all 17 declared type values would have been an unverified
assumption, not a safe generalization — see docs/quirks/26.1.json
`chart-declared-type-not-runtime-type` for the full finding, including
which two values (`pie`, `area`) are confirmed to match their declared
type directly.

### 2.14 Report columns

**Status: VERIFIED, two genuinely different DOM-id contracts.**
`report-column.ts`, confirmed live against TWO independently typed report
region types on the same live app (UX Pattern Catalog) — `classicReport`
(`item-detail-full`) and `interactiveReport` (`browse-interactive-report`).

```ts
import { classicReportColumnById, expectReportColumnHeadersPresent, reportColumnHeader } from '@apx/testkit';

// Works identically on classicReport AND interactiveReport -- keyed by
// heading TEXT via the accessible `columnheader` role, no DOM id needed.
await expectReportColumnHeadersPresent(page, ['Name', 'Type', 'Owner']);
const header = reportColumnHeader(page, 'Name');
await header.getAttribute('aria-sort'); // interactiveReport only -- see 2.6

// classicReport ONLY -- the column's DOM id equals the .apx column's
// identifier VERBATIM, confirmed live on all 5 columns of a real region,
// cross-checked directly against the .apx export's own `column
// CHILD_RECORD_NAME ( ... )` declarations. Scoped internally around a
// confirmed sticky-header-widget duplicate-id issue -- do not build a
// plain `page.locator('#' + id)` yourself, use this function.
const cell = classicReportColumnById(page, 'CHILD_RECORD_NAME');
```

**Two different, non-interchangeable DOM-id contracts, confirmed live —
do not conflate them:**
- `classicReport`: the `<th>`'s own `id` IS the `.apx` column identifier,
  verbatim, always (confirmed: 5/5 real columns on `item-detail-full`
  matched exactly). No sort affordance exists on this region type (no
  wrapping `<a>`, no `aria-sort`) — a real, structural difference from
  Interactive Report, not a gap.
- `interactiveReport`: the `<th>`'s own `id` is an APEX-internal
  auto-generated numeric id (e.g. `C11643982695369779`) with **no**
  corresponding field anywhere in the static export — confirmed
  genuinely undiscoverable (export identifiers were `TITLE`/`CATEGORY`/
  etc., runtime ids were unrelated numeric strings). Use
  `reportColumnHeader()` (accessible role, no id needed) for this region
  type instead.

**A generator auto-assertion was attempted and reverted** — see
docs/quirks/26.1.json `interactive-report-column-heading-not-always-own-
header`: a real Interactive Report column (`DESCRIPTION`, a non-hidden,
`plainText`-typed column with a declared heading) has NO matching runtime
`columnheader` at all — its content is folded into the `Title` column's
own cell instead (a real IR "primary column group" rendering pattern).
Auto-deriving the full heading list from `.apx` metadata alone would have
shipped a smoke test guaranteed to fail on real data; this was caught
live before being committed. The functions above remain real and
verified for a caller who supplies a deliberately curated, live-confirmed
list of headings — see `spike/tests/report-column-demo.spec.ts`.

### 2.15 Region actions (Cards/List row-level)

**Status: VERIFIED for presence; click-through effects are a confirmed
dead end on the only live app available.** `region-action.ts`, confirmed
live against a Cards region (`faceted-search-cards`) and a List region
(`faceted-search-content-row`).

```ts
import { expectRegionActionPresent, regionActionCount, regionActionLocator } from '@apx/testkit';

// Cards' action-d shape only (see caveats below) -- an accessible link,
// name = the action's .apx label.
await expectRegionActionPresent(page, 'Edit', 1);
const count = await regionActionCount(page, 'Edit'); // > 1 is the expected common case
```

**Read before using:**
- The action's `label` is **NOT unique per region** — confirmed live, the
  same label repeats once per rendered record (24 `Edit` links on one
  Cards region, one per card), with no confirmed way to scope to a
  specific record from `.apx` metadata alone. `regionActionLocator()`
  returns all of them; callers needing a specific row must scope further
  themselves (`.nth(i)`, or an ancestor container holding identifying
  text).
- List/Content Row regions (`action-e`) render row actions COMPLETELY
  DIFFERENTLY — confirmed live, behind a single, also-non-unique "Row
  Actions" button per row that opens a menu whose `menuitem`-role entries
  carry the real labels. This two-step contract is deliberately **not**
  wrapped by `regionActionLocator()` — a genuinely different DOM shape,
  not a bug.
- **No click-through effect assertion is shipped.** Confirmed a dead end
  on this app: every action tested (Cards' `Edit` link, a Cards title
  link, List's `Row Action 1`/`2`/`3` menu items) has no real navigation
  target and produces zero observable effect on click — this reference
  app ships decorative, non-functional demo affordances for this
  component family. See docs/quirks/26.1.json
  `region-action-cards-not-unique-inert` for the full evidence, including
  a real counter-example on the SAME app (Interactive Report's `Primary
  Row Action` link DOES navigate) showing this isn't a universal
  limitation of the mechanism, just unverified for Cards/List
  specifically.

---

### 2.16 Documentation generation

**Status: VERIFIED**, and like regression detection (2.10), needs no live
app at all — it's a pure read of the already-typed AST into Markdown:

```bash
node /path/to/apx-testkit/packages/generator/dist/docs-cli.js <export-dir> --out <docs-dir>
```

```
Documented 1 page(s) into <docs-dir> (2 file(s) written, including index.md)
```

This writes one `<alias>.docs.md` per page plus a top-level `index.md`
summary linking to each. Every fact rendered comes directly off the typed
AST — items (type/label/required/source column/LOV), buttons (label/
action/static id), regions (type, source table or SQL, calendar settings,
chart settings, static-id override), region-nested columns and row-level
actions, dynamic actions (trigger/condition/nested true-false actions),
branches, validations, processes, and computations. Nothing here is new
analysis — it's the same "already-computed structure, turned into a
readable format" shape as `apx-diff` (2.10), not a fresh verification
pass, so there's no live-app risk to reason about.

The real, committed output for this tutorial's own `EMPLOYEE` page fixture
is in `examples/employee-page/p00003-employee.docs.md` (plus
`examples/employee-page/index.md`) — open it to see the exact current
shape without running anything.

**Region-owned items/buttons are documented once, under their region —
not duplicated at page level.** A page-level "Page-level items"/"Page-level
buttons" section lists only items/buttons NOT owned by any region (the
same `layout.region`-unowned case `ApexPage.items`/`buttons` also carry
alongside their owning region's own list — see `packages/parser/src/
parser.ts`).

**Explicitly out of scope** (see `docs/ecosystem-roadmap.md` "Ninth
round", item 4, and GitHub issue #4) — deliberately NOT attempted here,
not a gap to work around:
- Business-process docs and navigation maps — need a cross-reference graph
  this project doesn't have yet.
- ER diagrams — need database schema/foreign-key information a `.apx`
  export never carries at all; a genuinely different data source, not a
  missing feature.

---

### 2.17 Flow Map (navigation graph)

**Status: VERIFIED**, and like regression detection (2.10) and
documentation generation (2.16), needs no live app at all — it's a pure
read of the already-typed AST into a deterministic JSON graph. See
`docs/ecosystem-roadmap.md`'s Thirteenth round ("Flow Map: data model + CLI
now, UI deferred") for the full scoping decision this implements.

```bash
node /path/to/apx-testkit/packages/generator/dist/flow-cli.js <export-dir> --out flow-map.json
```

```
Flow Map
  nodes (pages): 18
  edges: 38
    button: 17
    regionAction: 20
    reportColumnLink: 1
  confidence:
    high: 38
  pages with no incoming edge from these 4 sources: 1, 2, 3, 100, ...
    (not a claim these pages are unreachable in the running app -- breadcrumbs, navigation lists,
     apex.navigation, and Dynamic Action redirects are all out of this pass's scope)

Flow Map written to flow-map.json
```

(Output above is real, from running `apx-flow` against this project's own
`ux-pattern-catalog` corpus copy — every navigation edge that app declares
happens to be an external-URL redirect, so every edge resolves to a `url`
target rather than a `page` target; this is a genuine property of that
specific app's data, not a limitation of the tool — see below.)

**Nodes** are one per real, generated page (`page:<pageId>`, same `id !==
0 && alias` filter `apx-docs`/`apx-coverage`/`apx-testgen` already apply,
for consistency). **Edges** come from exactly four typed navigation
sources, Phase 1a's deliberately drawn boundary:

1. `ApexPage.branches` — page-processing redirects.
2. `ApexRegion.actions` — Cards/List row-level actions (`type: fullCard`
   included).
3. `ApexRegion.columns[].linkTarget` — report/Interactive Report/
   Interactive Grid column links, both the in-app page-redirect and
   external-URL-redirect variants.
4. `ApexButton.target`/`.url` — button page/app redirects and external-URL
   redirects.

**Condition preservation — never flattened.** A page with multiple
branches (or region actions, or column links) targeting the same or
different destinations under different conditions produces one edge PER
source construct, always — never merged into a single unconditional edge.
Each edge's own `condition` field (branches only — the other three sources
have no typed condition field on the AST at all) carries its originating
branch's condition verbatim.

**Confidence is real and source-and-variant-specific, not a blanket
"high."** Every edge carries a `mechanism` (one of eight fine-grained
values — each of the four sources split into its page-target vs.
URL-redirect variant) plus a `confidence` and literal `evidence` citation.
All eight are `'high'` — live-witnessed against real exports (see
`packages/generator/src/flow.ts`'s `FLOW_MECHANISM_EVIDENCE` for every
citation). CORRECTED (Fourteenth round, `docs/ecosystem-roadmap.md`): this
section previously said `button.page` (the `redirectThisApp`/
`redirectOtherApp` button variant) was `'medium'` because "a full sweep of
this project's entire 46+ app real corpus found zero real occurrences of
either enum value" — that sweep claim was false, it only ever checked one
app (`ux-pattern-catalog`). `concurrent-manager` has 17 real
`redirectThisApp` occurrences across 12 distinct pages, with `page`,
`items`, and `clearCache` all independently witnessed — see
`ApexButtonTarget`'s own doc comment in `packages/parser/src/ast.ts` for
the full corrected accounting. `redirectOtherApp` specifically remains
unwitnessed in real data.

**A target that can't be resolved to one of this app's own real pages
stays honestly unresolved** (`{ kind: 'unresolvedPage', ref: ... }`) rather
than guessed — this covers a different app's page number
(`redirectOtherApp`), a page 0/alias-less target, or an item-substitution
token (e.g. `&LAST_VIEW.`) that can't be resolved without runtime
evaluation.

**Reachability**: `flow-map.json`'s `reachability.pagesWithNoIncomingEdges`
lists pages with zero incoming edges from these four sources — a pure,
cheap computation over the graph already built, not a new evidence
question. This is explicitly a finding, not a bug claim: breadcrumbs,
navigation lists, `apex.navigation`, and Dynamic Action redirects are all
out of this pass's scope (see below), so a page reached only through one of
those will still show up here.

**Explicitly out of scope for this pass** (Thirteenth round, Decision 2) —
deliberately NOT attempted, not a gap to work around:
- Breadcrumbs and navigation lists — both are shared components, not page
  children; need new shared-component support in the parser's app-level
  output, a bigger lift than an additive field.
- Dialog-page detection (`pageMode` on a navigation edge's *target* page) —
  needs a new typed `ApexPage.pageMode` field AND a cross-page join that
  doesn't exist anywhere in this project's typed AST yet.
- Dynamic Action redirects — the full `action-c` EBNF production has no
  page/URL target field anywhere; no real DA-redirect example has been
  found in any locally accessible corpus app either.
- `apex.navigation` JS API — confirmed real and documented, but runtime-
  invoked, not present in static `.apx` export metadata at all; correctly
  Phase 2+.
- A visual Flow Map UI — logged in `docs/ecosystem-roadmap.md`, deliberately
  unbuilt until a real user hits a concrete wall `apx-flow`'s JSON/CLI
  output can't solve.

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
refresh and view-name checks, plus `interactive-report.ts` (2.6) for
search/sort via UI locators, and `report-column.ts` (2.14) for column
header presence/id assertions — all confirmed live. classicReport pages:
`report-column.ts` (2.14) covers column presence and (classicReport only)
a verified DOM-id convention; there is no dedicated classicReport region
component (no `apex.region()` widget dispatch for this type at all).
None of this is wired into the GENERATOR yet — write it by hand, the same
way `spike/tests/report-column-demo.spec.ts`/`interactive-report-demo.spec.ts`
do (a generator auto-assertion for report content was attempted and
reverted after a real live counter-example, see docs/quirks/26.1.json
`interactive-report-column-heading-not-always-own-header`). No assertion
exists for actual row counts/search RESULTS beyond what
`searchInteractiveReport()` lets you check yourself with regular
Playwright locators against the rendered rows — that remains an open item
(see docs/ecosystem-roadmap.md).

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

No dedicated component — a dashboard page is typically just several Chart
regions (2.13) composed on one page, same treatment as master-detail
(3.4). Use `ApexChartRegion` against each chart region's own runtime
static id. The runtime id can differ from the `.apx` export identifier —
see `ApexRegion.htmlDomId` (2.13) for when it's predictable vs. when it
requires live DOM discovery. Static chart config (which of the 17 chart
types a region declares) is separately typed at the parser level as
`ApexRegion.chartSettings.type` (2.9/2.10).

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
- **Chart generator support** — `ApexChartRegion` (2.13) is real and
  live-verified, but the generator cannot always auto-construct it: the
  region's runtime static id can differ from its `.apx` identifier, same
  pattern as 2.11 — predictable via `ApexRegion.htmlDomId` when set,
  otherwise undiscoverable from the export alone (confirmed on 66/97 real
  chart regions in Oracle's "Sample Charts" app). Construct it by hand
  with the real static id when `htmlDomId` is absent.
- **Region *assertions* for most region types** (as opposed to the
  `ApexRegion` API, which exists) — CORRECTED: the generator DOES emit
  region resolve-checks for `interactiveReport`/`cards`/`facetedSearch`,
  and report-column-heading presence assertions exist in `@apx/testkit`
  (2.14) — the open part is narrower now: most OTHER region types still
  have no verified DOM convention, and the generator doesn't auto-derive
  a report's full column-heading list (attempted, reverted — see 2.14).
- **Interactive Report pagination** — a real, accessible `Pagination`
  region exists, but no live multi-page dataset was available to verify
  next/prev click behavior; not wrapped as a result (2.6).
- **Region action (Cards/List) click-through effects** — presence is
  verified (2.15), but no click produces an observable effect on the only
  live app available (confirmed decorative/non-functional demo
  affordances) — a real app with a functionally wired Cards/List action
  would be needed to verify this further.
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
