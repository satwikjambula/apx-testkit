# Ecosystem roadmap (post-M4 vision)

Captures the long-term direction the maintainer wants: a comprehensive
Oracle APEX testing ecosystem, not just a smoke-test generator. Six areas
were named; this ledger groups them by what's actually verifiable today
against the one live reference app (UX Pattern Catalog) versus what needs
new ground truth first — same evidence-over-assumption rule as everywhere
else in this project (see CLAUDE.md Invariant 2).

## Tier 1 — buildable now, real ground truth exists

- **Richer component APIs: Interactive Report, Cards, Faceted Search — DONE.**
  Shipped in `packages/testkit/src/components/{region,cards,faceted-search}.ts`:
  a generic `ApexRegion` (refresh, getSessionState, getCurrentRecordId,
  getRecordValues, getSelectedValues, focus -- confirmed on two independent
  widget types), `ApexCardsRegion` (pagination, selection), `ApexFacetsRegion`
  (facet counts, apply/clear). Two real findings from live verification,
  not assumption: Interactive Report's search/sort/pagination internals are
  ALL private (`_`-prefixed) on the widget instance -- only `refresh` is
  public, so IR doesn't get its own rich component file, just the generic
  `ApexRegion` methods. And `ApexCardsRegion.getRecords()`/`.getModel()` are
  confirmed BROKEN in this app (throw a real error from APEX's own client
  code) -- shipped anyway, documented as known-broken, per
  docs/grammar-assumptions.md and docs/limitations.md.
- **Interactive Grid — DONE, live-verified.** Third real APEX app (Oracle's
  own "Sample Interactive Grids" gallery) gave this project its first LIVE
  Interactive Grid ground truth, moving it out of Tier 3 entirely. Shipped
  `packages/testkit/src/components/interactive-grid.ts`
  (`ApexInteractiveGridRegion`, extends `ApexRegion`): `getActions()`,
  `getViews()`, `getCurrentView()`, `getCurrentViewId()`,
  `getSelectedRecords()` -- all confirmed live via the jQuery UI
  widget-factory pattern (`apex.region(id).widget().interactiveGrid(method)`,
  NOT the direct `region[method]()` shape IR/Cards use). Confirmed
  REJECTED: `model`, `view`, `getRegion`. Verified via
  `spike/tests/interactive-grid-demo.spec.ts`, 3/3 repeated live runs.
  Two significant findings alongside the component itself:
  1. **Region identifier != runtime static id, confirmed concretely for
     the first time.** The `.apx` export declares `region basic-editing
     (type: interactiveGrid ...)`; at runtime `apex.region('basic-editing')`
     returns `null`, `apex.region('emp')` resolves correctly. This means
     `@apx/testgen` CANNOT auto-construct this component from `.apx`
     metadata -- the real static id must be discovered from the live DOM
     by hand (the widget container follows `<static id>_ig`). This is a
     genuine, permanent limitation on automatic generation for this region
     type specifically, not a bug to fix.
  2. **`pageAccessProtection: argumentsMustHaveChecksum` blocks bare
     `page.goto()` navigation, even immediately after a verified login.**
     Discovered while trying to reach the IG page at all: a bare
     `page.goto()` to ANY page (even the exact page just landed on
     post-login) silently redirects to `/login`, regardless of a
     `session=` query param. Only real in-app link clicks preserve the
     session. `spike/tests/interactive-grid-demo.spec.ts` navigates via
     `page.getByRole('link', ...).click()` through the real UI (Home ->
     Editing card -> Basic Editing card) instead of `gotoApexPage()`'s
     bare-goto strategy. See docs/quirks/26.1.json for both findings in
     full, including the exact evidence.
- **Charts — DONE, live-verified, graduated to a real component.** Fourth
  real APEX app (Oracle's own "Sample Charts" gallery) gave this project
  its first LIVE Chart ground truth. Finding: region identifier != runtime
  static id, confirmed a SECOND time on an independent widget type
  (export: `area-chart-color-javascript-code-customization`, runtime:
  `area1`) — broadens the Interactive-Grid-only finding above to
  "confirmed on two widget types."
  **UPDATE (2026-07-24), with renewed live access:** the claim below this
  line originally read that `apex.region(id).widget()` returns `null` for
  chart regions. Re-tested and found FALSE, confirmed independently on
  THREE chart types (`area1`, `stackCategoryChart`, `pie1`), corroborated
  by the Sample Charts app's own exported JS calling
  `apex.region("stackCategoryChart").widget().ojChart(...)` directly. The
  real widget-factory plugin `ojChart` IS reachable through
  `region.widget()`. Its standard `option` method (getter AND setter) is
  real and working — confirmed via round-trip get→set→get. This
  overturned the earlier "not compelling enough to build" call:
  `ApexChartRegion` (packages/testkit/src/components/chart.ts) now
  exists, wrapping `getOption()`/`getOption(key)`/`setOption(key, value)`.
  `getProperty`/`getOption` remain confirmed NOT valid method names,
  unchanged. See the dedicated entry above (Tier 1) and
  docs/quirks/26.1.json for the full corrected investigation.
- **Automatic waits tied to APEX's client lifecycle — DONE for the
  region-operation case.** Shipped `packages/testkit/src/fixtures/lifecycle.ts`:
  `callRegionMethodAndWaitForEvent()` and `waitForRegionEvent()`, built on
  APEX's real `apexbeforerefresh`/`apexafterrefresh` events (confirmed live
  via monkey-patching `$.fn.trigger` to observe what actually fires, not
  guessed from docs). Fixed the concrete motivating case:
  `ApexFacetsRegion.fetchCountsAndWait()` replaces the old
  `fetchCounts()`-then-poll workaround with a deterministic event wait
  (verified reliable across 3 repeated live runs). IMPORTANT scoping
  finding: these are jQuery custom events, NOT native DOM CustomEvents —
  confirmed live that a plain `element.addEventListener(...)` never fires;
  the wait must go through `apex.jQuery`'s own `.on()`. This pattern is
  reusable for any region method that fires a lifecycle event, but does
  NOT apply to the one `page.waitForTimeout(1000)` in generated "clean
  console" specs — that wait exists to catch late, unpredictable async
  console errors, which isn't a single-completion-event problem the way a
  region refresh is. That timeout stays.
- **VS Code/Cursor integration that regenerates on export change — DONE.**
  Shipped as a `--watch` flag on `@apx/testgen`'s CLI (`fs.watch(...,
  { recursive: true })`, 250ms debounce to absorb multi-file export
  bursts), not a VS Code extension — consistent with
  docs/editor-integration.md's existing "no traditional VS Code extension"
  decision. Verified live: editing a tracked `.apx` file's `title` while
  `--watch` was running triggered a real regeneration with the updated
  content. Run it in an integrated terminal / VS Code task and leave it
  running while editing in App Builder/VS Code's APEXlang support.
- **Code coverage mapping from generated tests back to APEX components —
  DONE.** Design resolved: "coverage" here means which declared
  items/regions/buttons (by `.apx` identifier, or label for buttons -- no
  verified button-id convention exists) a test run actually touched,
  cross-referenced against the AST -- not traditional code-line coverage.
  Shipped as an opt-in recorder in `@apx/testkit`
  (`fixtures/coverage.ts`: `recordCoverageTouch()`, wired into
  item.ts/region.ts/button.ts, active only when `APX_COVERAGE_LOG` is set --
  zero overhead otherwise, and file-append rather than in-memory so it
  survives Playwright's multi-worker-process model) plus a report generator
  and CLI in `@apx/testgen` (`coverage.ts` + `apx-coverage` bin). Verified
  two ways: the report's cross-referencing logic against a synthetic touch
  log with known expected output, and the recorder itself live -- ran the
  real p410 + faceted-search-cards specs with `APX_COVERAGE_LOG` set and
  confirmed every recorded touch matched exactly what those specs did (the
  6 items checked by `expectItemsPresent`, both real region ids, the
  "Primary Action" button label).
  Follow-up refinement: regions whose type has no `@apx/testkit` component
  at all (at the time: `interactiveGrid`, `tree`, `calendar`, `chart`,
  `map` — kept in sync with the region-shaped stubs in
  `packages/testkit/src/components/unsupported.ts`) are now reported in a
  separate "untrackable" bucket rather than counted as "untouched" —
  conflating the two would misrepresent "nobody tested this" as
  indistinguishable from "this can't be tracked yet." Verified against a
  synthetic fixture with a mixed form + interactiveGrid page, and against
  real exports (see "Second, third, and fourth real exports" below) whose
  `tree`/`chart`/`calendar`/`interactiveGrid` regions correctly fell into
  the untrackable bucket instead of misreporting as untouched-but-trackable.
  (`interactiveGrid` and `chart` later graduated to real components and
  were removed from this bucket in `packages/generator/src/coverage.ts` —
  see the Tier 1 entries above; this paragraph describes the state as
  built at the time.)
- **Message/notification assertions — DONE.** `apex.message` confirmed
  live as a universal, documented top-level API;
  `#APEX_SUCCESS_MESSAGE`/`#APEX_ERROR_MESSAGE` confirmed present on every
  page's template. Real bug found before shipping: Playwright's
  `toBeVisible()`/`toBeHidden()` are unsafe against these elements
  (rendered height stuck at `0px` even with the `u-visible` class
  correctly applied, when triggered outside a real form submission) —
  fixed by asserting the `u-visible`/`u-hidden` class directly instead.
  Shipped as `packages/testkit/src/components/messages.ts`
  (`expectSuccess`/`expectError`/`expectNoErrors`/
  `expectNoSuccessMessage`), verified live across 3 repeated runs.

**Fifth through thirteenth real exports (parser/generator only, no live
app; zips, no URLs).** A batch of nine more official Oracle sample apps:
`apextogo`, `image-support-rte`, `sample-application-search`,
`sample-calendar`, `sample-cards`, `sample-charts`, `sample-collections`,
`sample-master-detail`, `sample-vector-search`. All nine parsed and
generated with **zero warnings, zero crashes**, and deterministic output
(each regenerated twice, byte-identical) — the parser's grammar (including
the quoted-identifier fix from the "Sample Interactive Grids" batch) holds
up against a genuinely wide variety of real APEX applications. `apx-diff`
self-diff correctly reports zero changes on all nine.

This batch is the richest static ground truth this project has for two
previously near-empty region types: **`calendar`** (21 regions in
`sample-calendar` alone, plus 1 more in `sample-master-detail`) and
**`chart`** (97 regions in `sample-charts` — by far the largest count of
any region type in any single export this project has seen). Both remained
`UnsupportedComponentError` stubs at the time — this was static
confirmation the types are real and common, not live method-level
verification, which needed a running instance neither Chart nor Calendar
had yet (unlike Interactive Grid, which got exactly this kind of live
access — see the Tier 1 entry above — and graduated to a real component
as a direct result). **UPDATE:** Chart later got that same live access
and graduated too (see the Tier 1 Chart entry above) — Calendar has not,
and its stub is unchanged. `map` also
showed up for the first time (`apextogo`, `sample-application-search`),
updating its stub reason from "never encountered" to "confirmed present,
still no live ground truth."

Two genuinely new region types appeared that this project had never
parsed before, neither in `unsupported.ts` nor `KNOWN_REGION_TYPES`:
**`search`** (`sample-application-search`, `sample-vector-search` — an
AI-powered search-results region, gated by a `serverSideCondition` on
`CURRENT_AI_PROVIDER` = OCI/OpenAI — evidence APEX 26.1's AI features
extend beyond the chat integration already noted on Interactive Report)
and **`listView`** (`sample-application-search` — a distinct report format
alongside classicReport/interactiveReport/cards). Both parsed safely into
`raw` bags without any special-casing needed, since `KNOWN_REGION_TYPES`
is documentation-only and never gates parsing — but neither has a
dedicated component or any live verification.

If live URLs become available for `sample-calendar` or `sample-charts`
specifically, those are now the highest-leverage next live-verification
targets in this project by a wide margin — the ground truth volume alone
(21 and 97 regions respectively, across dedicated single-purpose gallery
apps) dwarfs everything else still sitting in Tier 2/3. **UPDATE:** a live
URL for `sample-charts` did become available — see the Tier 1 Chart
entry above. `sample-calendar` remains the highest-leverage open target.

- **Dynamic Actions — typed AST support, DONE.** Thirteenth real export,
  Oracle's own "Sample Dynamic Actions" gallery app, closed out a gap
  flagged repeatedly across every prior round ("no typed AST field," "no
  known way to trigger one by name"). `dynamicAction` is entirely
  parser-only work — unlike Interactive Grid/Chart, no live app was
  needed. `ApexPage.dynamicActions: ApexDynamicAction[]` now exists
  (`packages/parser/src/ast.ts`), covering the trigger (`when` block:
  selectionType/items/button/region/event), an optional
  `clientSideCondition`, and nested `action` children
  (action name + `fireWhenEventResultIs` for true/false-action lists).
  329 real `dynamicAction`s parsed across all 13 real exports this
  project now has, zero warnings, zero crashes. Wired into `apx-diff`
  (`diffDynamicActionFields`, including a nested by-identifier diff of
  the actions list) — verified with a real before/after mutation
  (changed a `clientSideCondition` value + an affected item on two
  actions) correctly detecting both the typed field change and the
  untyped raw-bag change on the affected sub-actions. Regression-guarded
  with 4 new tests in `packages/parser/test/parser.test.ts`.
  Scoping note found along the way: the component type name `action` is
  OVERLOADED in the grammar — a `dynamicAction`'s nested `action`
  children (DA steps, now typed) are a different construct from a
  stand-alone page-level `action` nested directly inside a `region` (a
  row-level action alongside `column` nodes — confirmed present in
  several real exports, e.g. `apextogo`); only the former is typed now,
  the latter is untouched and correctly still reported in `unmodeled`.
  What this does NOT solve: **runtime DA triggering** (calling a named
  Dynamic Action from a live browser) is a completely separate problem —
  see "Dynamic Action triggering" in the needs-discovery section below,
  unchanged by this work. Typed metadata makes DAs diffable and
  inspectable; it does not make them controllable from `@apx/testkit`.

- **Calendar region settings — typed AST support, DONE.** Same batch as
  the Dynamic Actions work above: `ApexRegion.calendarSettings` is now
  typed (displayColumn/startDateColumn/endDateColumn/pkColumn/showTime/
  views/dragAndDrop), confirmed across 21 real calendar regions in
  Oracle's own "Sample Calendar" gallery app. Gated on `type ===
  'calendar'` since `settings.*` is reused by other region types for
  unrelated config. Parser-only, no live app needed. The `Calendar`
  runtime stub in `unsupported.ts` is UNCHANGED and still correct — typed
  metadata about a calendar's configuration is not the same as verified
  runtime behavior; there's still zero live ground truth for what
  `apex.region(id).widget()` even returns for a calendar region, let
  alone what methods it exposes.

- **Chart region settings — typed AST support, DONE.** Same treatment as
  Calendar above: `ApexRegion.chartSettings` is now typed, but
  deliberately restrained to a single field, `type` (the 17-value chart
  type enum — area/bar/boxPlot/bubble/combination/statusMeterGauge/donut/
  funnel/gantt/line/lineWithArea/pie/polar/pyramid/radar/range/scatter/
  stock — confirmed against the official EBNF's full `region-chart-`
  property/appearance/layout productions, not just the `type` keyword).
  `chartAppearance`/`chartLayout` and the sibling `axis`/`series`/`column`
  sub-components are almost entirely visual styling (fonts, colors,
  positions, axis scaling) with no clear testing value and stay in
  `raw`/`unmodeled` — a deliberate scope decision, documented in the
  `ApexChartSettings` doc comment. Confirmed across all 97 chart regions
  in Oracle's own "Sample Charts" gallery app (107 total across every
  export this project has parsed). Confirmed live/structurally that the
  `chart {}` group is entirely OMITTED from the export when the chart
  type is `bar` (16 of the 97 "Sample Charts" regions, 23 of 107 overall)
  — `bar` is the implicit default, represented directly as `'bar'` rather
  than `null`. Parser-only, no live app needed. (UPDATE: the `Chart`
  runtime stub referenced here later graduated to a real
  `ApexChartRegion` component — see the entry below.) Regression-guarded
  with 3 new tests. Also closed a related gap found in the same pass:
  `calendarSettings` had been typed in an earlier batch but never wired
  into `apx-diff`'s `diffRegionFields()` — both `calendarSettings` and
  `chartSettings` are now diffed there.

- **A real, wide-reaching parser bug was found and fixed while building
  the above.** `parseArray()` silently dropped a real content element in
  two shapes: (1) `foo: [` with nothing inline (each array item, and the
  closing `]`, each on its own line) — confirmed `templateOptions: [` in
  exactly this shape appears **1550+ times** across every real export
  this project has parsed, meaning `#DEFAULT#` (almost always the FIRST
  templateOption) was silently missing from parsed `raw` bags
  project-wide, this whole time, until this fix; and (2) `foo: [bar`
  (first element inline with the bracket) continued across further lines
  — dropped the first full continuation line instead (zero occurrences
  in real data so far, but a real latent bug, caught by a hostile test
  fixture, not a real app). Root cause was the same in both cases: a
  double-counted line-advance between the caller (`parseBody`'s PROPERTY
  branch, which already advances past the property line before calling
  `parseValue()`/`parseArray()`) and `parseArray()`'s own unconditional
  advance on its first iteration. Fixed by using the exact same
  `consumedLine` guard the closing-bracket branch already used, applied
  symmetrically. Regression-guarded with 3 new tests (one per array
  shape) — confirmed the two multi-line tests fail without the fix.
  Verified zero regressions across all 13 real exports (still zero
  warnings, deterministic output) and the committed `examples/
  employee-page` output (byte-identical — that fixture has no
  array-valued properties, so neither bug shape ever touched it). This
  is the kind of silent, wide-reaching correctness bug this project's
  entire evidence-over-assumption discipline exists to catch — found not
  by looking for it, but by building something real (calendar settings)
  against a genuinely new export and noticing the output looked wrong.

- **Chart graduated from a stub to a real component (`ApexChartRegion`),
  DONE — and corrected two wrong prior claims along the way.** Live access
  to Oracle's own "Sample Charts" gallery app (2026-07-24) let this
  project re-test claims made in an earlier session without live access.
  Both turned out wrong:
  1. `apex.region(id).widget()` does **not** return `null` for chart
     regions — it returns a real jQuery-wrapped element, confirmed
     independently on THREE chart types (`area1`, `stackCategoryChart`,
     `pie1`), corroborated by the Sample Charts app's own exported JS code
     calling `apex.region("stackCategoryChart").widget().ojChart(...)`
     directly (a Dynamic Action's `executeJsCode` action, found in the
     `.apx` export itself). The original claim was based on a single
     region tested once.
  2. The standard jQuery UI widget-factory `option` method (getter AND
     setter) is a real, working, generic API on this widget — confirmed
     via round-trip get→set→get on `selectionMode`, and the setter call
     returns the widget itself for chaining (the standard widget-factory
     contract). `getProperty`/`getOption` remain confirmed invalid method
     names, unchanged from before.

  `ApexChartRegion.getOption()`/`getOption(key)`/`setOption(key, value)`
  wrap this. `refresh()` (inherited, generic `ApexRegion` path) is
  unchanged. See docs/quirks/26.1.json
  (`chart-region-widget-returns-null`, now corrected in place;
  `chart-widget-initialization-race`, a new finding — JET chart widgets
  attach `ojChart` asynchronously, after `domcontentloaded`, so calling
  `getOption`/`setOption` immediately after navigation can race this,
  worked around with `page.waitForFunction`).

  Separately, this same investigation diagnosed the root cause of the
  long-open "runtime static id differs from `.apx` identifier" question
  (docs/quirks/26.1.json `region-id-not-static-id`, previously
  `rootCauseDiagnosed: false`): the export's `advanced { htmlDomId: ... }`
  property, when present, deterministically predicts the runtime id
  (`<htmlDomId>_jet` for Chart, `<htmlDomId>_ig` for Interactive Grid).
  Confirmed on both region types. Now typed at the parser level as
  `ApexRegion.htmlDomId` (packages/parser/src/ast.ts), regression-guarded
  with 3 new parser tests, wired into `apx-diff`. When absent (confirmed
  on 66/97 real chart regions in Sample Charts), the runtime id is an
  APEX-internal auto-generated numeric id with no corresponding field
  anywhere in the static export — genuinely undiscoverable without live
  access, not a parser gap; `@apx/testgen` still cannot auto-wire every
  chart region up from metadata alone.

  Bonus fix found in passing while updating `packages/generator/src/
  coverage.ts`'s `UNTRACKABLE_REGION_TYPES`: `interactiveGrid` had been
  left in that set since the coverage-mapping feature was first built,
  even though Interactive Grid graduated to a real
  `ApexInteractiveGridRegion` component in an earlier session (which
  already calls `recordCoverageTouch`) — meaning IG test coverage was
  being silently excluded from the coverage report this whole time. Fixed
  in the same pass as removing `chart` from that set.

## Tier 2 — real ground truth exists, but needs care

- **Snapshot testing for regions and pages.** Feasible (Playwright has
  built-in screenshot/snapshot assertions), but needs a design decision
  first: APEX pages often render live/seeded data, so a naive
  pixel/DOM-tree snapshot will be flaky by default. Needs a policy for what
  gets masked/excluded (timestamps, generated ids, chart data) before it's
  useful rather than noisy.

## Tier 3 — blocked without new ground truth, or genuinely novel

- **Trees as a content/data-display pattern.** The only Tree widget in the
  one available app is the universal left-nav (`a-TreeView` inside the nav
  chrome) — not a page-content region. No ground truth exists here for
  "Tree region" as the plan envisions it (e.g. a hierarchical data browser).

- **Metadata-driven analysis layer** (workflow discovery, navigation
  graphs, CRUD detection, dependency graphs, scenario generation, deeper
  coverage analysis than `apx-coverage`'s current touch-cross-reference).
  Would consume the semantic AST and produce analysis artifacts, never
  touching parsing or runtime directly — a genuinely new package
  (`packages/analysis` or similar), not an extension of `packages/generator`.
  **No such capability exists in this codebase today** — this entry exists
  specifically so the idea isn't lost, not because work has started. A
  standing "Analysis Engineer" agent role was proposed alongside this and
  deliberately NOT added to `.claude/agents/` for the same reason ADR-004
  already governs everywhere else in this project: there's nothing yet
  for an agent to own. Build the capability first, against a real,
  concrete use case (not a hypothetical one) — the agent, if still
  useful once something real exists, follows from that, not the other
  way around. Product Architect (`/product`) is the gate for deciding
  when a concrete proposal here clears that bar.

## Sequencing note

Given the current state (M3 engineering-complete, M4 launch-prep done,
still short a second real *user* and a second *live* app — two more real
exports now exist, `sample-workflow-approvals` and `brookstrut`, see below,
but neither is a running instance this project can navigate to), Tier 1
items are the highest-leverage next work: they extend `@apx/testkit`'s
existing verified-primitive pattern into more of what a live app can
actually prove, without waiting on external dependencies. Tier 3 items
should stay on this ledger, unbuilt, until either a *live* app with
Interactive Grid/Tree content or a design spike resolves what "coverage"
means here — building them earlier risks the exact kind of confident-wrong
assumption this project has structured itself to avoid.

**Second, third, and fourth real exports (parser/generator only, no live
app).** All three were handed over as `.apx` export zips, no URL or
credentials — so these only exercise the *static* side (parser, generator,
coverage, diff), not `@apx/testkit`'s runtime components.
`sample-workflow-approvals` (34 pages) and `brookstrut` (48 pages) parsed
and generated cleanly: zero warnings, deterministic output (each
regenerated three times, byte-identical), `apx-diff` self-diff correctly
reports zero changes on both. They surfaced real, new region-type variety
this project had never parsed before — `interactiveGrid` (5x), `chart`
(9x), `calendar` (3x), `tree`, `list`, `breadcrumb`, `smartFilters`,
`dynamicContent`, `plSqlDynamicContent`, `themeTemplateComponent/*`,
`workflowDiagram`, `regionDisplaySelector`, `plugin/*` — all parsed without
crashing, since `KNOWN_REGION_TYPES` is documentation-only, not enforced.
This found and fixed one real bug: `packages/generator/src/coverage.ts`'s
`UNTRACKABLE_REGION_TYPES` only listed `interactiveGrid`, drifted from the
broader claim already committed in `unsupported.ts` (tree/calendar/chart
also have no component) — brookstrut's real `chart`/`calendar` regions
would have been silently miscounted as "untouched" instead of correctly
flagged untrackable. Fixed and verified against both exports. (This set
changed again later: `interactiveGrid` and `chart` both graduated to real
components and were removed from it — see the Tier 1 Chart entry above.)
Separately,
`sample-workflow-approvals`'s `application.apx` declares a *custom*
authentication scheme (`@demo-purposes-only-custom-auth-scheme`) with no
page 101 in the export at all — real evidence that the generator's
default-scheme login assumption (see Tier 1 login item above) doesn't hold
universally, which is now documented rather than silently assumed.

The fourth, Oracle's own **"Sample Interactive Grids" gallery app** (49
pages, dedicated IG showcase — editing, validation, column groups, row
selection, master-detail, dialogs, dynamic actions, and more), initially
produced 22 parser warnings across 11 pages, all the same pattern:
`column "Row Header" (` — the IG row-selector pseudo-column uses a quoted,
space-containing identifier, which the grammar's `COMPONENT_OPEN` regex
(a single `\S+` token) didn't match. This wasn't a benign warning: the
desync it caused let the column's own `type: rowSelector` property leak
onto and silently overwrite the enclosing region's real `type`
(`interactiveGrid` corrupted into `rowSelector`), and the column's closing
`)` got consumed as the region's own closer, orphaning everything declared
after it (a real `next` button, confirmed missing from the parsed AST).
Fixed in `packages/parser/src/parser.ts` (quoted identifiers now supported
and unquoted), regression-guarded with a minimal reproduction in
`parser.test.ts`, confirmed to fail all four ways against the pre-fix
regex. After the fix: zero warnings, 49/49 pages generated, deterministic,
self-diff clean — and coverage now correctly reports 39 `interactiveGrid`
regions as untrackable (up from what would have been ~28 correctly-typed
plus 11 silently mistyped before the fix). This is by far the richest
Interactive Grid ground truth this project has — see the "Second and
third real exports" caveat above: still zero *live* verification, since
none of the three came with a running instance.

## Extended vision: 16-point product roadmap (maintainer proposal)

A much larger product vision was proposed: semantic page-object APIs,
per-widget-type components (Text/Number/Checkbox/Switch/RadioGroup/
SelectList/DatePicker/PopupLOV/RichText/FileBrowse/Shuttle), per-region
components (Interactive Grid/Report/Classic Report/Cards/Tree/Calendar/
Chart/Map/Faceted Search), dialog support, Dynamic Action triggering,
message assertions, session helpers, a full component type hierarchy,
fluent `expect().toHaveValue()`-style assertions, metadata-driven test
recipes, a generator plugin system, semantic button method names, richer
lifecycle waits, doc improvements, and a versioned support strategy.
Classified below against the same evidence standard as the rest of this
project — several items duplicate what's already built, several are
buildable now, several need a discovery pass first, and several would
require guessing at behavior with zero ground truth, which is exactly the
trap this project has caught itself in (and corrected) multiple times
already (Cards.getRecords(), the login() race condition, and the
message-visibility bug above).

**Load-bearing correction to a sequencing assumption in this proposal:**
a follow-up round of the same proposal claimed "the parser already knows
required items, LOVs, buttons, regions, validations, navigation, item
types" as justification for shifting focus entirely to the runtime/
generator side. Checked directly against `packages/parser/src/ast.ts`:
`ApexPage` has `regions`/`items`/`buttons` (typed); `ApexItem` has
`required` as a real typed field (though its canonical property name is
itself unverified per CLAUDE.md debt #3 -- no required item has ever
appeared in a live export). **LOVs, server-side validations, and
navigation/branches have NO typed AST field at all** -- they currently
fall into `raw` bags or the `unmodeled` list, exactly like anything else
the parser hasn't built a typed projection for yet. This means
metadata-driven generation for LOV flows, validation-message tests, or
navigation/branch testing needs *parser* extension first, not just
runtime/generator work -- "the parser is solid, shift to runtime" does not
hold uniformly across this whole proposal.

### Already done / substantially overlaps existing work

- **Semantic naming (1.1).** The generator already emits camelCased,
  page-prefix-stripped property names (`po.ename`, not `po.P3_ENAME`) —
  see `packages/generator/src/page-object.ts:computeItemPropNames()`. Not
  label-derived (`employeeName` from a "Name" label plus page context) —
  that's a naming-heuristic choice, not a new capability; low priority.
- **README structure (14).** Already reorganized into exactly this order
  (what it is / 30-second example / why it's different / architecture /
  limitations / roadmap) in an earlier pass this session.
- **Automatic wait strategy, region case (13).** `waitForRegionEvent()`/
  `callRegionMethodAndWaitForEvent()` already ship this generically (see
  Tier 1 above). `waitForPageReady()` is effectively already inside
  `gotoApexPage()` (waits for `apex.item` to exist) — worth exposing as
  its own named export, but it's extraction, not new capability.
- **Region generic methods (2, "Region" bullet).** `refresh()`/`wait()`
  exist. `expectLoaded()`/`expectEmpty()`/`expectContains()` don't exist by
  those names yet but are buildable now as thin assertion sugar over
  already-verified `ApexRegion` methods — see "buildable now" below.

### Buildable now, high confidence (no new ground truth needed)

- **Fluent built-in assertions (8).** `expect(item).toHaveValue(...)` /
  `.toExist()` / `.toBeVisible()` as Playwright custom matchers
  (`expect.extend()`) over the already-verified `ApexItem` methods. Pure
  ergonomics, zero new risk.
- **Semantic button method names (12).** `save()`/`cancel()`/`delete()`
  instead of `clickSave()` — a naming heuristic over the button's `label`/
  `action` fields, already available in the AST. Small, safe change to
  `page-object.ts`.
- **Capability matrix (14).** A compact ✅/🚧/❌ table is a real
  improvement over prose for scanning status at a glance — should be
  added to README, generated from the same facts already in
  docs/support-matrix.md.
- **Region assertion sugar (2).** `expectLoaded()`/`expectEmpty()`/
  `expectContains()` on `ApexRegion`, built from `getSessionState()`/
  `getRecordValues()` (already verified) plus a text-content locator
  check — no new APEX-side ground truth required, just composition.
- **Cards indexed/text lookup (2, "Cards").** `cards.card(2)` /
  `cards.card("Scott")` — buildable as a DOM locator over `.a-CardView-item`
  elements (confirmed present live), finding by index or contained text.
  Does NOT depend on the broken `getRecords()`/`getModel()` — a genuinely
  different, safer path to the same goal. `cards.count()` likewise via
  `getPageInfo()` or a locator count, not the broken methods.
- **A first test recipe: `requiredFields()`-adjacent groundwork (9).**
  Full recipes need more underlying primitives, but the *pattern* (a
  function that reads the AST and emits several assertions) can be
  prototyped now against what's already verified (items + presence), to
  validate the design before committing to it broadly.

### Needs a discovery pass first (real API may well exist, unverified by this project)

- **Dialog support (3).** `apex.navigation.dialog` is a real, documented,
  universal Oracle API (not per-widget) — plausible high-confidence
  candidate, but not yet checked live in this project, and drawer/modal
  pages already have one confirmed issue (p00420 returns 400 on direct
  navigation) that dialog-open/close behavior might intersect with.
- **`logout()` (6).** No confirmed generic mechanism yet; needs checking
  whether a documented `apex.navigation`-based signout exists or whether
  it's app-specific.
- **`waitForSubmit()` (13).** Plausible a page submit fires an analogous
  lifecycle event the way region refresh does (`apexbeforerefresh`/
  `apexafterrefresh`) — unverified; worth one discovery pass the same way
  those were found (monkey-patch `$.fn.trigger` during a real submit).
- **Classic Report (2).** Never tested at all in this project. Oracle
  documents it as a simpler static HTML table, plausibly low-risk, but
  zero live verification exists yet.
- **Select List richer methods (1.2).** `select(label)`/`selectByValue()`/
  `expectOptions()` beyond plain `setValue()` — the underlying widget is
  verified for get/set; the richer label/value/option-list interactions
  are not.
- **Checkbox (1.2).** Not among the item types actually tested
  (textField, textarea, numberField, selectList, datePicker, hidden were —
  checkbox wasn't). Likely tractable, not yet confirmed.
- **Date picker rich interaction (1.2).** `date.select("2026-04-10")`
  implies driving a calendar widget UI, not just `setValue()` (which IS
  verified). The widget-interaction layer is unverified.
- **Faceted Search per-facet interaction (2).** `facet("Department").select("Sales")`
  — already flagged in `faceted-search.ts` as parameter-shape-inferred,
  not directly exercised live.
- **`waitForAjax()` (5, follow-up round).** Same idea as `waitForSubmit()` --
  plausible a generic AJAX-in-flight signal exists (APEX's own busy/loading
  indicator, or a jQuery ajaxStart/ajaxStop-style event), but unverified;
  same discovery method as the region-refresh events would apply.
- **`waitForDialog()` (5, follow-up round).** Tied to Dialog support above
  -- needs the same discovery pass before a wait can be built on top of it.
- **`toBeReadOnly()` item assertion (6, follow-up round).** Whether an
  item's read-only state is reliably observable (a DOM attribute,
  `apex.item(id)` property, or CSS class) has not been checked; `required`
  has a real AST field already (though its canonical property name is
  itself unverified -- see CLAUDE.md debt #3) but read-only does not.
- **`toContainRow()`/`toHaveRows()` region assertions (6, follow-up
  round).** For Interactive Grid this is blocked the same way `grid.*` is
  (zero ground truth, Tier 3 below). For Interactive Report/Classic
  Report, this would need the UI-locator-based approach noted in "Correction
  to the proposal" below, not a JS-API call -- and Classic Report itself is
  still an untested "needs discovery" item.

### Correction to the proposal itself (would contradict a verified finding)

- **Interactive Report `search()`/`filter()`/`sort()` (2).** CONFIRMED
  live that IR's search/sort/pagination internals are ALL private
  (`_`-prefixed) on the widget instance — there is no public JS method to
  call for these. Building `report.search()` as a JS-API wrapper isn't
  possible without a different approach: driving the actual UI (fill the
  visible search input, click a sort header) via accessible locators,
  which is a real option but a fundamentally different implementation
  than "call a method" — and still needs its own verification pass.

### Zero ground truth — do not build without a real app to check against

- **Interactive Grid (2)** — already Tier 3 above. `grid.addRow()` etc.
  cannot be verified without an app that has one.
- **Trees as content (2)** — already Tier 3 above. Only the nav-reuse case
  is confirmed; no hierarchical-data-browser Tree has ever been seen.
- **Calendar, Map, Timeline, Smart Filters (2, follow-up round)** — never
  encountered in any app this project has touched, live or otherwise. No
  basis to design an API yet for any of these four.
- **Switch, RadioGroup, Popup LOV, Rich Text, File Browse, Shuttle
  (1.2)** — none tested. Popup LOV is the most plausible near-term win
  (Oracle documents a fairly standard open/search/select flow) but still
  needs a live app with one to verify against, not just documentation.
- **Dynamic Action triggering (4).** No known generic, documented JS API
  to trigger a *named* Dynamic Action programmatically — DAs are bound to
  specific DOM events on specific components, not individually addressable
  by name as far as this project has found. This needs research into
  whether such a capability exists at all before any design, let alone
  code — flag as "may not be feasible via any public API."
- **`asUser()`/`switchWorkspace()` (6).** Workspace switching is an App
  Builder / development-time concept, not something a typical deployed
  end-user app exposes at runtime — likely a scope mismatch rather than a
  missing feature. `asUser()` is already achievable today by calling
  `login()` again with different credentials; no new primitive needed.

### Bigger architecture, not blocked but not urgent

- **Full component type hierarchy (7).** Reasonable direction, but
  premature as a big-bang refactor while most item/region types in the
  hierarchy are still unverified. Grow the class tree incrementally as
  each type gets real verification, the way `ApexCardsRegion`/
  `ApexFacetsRegion` were added one at a time this session.
- **Metadata-driven test generation / recipes (9, 10).** Real
  differentiator, but composed almost entirely of primitives that don't
  exist yet (PopupLOV, confirmed `required` behavior, Dynamic Actions).
  Revisit once more of the "needs discovery" and "zero ground truth"
  items above have real primitives.
- **Generator plugin system (11).** No ground-truth blocker — pure
  software design — but a real plugin architecture is significant scope
  on its own. Start smaller: one pluggable extension point (e.g. a custom
  naming function) rather than a full `generator/plugins/` ecosystem.
- **Version support strategy (15).** support-matrix.md already states
  "verified against 26.1 only" plainly. A tiered framing
  ("primary/previous/community supported") would need HONEST wording —
  this project has zero evidence about any version besides 26.1, so
  claiming "previous release: best effort" isn't something to assert
  without having actually tried it.
- **Full directory restructure (16).** A sensible long-term shape, but
  reorganizing `packages/testkit/src/` into `components/items/`,
  `components/regions/`, `dialogs/`, `messages/`, `navigation/`,
  `assertions/`, `fixtures/`, `recipes/`, `plugins/` now — before most of
  those exist — would be restructuring for a future that isn't built yet.
  Let the directory shape follow what's actually there.

## Third round: "reference implementation" vision

A further proposal aimed at making this the reference Oracle APEX testing
framework: an Application Model above page objects, a Navigation Graph,
automatic CRUD test generation, metadata assertions, export-to-export
regression detection, version-to-version APEX upgrade analysis, metadata
snapshotting, a fuller wait engine, accessibility/security/performance
smoke suites, category-level coverage reporting, an APEX linter, schema-
aware data builders, a best-practices report, and a recommendation to stop
developing against a single app.

### Scope conflict worth resolving explicitly, not drifting into

- **Oracle APEX Linter** and **Best Practices Report** directly reverse a
  stated project commitment: README.md and docs/support-matrix.md both say
  "No linter — APEX Advisor and SQLcl own that role," specifically to avoid
  competing with Oracle's own tooling. This isn't a ground-truth gap like
  everything else in this doc — it's a scope decision that would need to
  be made deliberately, not accreted feature-by-feature.

### Buildable now, high confidence, and genuinely novel (no new ground truth)

- **Regression detection between two exports — DONE.** Shipped as
  `packages/generator/src/diff.ts` (`computeDiff()`) + the `apx-diff` CLI
  bin. Per page: added/removed pages, page-level field changes
  (alias/name/title/`security.authentication`), and added/removed/changed
  items, regions, buttons matched by identifier with old->new field
  values shown. Every item/region/button/page ALSO gets an
  order-independent structural comparison of its full `raw` bag (sorted
  keys before comparing, to avoid false positives from mere property
  reordering) — if anything there differs, it's reported as "other
  metadata changed" WITHOUT claiming to know what specifically changed.
  That's the honest signal for untyped constructs (LOV/validations/
  processes — Dynamic Actions are now typed and diffed field-by-field,
  see Tier 1 above): "something changed here, go look," not "the LOV
  changed," which this project cannot back up yet (see the parser-
  coverage correction above). Verified with synthetic before/after
  fixtures covering every category (page added, page removed, page
  changed with title/item-added/item-changed/item-removed/button-changed)
  plus a same-export identity check (0 changes, 1 unchanged — no false
  positives) and `--json` output shape. Follow-up: each added/removed/
  changed page also lists the generated `.page.ts`/`.spec.ts` filenames a
  regeneration touches, computed from the exact same naming helpers
  `generate()` itself uses (`pageObjectFileName()`/`specFileName()`,
  extracted into `page-object.ts` as shared single-source-of-truth
  functions) — cross-checked against real `generate()` output on the same
  fixture to confirm the filenames actually match. This closes the loop on
  what round 4's "differential testing" proposal asked for without new
  infrastructure: `apx-diff` + `apx-testgen` already compose.
- **Metadata assertions** (`expectRegion`, `expectButton`, `expectRequiredItems`
  at the page level). This is `expectItemsPresent` generalized to the
  other AST categories — same verified pattern, not a new risk.
- **Snapshot Oracle metadata (not HTML).** A natural companion to
  regression detection — snapshot the AST subset for a page (items/
  regions/buttons) rather than pixels or DOM. More stable than visual
  snapshots for exactly the reason given: metadata changes less than
  rendering does. Same zero-ground-truth-risk profile as the diff feature.

### Needs parser extension first (not just runtime/generator work)

- **Navigation Graph.** Checked directly: no `branch`/`menu`/`breadcrumb`/
  `navigation` field exists anywhere in `packages/parser/src/ast.ts` or
  `parser.ts`. The claim that "the parser already knows branches, menus,
  navigation lists, breadcrumbs" does not hold today — same category of
  correction as the LOV/validations finding from the prior round.
- **Category-level coverage (Processes).** The existing coverage report
  (items/regions/buttons) can't extend to processes until `process` is a
  typed AST field — still sits in the generator's own `unmodeled` backlog
  (see CLAUDE.md). Dynamic Actions are RESOLVED as of this round —
  `ApexPage.dynamicActions` is now typed (see Tier 1 above) — so
  DA-specific coverage tracking is now buildable in principle, just not
  built yet: there's still no verified runtime way to trigger a DA by
  name (see "Dynamic Action triggering" below), so a coverage recorder
  for DAs would have nothing real to record against today.
- **Automatic CRUD test generation.** Partially real: `region.source.tableName`
  IS a typed field already, so "this region is a form over a table" is
  detectable today. Primary-key detection and reliable save/delete-button
  identification (beyond guessing from `button.action`/`label` text) need
  more verification before a full CRUD suite could be generated with
  confidence.

### Different product surface entirely, not a testing-framework feature

- **Version-to-version APEX upgrade analysis.** Would need real exports
  from multiple APEX versions to compare — this project has only ever
  touched 26.1. Not buildable without that raw material regardless of
  design effort.
- **Security/performance/accessibility smoke suites.** Each is its own
  domain with its own correctness bar (a11y in particular has real
  standards/tooling already, e.g. axe-core) — treating these as
  metadata-generated "smoke tests" risks the same false-confidence problem
  the whole project has been careful to avoid elsewhere. Worth scoping as
  a deliberate, separate initiative if pursued, not folded in casually.
- **Schema-aware data builders.** Reasonable, but depends on knowing
  column types/constraints beyond what's currently typed (`sourceColumn`
  exists; full column metadata does not).

### On developing against more than one app

Strongly agreed, and already this project's own stated bottleneck (see
docs/support-matrix.md: "verified for this one app until [a second app]
happens"). The suggested showcase app — one app built specifically to
exercise every supported component — would unblock most of the current
Tier 3 "zero ground truth" backlog at once (Interactive Grid, Popup LOV,
Switch, RadioGroup, Rich Text, File Browse, Shuttle, Calendar, Map,
Timeline, Smart Filters, Tree-as-content, Dynamic Actions). One real
constraint: authoring an Oracle APEX application requires App Builder and
a workspace — outside what this project can do by itself. Testing,
parsing, and analyzing such an app once it exists (or hand-writing its
`.apx` source for someone to import) is squarely in scope.

## Fourth round: engineering-process vision

A further round shifted from features to process: Capability Levels
(done above), per-API verification metadata comments, explicit
"unsupported" contracts (done above), a dedicated verification-harness
package, versioned runtime contracts per APEX release, an intermediate
Application Model between parser and generator, a plugin architecture
(repeated from earlier rounds), a formal public-API stability boundary,
a Known Oracle Quirks database (done above), a real compatibility lab
with nightly runs across versions, and a stronger push to stop exposing
`ApexItem` in favor of fully typed components (repeated from round 1).

### Done this round (see the commit above)

Capability matrix, `UnsupportedComponentError` stubs, `docs/quirks/26.1.json`,
and the `apx-diff` affected-files cross-reference are all shipped and
verified — see the Tier 1 / "buildable now" sections above for the
specifics on each.

### Already substantially true, just less formal than proposed

- **Per-API verification metadata.** Every component module already
  states what's verified, against which app, and with what confidence —
  in prose doc comments (see `item.ts`, `region.ts`, `cards.ts`,
  `faceted-search.ts`, `messages.ts`, `auth.ts`, `lifecycle.ts`). The
  proposed rigid `/** Verified against: ... Confidence: High */` template
  would make this more scannable, but converting genuinely useful prose
  (which often explains *why*, including dead-end diagnoses that were
  corrected) into fill-in-the-blank fields risks losing exactly the
  reasoning that's made this project's corrections possible. Worth a
  light touch — a one-line `Confidence: High/Medium/Low` tag added to
  existing comments — not a mechanical rewrite.

### Bigger infrastructure — legitimate direction, not undertaken now

- **Dedicated verification-harness package (`packages/verifier`).** This
  session's actual verification method (navigate live, run a targeted JS
  probe via the browser tool, read the result, decide) is real and has
  caught several genuine bugs. Formalizing it into a reusable, scripted
  harness that emits structured JSON is a legitimate idea and would make
  future verification passes faster and more consistent. Not built this
  round: it's a new package with its own design questions (what's a
  "probe," how are results scored, how does it interact with a real
  browser outside this session's tools), better scoped deliberately than
  extracted reactively from four rounds of ad hoc discovery.
- **Versioned runtime contracts (`contracts/26.1/*.json`).** Downstream
  of the verification harness above — without it, "versioned contracts"
  would just be hand-written JSON restating what prose docs already say,
  with no mechanism to regenerate or validate them. And there is nothing
  to version against yet: this project has only ever touched APEX 26.1.
  The comparison workflow (26.1 → 26.2 → compatibility report) needs a
  second version's data to exist at all, which is the same constraint
  that blocks "version-to-version upgrade analysis" in round 3.
- **Application Model IR between parser and generator.** The same idea
  as round 3's Application Model, now framed as enabling multi-target
  codegen (Playwright today, hypothetically Cypress/Selenium/docs later).
  This project has exactly one consumer of the AST (the Playwright
  generator) and one output format. Inserting an abstraction layer for
  targets that don't exist and haven't been asked for is the specific
  kind of premature generalization this project's own conventions warn
  against — "don't design for hypothetical future requirements." If a
  second real output target is ever needed, that's the moment to extract
  the IR from the two concrete consumers, not before.
- **Plugin architecture.** Same assessment as rounds 1 and 3: legitimate
  eventually, not urgent, start with one concrete extension point (e.g. a
  pluggable naming function) rather than a `generator/plugins/` ecosystem
  designed ahead of any actual plugin author.
- **Formal public-API stability boundary** (`@apx/testkit/runtime` =
  internal, top-level = stable). Reasonable once the package has enough
  surface area and enough external consumers that internal refactors
  risk breaking someone. At the current size (a handful of modules, one
  real consumer — this project's own generator and spike suite) the
  cost of declaring and maintaining that boundary likely exceeds the
  benefit. Worth revisiting once `@apx/testkit` has outside consumers.
- **Full compatibility lab** (`compatibility/oracle/26.1/`, `26.2/`,
  `nightly/`, generated/verified/reports per version). The most
  infrastructure-heavy proposal across all four rounds. Requires: (a) the
  verification harness above, (b) multiple real APEX versions to compare
  (this project has only ever run against 26.1), and (c) a nightly CI
  environment with live APEX access — none of which exist today. The
  underlying need is real (this project's single biggest weakness really
  is "verified against one app, one version"), but the showcase-app
  recommendation from round 3 is the more tractable first step toward it;
  a nightly multi-version lab is a natural extension once that exists,
  not a starting point on its own.
- **Fully typed component hierarchy (stop exposing `ApexItem`).** Same
  assessment as round 1: reasonable direction, premature as a wholesale
  change while most item types (Switch, RadioGroup, PopupLOV, RichText,
  FileBrowse, Shuttle, even Checkbox) have no verified behavior to build
  a typed wrapper from yet — see the `unsupported.ts` stubs shipped this
  round for exactly why guessing at those wrappers isn't done lightly
  here. Grow the typed hierarchy one verified type at a time, as already
  established with `ApexCardsRegion`/`ApexFacetsRegion`.

## Seventh round (2026-07-27): `branch`/`validation`/`lov` — Product Architect scope decision

Prompted by `concurrent-manager` (the 46th app, the project's own user's
app): 6 pages use `branch`, 34 use `validation`, and
`shared-components/lovs.apx` is referenced across 11+ pages — all three
sit in the confirmed 17-type unmodeled-set (see
`docs/grammar-assumptions.md` "Still open", concurrent-manager pass) with
no typed AST field and no runtime component. Verdict on each, applying
this project's existing bar (real ground truth, clear testing/diffing
value, ADR-002's parser-only stopping point, check existing components
before proposing new ones) — not a new framework, slotted into the
existing Tier structure above:

- **`branch` — BUILD NOW, parser-only. No runtime component.** A branch
  is a server-side page-processing redirect rule
  (`REDIRECT_PAGE`/`REDIRECT_APP`/target, gated by a condition) — there is
  no client-JS hook to observe "which branch fired" the way region
  methods are observed elsewhere in this project; the only externally
  observable effect is which page/URL you land on, which `@apx/testkit`
  can already assert today with zero branch-specific code
  (`page.url()`). That rules out a runtime component the same way `branch`
  was already ruled out of the Navigation Graph proposal above ("needs
  parser extension first"). What DOES have clear, direct value: a typed
  `ApexPage.branches` field (sequence, condition, target) makes branches
  diffable in `apx-diff` and gives static analysis (unreachable-branch
  detection, coverage-recording input) something real to read — exactly
  the Dynamic-Actions precedent (typed metadata without runtime
  triggering being a legitimate, complete stopping point per ADR-002).
  **Next step: `/parser`** — type `ApexPage.branches`, wire into
  `diffPageFields()`, regression tests, per
  `.ai/checklists/parser-change.md`.

- **`validation` — typed AST field BUILD NOW; runtime component DEFERRED
  pending a live-verification pass.** The parser-only half is the same
  low-risk, high-precedent move as `branch` (name, associated item/page,
  `valueRequired`-shaped condition — clear diffing value, 34 pages of
  real ground truth in `concurrent-manager` alone). The runtime half is
  NOT a "don't build" — this project's own `messages.ts` already wraps
  `apex.message`/`#APEX_ERROR_MESSAGE`, the same universal mechanism
  Oracle uses for validation failures, and Oracle's own "Sample
  Interactive Grids" gallery app (already live-accessible in this
  project — see the Interactive Grid Tier 1 entry) explicitly advertises
  "validation" among its showcased features. That means live ground
  truth to check this against may already be reachable without acquiring
  a new app. But it must be CHECKED, not assumed: does a triggered
  server-side validation failure actually surface through
  `#APEX_ERROR_MESSAGE` (in which case `expectError()` already covers
  this today, zero new runtime code needed), or does APEX route
  item-level validation failures through a different, inline
  per-item error element `messages.ts` doesn't touch? Building a new
  `validation.ts` runtime component before that check risks duplicating
  `messages.ts` or guessing at a mechanism, exactly what ADR-002 exists
  to prevent. **Next step: `/apex`** to verify live against Sample
  Interactive Grids first; typed AST field can proceed in parallel via
  `/parser` since it doesn't depend on the runtime finding.

- **`lov` — narrow reference field BUILD NOW; full LOV definition
  resolution NOT NOW.** Two different asks bundled under one name.
  (1) A `selectList`/`radioGroup` item's *reference* to a named LOV
  (the property already sits in each item's `raw` bag today) is cheap,
  parser-only, and has the same diffing value as `branch`/`validation`
  above — if a select list's LOV source changes, `apx-diff` should say
  so by field, not "other metadata changed." **Next step: `/parser`** —
  add e.g. `ApexItem.lovName` (gated to `selectList`/`radioGroup`/
  `popupLov` item types), wire into `apx-diff`. (2) Resolving the LOV
  *definition itself* (the actual list of values in
  `shared-components/lovs.apx`) is a different, bigger thing: that file
  sits outside `loadExport()`'s current scope entirely (confirmed:
  `shared-components/**` — plugin definitions, themes, static files — is
  never parsed today, only a resulting item-level reference to a plugin
  or LOV is, per the concurrent-manager plugin finding above). Parsing
  it would mean extending the generator's file-scope, a real
  architecture change, not a field addition — and there is no concrete
  consumer asking for the actual *values* yet, only the reference. Left
  in Tier 2 ("needs care") rather than built now. Runtime PopupLOV
  support is UNCHANGED and stays a stub in `unsupported.ts` — still zero
  live ground truth for the actual open/search/select widget flow,
  already correctly tracked in Tier 3 above; a typed reference field
  does not change that.

None of the three change the "zero ground truth" status of
`RadioGroup`/`PopupLOV`/`Switch` runtime components in `unsupported.ts` —
this round is exclusively about the parser layer plus one scoped
live-verification step for `validation`.

### Follow-up (2026-07-27/28): `/apex` live-verification pass on `validation` — inconclusive, real new signal, still blocked on login

The scoped live-verification step above ("does a triggered server-side
validation failure surface through `#APEX_ERROR_MESSAGE`, i.e. does
`messages.ts`'s `expectError()` already cover it with zero new code")
was attempted. Result: **not resolved — genuinely blocked, not merely
undone** — but the attempt surfaced concrete, evidence-backed signal a
future pass can start from instead of guessing.

**Blocker, stated plainly, first**: both of this project's live-running
apps that actually have real ground truth for this question — Sample
Interactive Grids and Sample Charts — require login
(`pageAccessProtection: argumentsMustHaveChecksum` + a real
authentication page), and this pass had **zero credential values
available anywhere in the environment** (by design — `APX_LOGIN_TEST_USERNAME`/
`APX_LOGIN_TEST_PASSWORD` are read from env vars at test-run time only,
never committed, and were unset in this session). Separately and
independently, an AI agent driving a browser interactively is barred
from ever entering a password into a login field, regardless of who
supplies it or asks for it — a hard operating rule with no
task-instruction override. Both facts together mean the login-gated
half of this verification did not happen this pass, not because it was
skipped, but because it could not be done inside the rules this agent
operates under. If this needs to be closed with actual DOM/console
evidence from Sample Interactive Grids, it has to be done either by a
human running the existing env-var-gated Playwright spec
(`spike/tests/interactive-grid-demo.spec.ts` pattern extended to
page 31), or by an agent/session that has legitimate credential access
through a mechanism other than an AI directly typing a password.

**What WAS confirmed, live and via real export data, in this pass:**

1. **The "advertises validation" claim (checked, not trusted) is TRUE —
   confirmed via the real `sample-interactive-grids` export, not
   paraphrase.** Page 31, alias `VALIDATION`, name "Validation," exists
   with two genuine page-level `validation(...)` components scoped to
   the Interactive Grid's `editableRegion`: `comm-limit` (SQL expression
   `:COMM is null or to_number(:COMM) < 1.5 * to_number(:SAL)`) and
   `hire-date-in-past` (`to_date(:HIREDATE) < SYSDATE`, `associatedColumn:
   HIREDATE`), plus column-level `validation { valueRequired: true }` on
   the `ENAME` and `HIREDATE` columns. The page's own bundled help text
   is directly informative: *"The Name column is set to Required. This
   will be checked on the client as well as the server... Required
   columns are indicated with a red triangle in the column header (when
   in edit mode). Remove the name... to see how the validation error is
   reported."* That description ("red triangle in the column header,"
   "reported" in-grid) points at Interactive Grid's own cell/row-level
   validity UI, not a page banner — real signal, not yet live-confirmed
   DOM evidence.
2. **A new, real, negative finding on the one live app reachable
   *without* login** (UX Pattern Catalog — public authentication scheme,
   used because the two apps with genuine validations are gated): its
   "Data Entry – Simple Form" page (410) visually marks Name and Job
   Code as required, and clicking its Save button *does* perform a real
   `POST .../wwv_flow.accept` (confirmed 3× via `read_network_requests`,
   not a client-side no-op) — but `#APEX_ERROR_MESSAGE` and every
   per-item `_error_placeholder` element stay empty/`u-hidden` every
   time. This reference-pattern page's required marker is decorative,
   not backed by a real validation — see
   `docs/quirks/26.1.json`'s `ux-pattern-catalog-required-marker-not-enforced`
   entry for full evidence. Useful negative result (this specific page
   can't be used to observe a real validation failure), but it does not
   answer the actual question either way.

**The concrete, evidence-backed hypothesis for the next `/apex` or
`/runtime` pass to check, once login access exists**: Interactive Grid
validation failures are structurally unlikely to route through the same
`#APEX_ERROR_MESSAGE` page banner `messages.ts` wraps, because IG saves
are per-row AJAX operations (`interactiveGridAutoRowProcessing`) handled
by the grid widget's own client-side validity/error display (cell
highlighting, row error icon) — a different code path from a classic
page's full-submit-and-redisplay-with-`showErrors()` flow that a
Form-region declarative Validation would use. This is reasoned from the
export's own descriptive text plus the general, well-documented
structural difference between IG's AJAX row-save protocol and classic
page processing — **explicitly not itself live-confirmed this pass**,
flagged here as a hypothesis, not a finding, per ADR-002/004 discipline.
For a classic Form-region page-level Validation (not Interactive Grid),
the documented `apex.message` API surface (item Error Template vs. page
Notification template) is structurally consistent with what
`messages.ts` already wraps — but even that specific case has never
actually been observed via a genuine validation-triggered failure
either: `messages.ts`'s own doc comment states its existing live
verification called `apex.message.showPageSuccess()` **directly**, not
through a real submission that failed a real declarative validation.
So neither the Form case nor the Interactive Grid case has a fully
closed, DOM-observed answer yet — this pass narrows the open question
and gives it a concrete reproduction target (page 31 of Sample
Interactive Grids, clear the Name cell, save, inspect
`#APEX_ERROR_MESSAGE` vs. the grid's own error UI), it does not close
it. **Verdict: still deferred, not resolved; `validation`'s runtime
component stays un-built until this specific reproduction happens with
real login access.**

### Continuation (same pass): the remaining 15 unmodeled types

`branch`/`validation`/`lov` were 3 of the 17 real, corpus-confirmed
unmodeled component types (`docs/grammar-assumptions.md`, "Still open",
concurrent-manager pass). Asked directly whether anything else in that
17-type set is missing a decision: yes, the other 15 — `action`, `axis`,
`column`, `columnGroup`, `computation`, `facet`, `filter`, `layer`,
`metaTag`, `pageGroup`, `parameter`, `process`, `savedReport`,
`searchSource`, `series`. Triaged the same way, on real evidence, not
guessed.

**Evidence source for this pass**: every one of the 46 real apps in this
corpus already has a per-app "Unmodeled component types" breakdown
recorded in its own `examples/verified-apps/<app>/RESULTS.md` (written
when that app was added to the corpus). Grepping all 46 files directly
gives an exact, real, per-type app-count — the same real-data discipline
this project already applies everywhere else, not a new method:

| Type | Apps (of 46) |
|---|---|
| `process` | 45 |
| `column` | 39 |
| `pageGroup` | 29 |
| `savedReport` | 29 |
| `computation` | 19 |
| `series` | 14 |
| `action` | 14 |
| `axis` | 12 |
| `facet` | 9 |
| `layer` | 6 |
| `filter` | 5 |
| `columnGroup` | 3 |
| `parameter` | 3 |
| `searchSource` | 3 |
| `metaTag` | 1 |

(`branch` 27/46, `validation` 19/46 — already decided above, included
here only to calibrate scale: this round's "near-universal" and "rare"
language is relative to those two known reference points.)

**Important note on what this pass did NOT do**: it did not re-fetch or
re-cross-check the official APEXlang EBNF production for any of these 15
— that is `/parser`'s job, per `DESIGN_GUARDRAILS.md`'s "always
cross-check the full relevant EBNF production" rule, and a precondition
for any of these before implementation, not something a scope decision
can substitute for. What follows is frequency plus plausible semantic
grouping (cross-referenced against this project's own prior findings in
`docs/grammar-assumptions.md` and `docs/component-coverage-matrix.md`),
enough to decide *whether it's worth asking `/parser` to do that check at
all* — the actual Product Architect question — not enough to claim any
of these are grammar-confirmed yet.

#### BUILD NOW — parser-only, same shape and bar as `branch`/`validation`

- **`process`** (45/46 — closer to universal than `branch` or
  `validation` themselves). This is the APEX Page Designer "Processing"
  node — the same family as `branch`/`validation`/`computation` (the
  canonical four page-level PL/SQL/built-in processing categories:
  Processing, Validation, Branch, Computation). Same reasoning as
  `branch`'s verdict above applies directly: no client-JS hook exists to
  observe "which process fired" — the only externally observable effect
  is a page's resulting state (a row got inserted, a redirect happened),
  which `process` metadata itself doesn't change how `@apx/testkit`
  observes. What has clear, direct value: a typed `ApexPage.processes`
  field (name, process type, when-condition, sequence) is real
  `apx-diff` and coverage-input material, and is actually stronger
  CRUD-detection signal than `branch` — process type names directly
  distinguish "Automatic Row Fetch"/DML processes from custom PL/SQL,
  exactly the kind of static signal the previously-rejected "Analysis
  Engineer" proposal would have needed before it could exist (still not
  building that agent — this is parser metadata, not a workflow-discovery
  engine). **Next step: `/parser`**, full `page-process-*` EBNF
  production check first, then `ApexPage.processes` +
  `diffPageFields()` wiring + regression tests.
- **`computation`** (19/46). The fourth member of the same canonical
  Page-Designer cluster as `branch`/`validation`/`process` — an item +
  computation-type + when-condition shape, same diffing value, same
  "no runtime hook, parser-only" stopping point. No reason to treat it
  differently from its three siblings now that three of the four already
  have a verdict. **Next step: `/parser`**, alongside `process`.
- **`column`** (39/46 — this is NOT the chart-internal `axis`/`series`/
  `column` styling trio ruled out below; see that item for why those
  three are a separate, already-decided question). This `column` is the
  classicReport/interactiveReport/interactiveGrid report-column
  definition (label, format, sort, link target) — the single most
  load-bearing construct in this batch after `process` itself, given
  `classicReport` alone is 35/46 and `interactiveReport` 29/46. Column
  label/format/link changes are precisely the "did the UI change" signal
  `apx-diff` exists to catch, and this project has already investigated
  column link-target shapes directly (`docs/grammar-assumptions.md`'s
  `column-link` findings) without yet promoting the column itself to a
  typed field. **Next step: `/parser`** — full `column`/`report-column-*`
  EBNF production check, typed field, diffing.
- **`action`** (14/46 — confirmed by prior investigation to be a
  genuinely distinct construct from the already-typed Dynamic-Action
  nested `action`: a stand-alone row-level action/link nested directly
  in a Cards/List/report region, e.g. `position: fullRowLink`, per the
  explicit "component type name `action` is OVERLOADED" note already in
  `docs/grammar-assumptions.md`). Real, not a duplicate of what's already
  typed, and has the same row-affordance diffing value as `column`.
  **Next step: `/parser`**, same production-check discipline, explicitly
  scoped to exclude the already-typed `dynamicAction`-nested `action`
  shape so the two don't collide.

#### Genuine individual consideration, DEFER — real signal, no forcing consumer yet

- **`facet`** (9/46 — exact count match with the `facetedSearch` region,
  9/46, which already has a **live-verified** runtime component
  (`ApexFacetsRegion`: facet counts, apply/clear, confirmed live). This
  is the one item in this whole sweep where a typed field would
  complement an *already-verified* runtime capability rather than sit
  ahead of an unbuilt one — the strongest case in this "defer" group, and
  worth revisiting soon rather than shelving indefinitely. Held out of
  "build now" only because, unlike `process`/`column`/`action`, nobody
  has yet named a concrete diff/coverage consumer for the facet
  *definition* itself (label, source) the way `apx-diff`'s existing
  identifier-keyed diffing already does for regions/items. Trigger to
  promote: the first time someone actually needs to diff a facet
  definition change, or `/apex` wants richer facet-definition metadata to
  drive `ApexFacetsRegion` assertions beyond counts.
- **`pageGroup`** (29/46 — common, and technically cheap: `page-groups.apx`
  is already inside `loadExport()`'s scope today, unlike the LOV
  definition file). But it's purely organizational (which folder a page
  sits under in the App Builder tree) — zero runtime relevance, and no
  concrete diff/coverage consumer has been named for "this page's group
  changed" the way one exists for `branch`'s unreachable-branch detection
  or `process`'s CRUD signal. Commonality alone doesn't clear this
  project's bar. Revisit if/when a navigation-graph-shaped consumer is
  actually being built (same trigger condition already on record for the
  `@apx/model` intermediate representation below) and page organization
  becomes real input to it.
- **`savedReport`** (29/46 — count tracks the classicReport/
  interactiveReport family closely, consistent with "most IR/classic
  reports ship a default saved view"). Plausible diffing value (a
  region's default sort/filter is a real behavior fact), but what
  `savedReport` actually contains hasn't been checked against the full
  EBNF production yet, and no consumer has asked for it. Don't build
  speculatively; revisit alongside `column` if/when `/parser` is already
  in that area of the grammar and can check the production cheaply as
  part of the same pass.

#### FAST-TRACKED — not worth it now (grouped, one-line disqualifier each)

- **`axis`, `series`** — already decided, not a new question. An earlier
  round explicitly investigated the `chart`-region's
  `chartAppearance`/`chartLayout` groups and found `axis`/`series`/
  `column` sub-components to be "font/color/position/scaling styling with
  no assertion value," a **documented, deliberate** scope decision
  (`docs/grammar-assumptions.md`, chart-region entry), not an oversight.
  These two names in the 17-type unmodeled set are that same
  already-rejected chart-styling construct resurfacing, not a fresh gap.
  Nothing new changes that verdict here.
- **`filter`, `layer`, `searchSource`, `parameter`** — each one's
  app-count matches, near-exactly, a region that is *itself* still
  unverified, rare, or feature-gated: `filter` (5/46) with `smartFilters`
  (5/46, "not verified"); `layer` (6/46) with `map` (6/46, "zero live
  ground truth," `MapRegion` stub); `searchSource` and `parameter` (3/46
  each) with the AI-gated `search` region (3/46, "gated on
  `CURRENT_AI_PROVIDER`, no dedicated component"). Typing any of these
  four now would be metadata for a runtime component that doesn't exist
  yet, sitting ahead of a parent region this project has already,
  correctly, left unbuilt for lack of ground truth — the same
  "infrastructure ahead of real ground truth" pattern the Analysis
  Engineer proposal was rejected for. Revisit each only when its parent
  region (`smartFilters`, `map`, `search`) itself gets picked up.
- **`columnGroup`** (3/46) — a genuinely rare, grouped-header variant of
  `column` (IG/IR column grouping). Too thin a base to justify its own
  effort; if/when `column` above gets built, check whether `columnGroup`
  rides along for free in the same EBNF production — don't scope
  separate work for it.
- **`metaTag`** (1/46, a single app — `apex-pwa-reference`'s PWA
  `<head>` metadata) — one occurrence in the entire 46-app corpus, purely
  descriptive page metadata with no runtime behavior and no diffing case
  anyone could make. Disqualified on rarity alone; revisit only if a
  second real app surfaces a genuine use.

#### Coverage-matrix cross-check — nothing new surfaces

Separately checked `docs/component-coverage-matrix.md`'s region-type and
item-type tables for "Not verified"/no-dedicated-component gaps outside
the 17-type unmodeled set (`checkbox`, `switch`, `radioGroup`, and
similar). All of these are **already tracked, existing runtime debt**,
not new Product Architect decisions — the matrix's own "Reading this
table" section already prioritizes the highest-value ones
(`classicReport`, `list`, `breadcrumb`, `regionDisplaySelector`,
`selectList`'s richer interactions, `dynamicContent`,
`plSqlDynamicContent`) as "common in the wild, genuinely worth closing
next," which is a Runtime & Test Automation Engineer / QA/Verification
Engineer queue question, not a fresh gap this pass needs to re-litigate.
Nothing outside the 17-type set surfaced as a missed item.

None of this changes the "zero ground truth" status of any runtime
component in `unsupported.ts` — this entire continuation, like the round
it extends, is a parser-layer scope decision only.

## Fifth round: Application Model, package boundaries, verifier, showcase app

A fifth round proposed a full architectural restructuring: an
`@apx/model` intermediate representation between parser and every
consumer, formal package boundaries built around it, canonical stable
IDs, version-as-data contracts, an `@apx/verifier` package, an
`@apx/recipes` package, dependency graphs (validation -> process ->
branch), a versioned compatibility suite, expanded Oracle sample-app
coverage, and a dedicated `apx-testkit-showcase` application. Same
evidence-first ledger as every prior round: what's already true (and in
two cases, superseded by events since the proposal was written), what's
buildable now, and what's still genuinely blocked.

### Already true, or overtaken by events since this was written

- **Stable IDs — already exists, not a gap.** The proposal asks for
  canonical `Page(3)` / `Region(employee)` / `Item(P3_ENAME)` /
  `Button(save)` identifiers that Coverage/Diff/Recipes/Navigation could
  all reference. This is precisely what `ApexPage.id`, `ApexRegion.
  identifier`, `ApexItem.identifier`, and `ApexButton.identifier` already
  are — and `packages/generator/src/diff.ts` (`diffByIdentifier`) and
  `packages/generator/src/coverage.ts` already key off exactly these
  fields for items and regions. The one real gap is narrower than "no
  stable IDs": buttons are matched by LABEL, not identifier, at the
  runtime/coverage layer specifically — because there is still no
  verified button static-id DOM convention (see CLAUDE.md Outstanding
  debt #1), not because the export-side identifier is missing or
  unstable. A stable-ID *system* wouldn't fix this; discovering the DOM
  convention would. Already tracked, not a new item.
- **Expand Oracle sample application coverage — already done, and
  exceeded.** The proposal names four apps (Sample Database Application,
  Sample Interactive Grids, Sample Reporting, UX Pattern Catalog). This
  project has since acquired and parsed real exports from fourteen: UX
  Pattern Catalog (live), Sample File Upload and Download (live), Sample
  Workflow/Approvals/Tasks, brookstrut (a Sample-Database-App-equivalent),
  Sample Interactive Grids (live), apextogo, image-support-rte,
  sample-application-search, sample-calendar, sample-cards,
  sample-charts, sample-collections, sample-master-detail, and
  sample-vector-search. All parsed and generated cleanly. This
  recommendation is satisfied several times over already — see "Second
  through thirteenth real exports" above.

### Buildable now, low-risk — not yet done

- **A synthetic multi-region-type parser fixture, extending
  `reference-fixtures`.** The proposal's "APX TestKit Showcase" (a 30-page app
  covering every item/region type) is NOT buildable as a real, running
  APEX application — this project has no App Builder or workspace access
  to author one (the same constraint disclosed in round 3's showcase-app
  discussion; nothing has changed). But a hand-written, synthetic `.apx`
  fixture covering more region/item type variety than the current
  one-region `reference-fixtures` IS buildable today, the same way `reference-fixtures`
  itself was written — pure parser/generator regression material, not a
  live-verifiable app. This would strengthen parser test coverage but
  would NOT let any new component graduate from stub to verified,
  since nothing about a hand-written fixture is live ground truth.

### Legitimate direction, not undertaken now (same reasoning as round 4, re-affirmed)

- **`@apx/model` intermediate representation.** The stated benefit is
  that Coverage/Diff/Docs/Mermaid/Navigation-graph/Recipes/AI-MCP would
  all consume one shared model instead of each touching the parser AST
  directly. Worth re-checking against current reality: Coverage and Diff
  *are* real, already-built consumers of the AST today (not hypothetical
  ones) — so the premise is less speculative than in round 4. But Docs,
  Mermaid, Navigation graph, Recipes, and AI/MCP integration still don't
  exist, and the two real consumers (`coverage.ts`, `diff.ts`) already
  work fine against the current `ApexPage`/`ApexRegion`/`ApexItem`/
  `ApexButton` types with zero duplication between them. Extracting a
  formal model now would mostly be a rename/relocation exercise for
  types that already serve their two real consumers correctly.
  Concrete trigger to revisit: when a third NEW consumer beyond
  generator/coverage/diff is actually being built (not just proposed),
  extract the shared model from the (by then) three-plus real call
  sites — don't design it from zero consumers' worth of requirements.
- **Formal package boundaries around the model.** Directly downstream of
  the item above — contingent on the model existing. Today's boundaries
  are already reasonably clean without it: `@apx/testkit` has zero
  dependency on `@apx/parser` (confirmed by its imports — genuinely
  "runtime only, never knows about parsing" already); `@apx/testgen`
  does parse exports directly today, which only becomes a problem once
  there's a model to bypass.
- **`@apx/verifier` package.** Same assessment as round 4, with one
  update: this session ran several more rounds of the same ad hoc
  verification method (Interactive Grid discovery, the checksum/
  navigation investigation) since that assessment was written, which
  means there's now more real precedent to generalize from than there
  was — but the irregularity discovered in the SAME session (custom auth
  schemes, checksum-protected navigation requiring real UI clicks
  instead of goto()) shows the design space is still actively growing,
  not settled. A verifier built today would need to already handle cases
  this project only just discovered exist. Still better scoped
  deliberately once the shape of "what varies between apps" stabilizes,
  not extracted reactively mid-discovery.
- **Version-as-data contracts (`contracts/26.1/`, `26.2/`, ...).** Same
  blocker as round 4: this project has only ever touched APEX 26.1.
  Nothing to version against yet.
- **`@apx/recipes` package.** Same assessment as rounds 1, 2, and 4:
  reasonable eventually, not urgent, and this project's own restraint
  principle (verify before generalizing) argues against building a
  recipe abstraction before there's more than one hand-written pattern
  to generalize from.
- **Dependency graphs (Page -> Validation -> Process -> Branch).** Needs
  a parser extension first, not an architecture change: validations,
  processes, and branches are NOT typed AST fields today — they land in
  `raw` bags and are tracked only as names in the `unmodeled` list (true
  across every export parsed so far, all fourteen of them). A dependency
  graph needs these as real, typed, cross-referenceable data before it
  can exist; that's parser work, and it's already the correction this
  project made to an earlier round's "Automatic CRUD Tests"/"category
  coverage" proposals for the identical reason.
- **Versioned compatibility suite as its own repo.** Overlaps directly
  with round 3's showcase-app recommendation and the "Full compatibility
  lab" item above — same real constraint (no App Builder/workspace
  access to author a live app; multiple APEX versions to compare don't
  exist for this project). Restated here because the proposal frames it
  as the single most essential next step; the constraint hasn't changed
  since round 3 said the same thing.

### On the explicit "what I would NOT do" note

The proposal's closing point — dial back from exposing a rich API for
every component immediately, keep verifying before generalizing — is
exactly this project's existing, load-bearing discipline (see
`unsupported.ts`'s entire design, the Cards `getRecords()`/`getModel()`
known-broken methods left visible rather than hidden, and every
"confirmed working" vs. "confirmed rejected" pairing in
docs/quirks/26.1.json). Nothing to change here; worth noting only because
it's confirmation the project's existing restraint is being recognized
as a strength, not a gap to fix.

## Sixth round: refinements, converged on the AST question

Following the fifth round's response, the maintainer refined several
positions after seeing the evidence above. Recorded here because the
refinements changed what actually got built this round, not just the
assessment:

- **Stable IDs withdrawn as a recommendation** — agreed it's already
  solved; the real remaining gap was correctly reframed as button
  *runtime discovery* (a locator problem: no verified static-id-to-DOM
  convention for buttons), not an identifier-stability problem. No code
  change needed — already tracked as CLAUDE.md Outstanding debt #1.
- **Oracle sample coverage** — agreed 14 apps is enough breadth; proposed
  a sharper metric instead (component-diversity per app, not raw app
  count). Built: `docs/component-coverage-matrix.md`, generated from all
  12 real static exports this project has, cross-referenced against live
  verification status per component. This is now the up-to-date answer
  to "where are the verification gaps" — regenerate it after adding new
  exports rather than re-deriving the question from scratch.
- **Application Model, reframed as a single question**: "is the AST
  intended to be the canonical semantic model?" Answered directly and
  documented: yes — see the new "Architecture: the AST is the canonical
  semantic model" section in CLAUDE.md, with the actual three-consumer
  data-flow diagram (generator, coverage, diff) and the package-boundary
  consequences that follow from that answer, without introducing a new
  `@apx/model` package.
- **Showcase app substitute renamed** — `packages/generator/test/fixtures/
  mini-export` is now `reference-fixtures`, communicating intentional
  compatibility-corpus fixture material rather than a toy example.
  Verified the rename didn't change generated output (byte-identical to
  the committed `examples/employee-page` output) before committing it.
- **Package boundaries softened to documentation-only** — agreed;
  addressed by the same CLAUDE.md architecture section above, no package
  split performed.

### Still not built, unchanged reasoning

`@apx/verifier` (runtime verification automation), generated (not
hand-written) capability matrices and per-component verification reports,
`@apx/recipes`, and structured verification-provenance metadata (the
`{component, method, verifiedAgainst, apexVersions, confidence,
publicApi}` shape proposed) are all still legitimate, still not urgent by
this project's own bar. The provenance idea specifically is worth flagging
as the cheapest of the four to eventually do — much of what it asks for
already exists as prose in docs/quirks/26.1.json's `reproducedAgainst`/
`status`/`rootCauseDiagnosed` fields; formalizing it would be closer to a
schema migration of that existing file than new infrastructure. Not done
this round because it wasn't asked for outright, and reshaping a file this
project depends on for accurate history deserves its own deliberate pass,
not a rushed addition alongside four other changes.

## Eighth round (2026-08-01): fresh state-of-the-project triage, post generator-auto-assertion-wiring

Prompted directly by the maintainer: what's genuinely left, checked fresh
against the current docs rather than re-stated from memory. This session
shipped the "Continuation" pass's `process`/`computation`/`column`/`action`
typed AST fields (commit `9792cf6`), the `branch`/`validation`/`lov` fields
from the Seventh round (`8b10b52`), two drift-detection regression tests
guarding both against silently going stale again (`2847272`:
`diff-field-coverage.test.ts` — every typed AST field now automatically
gets an `apx-diff` assertion; `coverage-unsupported-sync.test.ts` — the
untrackable-region-types set and `unsupported.ts`'s stub set can no longer
silently drift apart), and ESLint + branch protection (`ea19d7c`). Every
item on the maintainer's own "known open threads" list was re-verified
against current docs rather than assumed still accurate — three had
shifted since being written down.

### Re-verified against current docs — corrections where the picture changed

1. **Generator auto-assertion gap for `branch`/`validation`/`process`/
   `computation`/`column`/`action`/`lov` — NOT ONE UNIFORM GAP, splits
   three ways on inspection.** `branch`/`process`/`computation` have zero
   client-JS hook (already decided, unchanged) — and checked freshly this
   round: the only assertion shape an auto-generated test *could* take for
   any of the three ("which branch/process fired," "what value the
   computation set") is inherently data-dependent (which branch fires
   depends on a runtime condition against live data; which DML a process
   performs depends on session state) — squarely inside this project's own
   **permanent, by-design** "data-dependent assertions are out of scope"
   rule (`docs/limitations.md` Generator section, `README.md` Architecture
   section). This is not an oversight sitting in a backlog — it's a
   correctly-absent auto-assertion, same category as "the generator has no
   way to know what data your instance holds." **Not worth building, ever,
   for these three specifically** — different from Tier 3's "blocked
   pending ground truth," this is "blocked pending a kind of ground truth
   (live user data) the generator is explicitly designed never to depend
   on." `lov`'s reference field has the same "nothing real to assert
   against yet" shape (LOV values are out of scope — see #3 below), so it
   sits in the same bucket for a different reason. That leaves **`column`
   and `action`** as the only two of the seven with a *plausible* real
   DOM-observable contract nobody has actually checked — see "build now"
   below.
2. **`validation` — confirmed still blocked on credentials, unchanged.**
   Re-read the 2026-07-27/28 follow-up in full: the blocker is exactly as
   recorded (zero credential values in this environment; an AI agent does
   not type passwords into login forms under any instruction). Nothing
   about this has resolved itself since — it cannot resolve itself without
   a human or a differently-privileged session supplying real login
   access. Tracked separately below, distinctly from "not worth it."
3. **LOV values out of scope — confirmed unchanged.** No new consumer has
   asked for `shared-components/lovs.apx` resolution since the Seventh
   round's decision; still correctly deferred, not rejected.
4. **Calendar and Map — confirmed unchanged: real static ground truth,
   zero live verification, correct stubs.** `calendarSettings`/
   `chartSettings`-equivalent typing already exists for Calendar
   (`ApexRegion.calendarSettings`); Map still has no typed settings at all
   (falls to `raw` — nobody has type-checked the `map`-region EBNF
   production yet, a smaller, cheaper parser-only task nobody has actually
   asked `/parser` to do). Both runtime stubs are correctly unbuilt. This
   is an access blocker (a live `sample-calendar`/`sample-maps`-equivalent
   URL), not a worth-it question — this doc's own Tier 1 sequencing note
   already calls `sample-calendar` the highest-leverage open
   live-verification target in the project "by a wide margin" if a URL
   ever surfaces. Unchanged this round.
5. **Interactive Report generic-only — confirmed unchanged, and still a
   permanent constraint for the JS-API path specifically** (private
   `_`-prefixed internals, `docs/quirks/26.1.json`
   `interactive-report-private-methods`). What's still open and was
   correctly flagged as a *different, unverified* path in an earlier
   round: driving the actual visible UI (fill the search input, click a
   sort header) via accessible locators instead of a JS API call. Given
   `interactiveReport` sits at 29/46 apps — one of the highest app-counts
   of any unverified-for-interaction region type — this is worth a real
   discovery pass now rather than staying open indefinitely on the
   strength of the app count alone. See "build now" below.
6. **Region/button DOM identifier convention "still open" — PARTIALLY
   STALE, needs correcting in place, not just re-affirming.** Checked the
   actual current state rather than the phrase: the **region** side of
   this has substantially moved since the phrase was last written —
   `ApexRegion.htmlDomId` (ADR-003) now deterministically resolves the
   runtime static id whenever the export sets it, live-confirmed on
   Interactive Grid/Chart/Interactive Report and statically confirmed
   present across 27+ region types in real export data (see
   `docs/quirks/26.1.json` `region-id-not-static-id`). The remaining open
   part is narrower than "region convention unknown" — it's specifically
   "what's the id when `htmlDomId` is absent," which is genuinely
   undiscoverable from static data alone (APEX-internal auto-generated
   numeric id), not a parser gap waiting to be closed. The **button**
   side, by contrast, has had **zero progress** — CLAUDE.md's "Outstanding
   debts #1" is unchanged from the very first version of this project:
   `button.ts` still sidesteps static ids entirely via accessible-role/
   label locators, and the `REGION DISCOVERY`/`BUTTON DISCOVERY` console
   capture this debt has asked for since M1 has still never been done.
   Correcting the roadmap's own language: this is now two separable
   questions at very different levels of resolution, not one open item —
   button-id discovery is now the older and more neglected of the two.
7. **`facet`/`pageGroup`/`savedReport` deferred pending a real consumer —
   confirmed unchanged.** No new consumer has appeared for any of the
   three since the Continuation round.
8. **Tree-as-content — the 3-genuine-content-region finding is real, but
   it's not new to this pass; the "only one non-representative instance"
   objection was ALREADY retired**, visibly, in
   `docs/component-coverage-matrix.md`'s `tree` row ("Corrected in an
   earlier round... Tree IS a real, distinct content pattern"). What this
   pass adds is checking whether that correction actually changes the
   build verdict — it doesn't, for a different reason than the one
   originally given. The old objection ("Tree isn't even real as content")
   is gone. The bar Tree still fails is **rarity**: 4/46 apps total is the
   same thin-evidence class this project already disqualified
   `columnGroup` (3/46) and `metaTag` (1/46) on in the Continuation round
   — "too thin a base to justify its own effort," applied consistently.
   Runtime support additionally still has zero live ground truth
   (Tier 3, unchanged). **Verdict unchanged (defer), reasoning corrected**:
   not "doesn't exist," but "real, confirmed, still too rare relative to
   this project's own bar for the other 15 types triaged in the same
   pass."
9. **Snapshot testing — confirmed unchanged.** Still Tier 2, still needs a
   masking-policy design nobody has scoped, not touched this session.
10. **M4 second user — confirmed unchanged.** Still open, still not
    something engineering work alone produces.

### A real gap this pass surfaced that wasn't on the seed list: doc drift

`docs/support-matrix.md` (line 15, "`@apx/testkit` region.ts against
Chart" row) still states the ORIGINAL, since-corrected claim —
"`apex.region(id).widget()` confirmed to return `null` for charts" —
directly contradicting `docs/quirks/26.1.json`'s corrected
`chart-region-widget-returns-null` entry and this doc's own
Chart-graduation entry above, both of which now correctly say the
opposite (`widget()` returns a real element; `ApexChartRegion` exists and
depends on it). This is exactly the "update documentation together, not
piecemeal" failure `DESIGN_GUARDRAILS.md` names as a repeat offender —
caught here, not fixed here (accuracy upkeep is Documentation & DX
Engineer's job per this project's own division of labor, not a Product
Architect scope decision). Flagged for that agent to correct in the same
spirit as every other "update together" fix in this project's history.

### Prioritized build-now list

1. **Column/Action live-discovery pass** (Runtime & Test Automation
   Engineer, then QA/Verification Engineer to verify). `column` is 39/46
   apps — the single most load-bearing untyped-for-runtime construct left
   after this session's parser work — and `action`'s parent regions
   (Cards/List) are common enough (`cards` 12/46, `list` 29/46) to be
   worth checking against the one live app already reachable without
   credentials (UX Pattern Catalog). Check for a real, documented,
   non-guessed DOM/API contract for column headers and row-level
   action/link rendering before deciding runtime-component-or-not — per
   ADR-002, this is a verification step, not a build commitment yet.
2. **Interactive Report UI-locator-driven interaction discovery pass**
   (Runtime & Test Automation Engineer). Not a retry of the already-closed
   "does IR have a public JS API" question (confirmed no, permanently) —
   a genuinely different question: can `report.search()`/`.sort()` be
   built safely on accessible locators (fill the visible search box, click
   a sort header) against the live, already-reachable UX Pattern Catalog
   app. High app-count (29/46) justifies spending a discovery pass now.
3. **Button DOM identifier discovery** (Runtime & Test Automation
   Engineer). Re-prioritized above where it's implicitly sat since M1: the
   region side of this exact question is now substantially resolved via
   `htmlDomId`, which makes the button side's total lack of progress more
   conspicuous, not less relevant. Capture the `REGION DISCOVERY`/
   `BUTTON DISCOVERY` console output CLAUDE.md's debt #1 has asked for
   since the beginning of this project.
4. **Checkbox item-type live verification** (QA/Verification Engineer).
   Carried over, unchanged status, still not done: 26/46 apps, not
   stubbed, plausible same-mechanism verification as the six already-
   verified item types (`apex.item()` round-trip). Cheapest real item on
   this list — no new app needed, no new mechanism to discover, just
   execution.
5. **`docs/support-matrix.md` chart-widget correction** (Documentation
   & DX Engineer). Not a build item — a factual-accuracy fix, flagged
   above, routed to the agent who owns day-to-day doc accuracy.

### Blocked-on-access (distinct from not-worth-it — needs a resource, not a design decision)

- **`validation` runtime verification** — blocked on real login
  credentials for Sample Interactive Grids page 31. Concrete reproduction
  target already recorded (clear the `ENAME` cell in the `emp` grid, save,
  compare `#APEX_ERROR_MESSAGE` vs. the grid's own error UI). Needs a
  human, or a session with legitimate credential access, to run
  `spike/tests/interactive-grid-demo.spec.ts`'s pattern extended to page
  31 — not more design work.
- **Calendar/Map runtime verification** — blocked on a live URL for
  `sample-calendar`/`sample-maps` or any app with either component
  reachable live. Static ground truth is already more than sufficient to
  start from the moment access exists.

### Defer — real signal, no forcing consumer yet (unchanged or corrected-but-same-verdict)

- `facet` definition typing, `pageGroup`, `savedReport` — unchanged, no
  consumer named yet.
- LOV value resolution (`shared-components/lovs.apx`) — unchanged, out of
  `loadExport()`'s scope, no consumer.
- Tree-as-content (parser typing and runtime) — reasoning corrected (see
  #8 above), verdict unchanged: real, confirmed, still too rare (4/46) to
  clear this project's own consistency bar, and zero live ground truth for
  runtime regardless.
- Snapshot testing — needs a masking-policy design first, still unscoped.

### Not-worth-it (reaffirmed this round, not new)

- Generator auto-assertions for `branch`/`process`/`computation` — the
  only possible assertion shape for each is inherently data-dependent,
  which this project has permanently ruled out by design. This is a
  correct absence, not a backlog item — see #1 above.

### Build-now list, results (Runtime & Test Automation Engineer, 2026-08-01)

Credentials check first: `APX_LOGIN_TEST_USERNAME`/`APX_LOGIN_TEST_PASSWORD`
were **unset** in this environment — Sample Interactive Grids and Sample
Charts (the two live apps needing login) were not reachable this pass.
Everything below was done against UX Pattern Catalog, the one live app
reachable without login. This is a credentials gap, not a design decision
— re-run `validation` runtime verification (still separately blocked, see
above) and any future login-gated pass the moment real credentials are
available.

1. **Column live-discovery — REAL CAPABILITY, BUILT, with a genuine
   generator-wiring near-miss caught and reverted.**
   `packages/testkit/src/components/report-column.ts` (new). Confirmed
   live on TWO region types: `classicReport` (`item-detail-full`,
   `child-records` region) and `interactiveReport`
   (`browse-interactive-report`). Two genuinely different DOM-id contracts
   confirmed, not one:
   - `classicReport`: a column's `<th>` id equals the `.apx` column's
     `identifier` VERBATIM, no override needed — a column-level extension
     of ADR-003's region-level `htmlDomId` finding, and a stronger one
     (works for every column checked with no special-case field at all).
     `classicReportColumnById()` wraps this, scoped around a real,
     confirmed sticky-header-widget duplicate-id issue (APEX's
     `stickyTableHeader` clone reuses the SAME `<th>` id as the real
     column, causing a Playwright strict-mode violation on a naive `#id`
     locator — fixed by scoping to `table[id$="_orig"]`).
   - `interactiveReport`: a column's `<th>` id is an APEX-internal
     auto-generated numeric id (`C<numeric>`) with no corresponding field
     anywhere in the static export — confirmed genuinely undiscoverable,
     the column-level analog of region's `htmlDomId`-absent "layer 3"
     case.
   - `reportColumnHeader()`/`expectReportColumnHeadersPresent()`
     (accessible `columnheader` role, keyed by heading TEXT) work
     identically on both region types and don't need the DOM id at all.
   - **A generator auto-assertion (`expectReportColumnHeadersPresent()`
     wired into every generated page's smoke spec, keyed off
     `ApexReportColumn.heading`) was built, then CAUGHT AND REVERTED**
     before being committed: live-testing the generated output against
     the real `browse-interactive-report` page found that 2 of its 14
     declared column headings (`DESCRIPTION`, `ICON` — both non-hidden
     types) do NOT get their own `columnheader` element at runtime; their
     content is folded into the `Title` column's own cell instead (a real
     Interactive Report "primary column group" rendering pattern,
     confirmed live, with no equivalent in classicReport's simpler
     per-column model). Auto-generating this assertion from
     `heading.heading` alone would have shipped a smoke test guaranteed
     to fail on real data — caught before commit, not after. See
     docs/quirks/26.1.json `interactive-report-column-heading-not-always-
     own-header`. The hand-driven testkit functions are unaffected and
     shipped — the gap is specifically in auto-deriving the full heading
     list from static metadata for `interactiveReport`.
   - Sort capability (see #3) lives in `interactive-report.ts`, not here
     — `classicReport` columns confirmed to carry NO sort affordance at
     all (no `<a>`, no `aria-sort`), a real structural difference, not a
     gap.
2. **Region action (Cards/List row-level action) live-discovery — REAL
   CAPABILITY (presence only), CONFIRMED DEAD END (click effects).**
   `packages/testkit/src/components/region-action.ts` (new). Confirmed
   live against Cards (`faceted-search-cards`) and List
   (`faceted-search-content-row`). Cards' `action-d` shape renders as a
   real accessible `link`, name = the action's label — but NOT unique per
   region (the same label repeats once per record, no confirmed way to
   scope to a specific record from `.apx` metadata alone). List's
   `action-e` shape is confirmed STRUCTURALLY DIFFERENT — actions render
   behind a single "Row Actions" menu-trigger button per row, not as
   direct same-labeled elements — deliberately not wrapped this pass.
   Click-through EFFECTS are a confirmed dead end on this app: every
   action tested (Cards' `Edit` link, a Cards title link, List's `Row
   Action 1`/`2`/`3` menu items) has no real `href`/target and produces
   zero observable effect (no navigation, no network activity, no console
   output) — this app ships decorative, non-functional demo affordances
   for this component family specifically (contrast: Interactive Report's
   structurally similar `Primary Row Action` link, on the SAME app, DOES
   navigate for real). No click-effect assertion is shipped as a result —
   presence only (`regionActionLocator()`/`expectRegionActionPresent()`).
   See docs/quirks/26.1.json `region-action-cards-not-unique-inert`.
3. **Interactive Report accessible-locator discovery — REAL CAPABILITY,
   BUILT.** `packages/testkit/src/components/interactive-report.ts`
   (new). Does NOT re-litigate the closed "no public JS API" question
   (`docs/quirks/26.1.json` `interactive-report-private-methods`,
   corrected in place to point at this new entry) — drives the same
   features through the visible UI instead. Search
   (`searchInteractiveReport()`): confirmed live, a real `QUICK_FILTER`
   AJAX action + `apexbeforerefresh`/`apexafterrefresh` event pair (same
   lifecycle-event pattern already established for Facets). Real semantic
   quirk documented: an unquoted multi-word term matches ANY word (OR) —
   confirmed live, `Item 2` unquoted matched all 48 rows because "Item"
   alone appears everywhere; the quoted form (`"Item 2"`) correctly
   narrowed to 11. Sort (`sortReportColumn()`/`getColumnSortState()`):
   confirmed live on 3 independent columns (Title/Category/Priority),
   `aria-sort` updates correctly both directions. A real, reproducible DOM
   quirk requires `{ force: true }` on the header-link click every time:
   APEX's own `stickyTableHeader` widget renders an always-present,
   exactly-overlapping visual clone of the header row (confirmed via
   `getBoundingClientRect()`, no scroll needed to reproduce) that fails
   Playwright's actionability check but correctly forwards clicks to the
   same handler when forced. Pagination: only PARTIALLY confirmed — a real
   accessible `region` (`aria-label="Pagination"`) with a range label
   exists, but the only live dataset available (48 rows) fits on one page,
   so next/prev click behavior was never observed; no pagination wrapper
   shipped as a result, an honest open gap, not a guess. See
   docs/quirks/26.1.json `interactive-report-accessible-locator-search-
   sort`.
4. **Button DOM identifier discovery — CONFIRMED DEAD END (extends
   ADR-003 to buttons, finds it unset everywhere).** `ApexButton.htmlDomId`
   typed (`packages/parser/src/ast.ts`), wired into `apx-diff`, 2 new
   parser tests. The official EBNF confirms `button.advanced.htmlDomId`/
   `staticId` exist — the SAME `advanced`-group mechanism ADR-003 already
   established for regions, structurally, not by naming coincidence. But:
   a full grep of the ENTIRE local corpus (46+ real exports, every page of
   UX Pattern Catalog specifically checked) found ZERO buttons anywhere
   that set either field. Live-confirmed (3 pages, UX Pattern Catalog):
   when absent, the runtime DOM id is an APEX-internal `B<numeric>` id
   (e.g. `B9442031345426189`), structurally identical to region's
   `R<numeric>` fallback, undiscoverable from export data. `button.ts`'s
   accessible-role/label locator strategy is UNCHANGED — there is no
   positive (htmlDomId-set) example anywhere in this project's corpus to
   verify a resolution convention against (ADR-002), so none was built.
   The `REGION DISCOVERY`/`BUTTON DISCOVERY` console-capture debt
   CLAUDE.md has asked for since M1 is now effectively answered for
   buttons: the region side already resolved via `htmlDomId`; the button
   side resolves to "the mechanism is real and identical, but unused in
   every real button this project has ever seen" — a confirmed, not
   merely neglected, dead end. See docs/quirks/26.1.json
   `button-id-not-static-id`.

All four: live spike specs added (`spike/tests/report-column-demo.spec.ts`,
`region-action-demo.spec.ts`, `interactive-report-demo.spec.ts`,
`button-htmldomid-demo.spec.ts`), run twice against the real live app,
14/14 passing both times (no login required, public app). Full regression
sweep (build, test, spike typecheck, determinism against
`examples/employee-page`, zero-warnings parse of the full local UX Pattern
Catalog export, `npm run lint`) — all clean. `docs/component-coverage-
matrix.md`, `docs/support-matrix.md`, and `README.md`'s capability matrix
updated together for all four; `docs/tutorial.md` not extended this round
(no new numbered walkthrough section — these are targeted capability
additions to existing region-type coverage, not a new top-level
component the tutorial's structure calls for its own section on; flagged
for Documentation & DX Engineer to confirm rather than assumed).
