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
- **Charts — partially DONE, live-verified.** Fourth real APEX app
  (Oracle's own "Sample Charts" gallery) gave this project its first
  LIVE Chart ground truth. Two findings: (1) region identifier != runtime
  static id, confirmed a SECOND time on an independent widget type
  (export: `area-chart-color-javascript-code-customization`, runtime:
  `area1`) — broadens the Interactive-Grid-only finding above to
  "confirmed on two widget types." (2) `apex.region(id).widget()` returns
  `null` for chart regions — a real structural difference from
  Interactive Grid/Cards/IR. The actual widget-factory plugin is
  `ojChart`, attached to the JET container element directly (id
  convention `<static id>_jet`), not reachable through `region.widget()`.
  Confirmed callable: `refresh`, `getContextByNode` (returns `null` with
  no args). Confirmed NOT valid method names: `getProperty`, `getOption`.
  Most valuable result: the EXISTING generic `ApexRegion` class already
  works for `refresh()` against chart regions — `new ApexRegion(page,
  'area1').refresh()`, verified live 3/3 runs via
  `spike/tests/chart-demo.spec.ts` — zero new component code needed for
  that. No dedicated `ApexChartRegion` was built: the two confirmed
  `ojChart` methods weren't compelling enough alone to justify one, per
  this project's restraint principle. See docs/quirks/26.1.json for the
  full investigation.
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
  at all (`interactiveGrid`, `tree`, `calendar`, `chart`, `map` — kept in
  sync with the region-shaped stubs in
  `packages/testkit/src/components/unsupported.ts`) are now reported in a
  separate "untrackable" bucket rather than counted as "untouched" —
  conflating the two would misrepresent "nobody tested this" as
  indistinguishable from "this can't be tracked yet." Verified against a
  synthetic fixture with a mixed form + interactiveGrid page, and against
  real exports (see "Second, third, and fourth real exports" below) whose
  `tree`/`chart`/`calendar`/`interactiveGrid` regions correctly fell into
  the untrackable bucket instead of misreporting as untouched-but-trackable.
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
any region type in any single export this project has seen). Both remain
`UnsupportedComponentError` stubs — this is static confirmation the types
are real and common, not live method-level verification, which needs a
running instance neither Chart nor Calendar has had (unlike Interactive
Grid, which got exactly this kind of live access — see the Tier 1 entry
above — and graduated to a real component as a direct result). `map` also
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
apps) dwarfs everything else still sitting in Tier 2/3.

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
flagged untrackable. Fixed and verified against both exports. Separately,
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
  Dynamic Actions/processes): "something changed here, go look," not "the
  LOV changed," which this project cannot back up yet (see the parser-
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
- **Category-level coverage (Processes, Dynamic Actions).** The existing
  coverage report (items/regions/buttons) can't extend to processes or
  Dynamic Actions until those are typed AST fields — currently `process`
  and `dynamicAction` both sit in the generator's own `unmodeled` backlog
  (see CLAUDE.md).
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
  `mini-export`.** The proposal's "APX TestKit Showcase" (a 30-page app
  covering every item/region type) is NOT buildable as a real, running
  APEX application — this project has no App Builder or workspace access
  to author one (the same constraint disclosed in round 3's showcase-app
  discussion; nothing has changed). But a hand-written, synthetic `.apx`
  fixture covering more region/item type variety than the current
  one-region `mini-export` IS buildable today, the same way `mini-export`
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
