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
  at all (currently `interactiveGrid`) are now reported in a separate
  "untrackable" bucket rather than counted as "untouched" — conflating the
  two would misrepresent "nobody tested this" as indistinguishable from
  "this can't be tracked yet." Verified against a synthetic fixture with a
  mixed form + interactiveGrid page.
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

## Tier 2 — real ground truth exists, but needs care

- **Charts.** Present and confirmed live (Oracle JET, SVG-rendered) — but
  chart container DOM ids are JET-generated hashes
  (`chart1000639411058$cp5`), NOT the `.apx` static id, unlike pageItems.
  Any chart API must go through `apex.region(id).widget()`-level calls
  (data refresh, series inspection via the documented JET/APEX chart API),
  never a DOM id assumption. Needs its own short discovery pass to confirm
  exactly what the widget API exposes before writing `chart.ts`.
- **Snapshot testing for regions and pages.** Feasible (Playwright has
  built-in screenshot/snapshot assertions), but needs a design decision
  first: APEX pages often render live/seeded data, so a naive
  pixel/DOM-tree snapshot will be flaky by default. Needs a policy for what
  gets masked/excluded (timestamps, generated ids, chart data) before it's
  useful rather than noisy.

## Tier 3 — blocked without new ground truth, or genuinely novel

- **Interactive Grid.** NOT present anywhere in the one live app available
  to this project. Oracle does publicly document the `interactiveGrid`
  widget JS API (`apex.region(id).widget().interactiveGrid(...)`), so a
  wrapper COULD be written from documentation alone the way the parser's
  grammar was — but per this project's own M0 lesson, that's exactly the
  kind of docs-only assumption that turned out wrong in places once checked
  against a real app. Do not ship an `ig.ts` claiming verified behavior
  without a live app that actually has an Interactive Grid region to check
  it against.
- **Trees as a content/data-display pattern.** The only Tree widget in the
  one available app is the universal left-nav (`a-TreeView` inside the nav
  chrome) — not a page-content region. No ground truth exists here for
  "Tree region" as the plan envisions it (e.g. a hierarchical data browser).

## Sequencing note

Given the current state (M3 engineering-complete, M4 launch-prep done,
still short a second real user and a second real export), Tier 1 items are
the highest-leverage next work: they extend `@apx/testkit`'s existing
verified-primitive pattern into more of what the one available app can
actually prove, without waiting on external dependencies. Tier 3 items
should stay on this ledger, unbuilt, until either a new export with
Interactive Grid/Tree content or a design spike resolves what "coverage"
means here — building them earlier risks the exact kind of confident-wrong
assumption this project has structured itself to avoid.

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
