# Runtime (`packages/testkit`, `@apx/testkit`)

Note: earlier drafts of this governance structure assumed a
`packages/runtime` separate from the parser. That package does not exist
in this repo — runtime wrappers and Playwright fixtures both live in
`packages/testkit`. This file, and the `runtime-test-automation-engineer`
subagent (which owns both this package and `packages/generator`), are
scoped to the real layout.

## What it does

Playwright fixtures + component wrappers for APEX 26.1+ apps, used by
both generated code (`@apx/testgen`) and hand-written specs (`spike/`) —
see the "treadmill rule" in `.ai/knowledge/architecture.md`. Every
capability here is live-verified per ADR-002 — nothing is exposed on
documentation alone.

## Components (`src/components/`)

- `region.ts` — `ApexRegion`, the generic wrapper. Verified methods:
  `refresh`, `getSessionState`, `getCurrentRecordId`/`setCurrentRecordId`,
  `getRecordValues`/`setRecordValues`, `getSelectedValues`/
  `setSelectedValues`, `focus`, `getViewName` (Interactive Report only).
  All dispatch through `apex.region(id)[method]()` directly —
  `apex.region(id).call(action)` was tested and rejected for this widget
  family ("Call not supported").
- `cards.ts` — `ApexCardsRegion`. `getRecords()`/`getModel()` are
  confirmed **broken** at runtime (throw a `TypeError`) — use
  `getPageInfo()`/`getSelectedRecords()`/`setSelectedRecords()` instead.
- `faceted-search.ts` — `ApexFacetsRegion`.
- `interactive-grid.ts` — `ApexInteractiveGridRegion`. Dispatches through
  `apex.region(id).widget().interactiveGrid(method)` (jQuery UI
  widget-factory pattern), NOT the direct `region[method]()` shape.
  Confirmed working: `getActions`, `getViews`, `getCurrentView`,
  `getCurrentViewId`, `getSelectedRecords`. Confirmed rejected: `model`,
  `view`, `getRegion`.
- `chart.ts` — `ApexChartRegion`. Same widget-factory pattern via
  `.ojChart(method, ...)`. Confirmed working: the standard `option`
  getter/setter (`getOption()`/`getOption(key)`/`setOption(key, value)`).
  Confirmed rejected: `getProperty`, `getOption` (as literal method
  names — not to be confused with the wrapper's own `getOption()`, which
  calls the real `option` method under the hood). `refresh()` is
  inherited from `ApexRegion`, unchanged. Has a documented
  initialization race: JET attaches `ojChart` asynchronously, after
  `domcontentloaded` — wait for
  `apex.region(id)?.widget?.()?.ojChart` to be a function before
  constructing this class or calling its methods.
- `item.ts` — `ApexItem`, `itemsPresent`/`expectItemsPresent`,
  `getItemValue`/`setItemValue`, `itemRoundTrip`. Verified for
  textField/textarea/numberField/selectList/datePicker/hidden.
- `button.ts` — `buttonByLabel`/`clickButton`. Label-based (accessible
  role/text), not identifier-based — no verified button-id convention
  exists yet.
- `messages.ts` — `successMessage`/`errorMessage`/`expectSuccess`/
  `expectError`/`expectNoErrors`/`expectNoSuccessMessage`. Real bug found
  here: Playwright's `toBeVisible()`/`toBeHidden()` are unsafe against
  APEX's message elements (rendered height stuck at `0px` in some
  trigger paths even with the visibility class applied) — see
  `docs/quirks/26.1.json`.
- `unsupported.ts` — `UnsupportedComponentError` + explicit stub
  factories for everything NOT yet built: `TreeRegion`, `Calendar`,
  `MapRegion`, `Switch`, `RadioGroup`, `PopupLov`, `RichText`,
  `FileBrowse`, `Shuttle`, `triggerDynamicAction`. Each stub's reason
  string is specific and current — "no live ground truth yet," not
  "TODO." **The contract**: if a component isn't here and isn't a real
  class elsewhere in `components/`, it doesn't exist. A component
  graduates from here to a real class only per ADR-002.

## Fixtures (`src/fixtures/`)

- `auth.ts` — `login`/`loginAndSaveState`. Had a real race condition
  (checked `page.url()` once immediately after `domcontentloaded` instead
  of waiting for an actual URL change) — fixed with `page.waitForURL`.
- `lifecycle.ts` — `callRegionMethodAndWaitForEvent`/
  `waitForRegionEvent`, tied to APEX's real `apexbeforerefresh`/
  `apexafterrefresh` jQuery custom events (confirmed live, not native DOM
  events — `apex.jQuery`, never a bare global `$`).
- `console-guard.ts` — `armConsoleGuard`, auto-armed by the custom `test`
  export from `src/index.ts`.
- `session.ts` — `apexPageUrl`/`gotoApexPage`/`normalizeTitle`.
- `coverage.ts` — `recordCoverageTouch`, the opt-in touch recorder read
  by `@apx/testgen`'s `coverage.ts` report generator (a different file,
  same name, different package — don't confuse the two).

## Runtime static id caveat — read `ApexRegion.htmlDomId` first

See ADR-003. Before constructing `ApexInteractiveGridRegion` or
`ApexChartRegion` by hand, check whether the parsed `ApexRegion.htmlDomId`
is set — if so, `<htmlDomId>_ig`/`<htmlDomId>_jet` IS the runtime id, no
live DOM inspection needed. If `htmlDomId` is null, the runtime id must be
discovered live; there is no way to predict it from the export.

## Adding a runtime capability — see `.ai/checklists/runtime-api.md`
