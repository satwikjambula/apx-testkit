# apx-testkit

[![CI](https://github.com/satwikjambula/apx-testkit/actions/workflows/ci.yml/badge.svg)](https://github.com/satwikjambula/apx-testkit/actions/workflows/ci.yml)
[![License: Apache 2.0](https://img.shields.io/badge/License-Apache%202.0-blue.svg)](LICENSE)
[![Node](https://img.shields.io/badge/node-22-brightgreen.svg)](package.json)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.5%2B-blue.svg)](tsconfig.base.json)

**End-to-end Playwright testing for Oracle APEX — built for humans and AI
agents (Cursor, Claude Code, Copilot) alike, via MCP.**

If apx-testkit saves you from hand-writing Playwright specs for Oracle
APEX, **star the repo** ⭐ — it's the easiest way to help others find it.

![apx-testgen turning a .apx export into a typed page object + spec, in one command](docs/demo.gif)

Real terminal recording — `apx-testgen` against the committed synthetic
fixture, nothing staged. Regenerate it yourself from `docs/demo.tape` with
[VHS](https://github.com/charmbracelet/vhs) (`vhs docs/demo.tape`).

![a testkit-driven Playwright spec typing into a real Interactive Report search box and sorting a column against a live Oracle APEX app](docs/browser-demo.gif)

Real browser recording — apx-testkit-generated assertions driving
Playwright against a live Oracle APEX app, nothing staged. Regeneration
steps (a real Playwright video capture converted with ffmpeg) are
documented in [`docs/browser-demo.md`](docs/browser-demo.md).

## Quick Start

```bash
git clone https://github.com/satwikjambula/apx-testkit.git
cd apx-testkit
npm install   # required even if you only use the CLI — @apx/testkit is a
              # real runtime dependency of generated specs, not just a
              # type-checking convenience
(cd packages/parser && npx tsc -p tsconfig.json)
(cd packages/testkit && npx tsc -p tsconfig.json)
(cd packages/generator && npx tsc -p tsconfig.json)
node packages/generator/dist/cli.js packages/generator/test/fixtures/reference-fixtures --out /tmp/my-first-tests
```

That last command runs the generator against this project's own
committed, real (minimal, one-page) APEXlang export fixture and writes a
typed page object + a smoke spec. See "Example output" below for exactly
what comes out, or open `examples/employee-page/` — the byte-identical
committed result of this same command.

Full walkthrough — wiring the output into a runnable Playwright project,
pointing it at your own app's export, handing it to someone else to run —
is in [`docs/tutorial.md`](docs/tutorial.md#1-getting-started); every
command in it was verified fresh from a clean clone.

## Example output

Given a page in an APEXlang export:

```
page 3 (
  name: Employee
  alias: EMPLOYEE
  region employee (
    pageItem P3_ENAME ( type: textField label: Name required: true )
    button save ( label: Save action: submit )
  )
)
```

Running:

```
node packages/generator/dist/cli.js <export-dir> --out <tests-dir>
```

produces a typed page object —

```ts
export class EmployeePage {
  static readonly alias = 'employee';
  constructor(private readonly page: Page) {}
  async goto(): Promise<string[]> { return gotoApexPage(this.page, this.url()); }
  get ename(): ApexItem { return new ApexItem(this.page, 'P3_ENAME', 3); }
  async clickSave(): Promise<void> {
    await clickButton(this.page, 'Save', { pageId: 3, identifier: 'save' });
  }
}
```

— and a smoke spec that exercises it, never talking to `@apx/testkit`
directly:

```ts
test('apex.item round-trip on P3_ENAME', async ({ page }) => {
  const po = new EmployeePage(page);
  await po.goto();
  await po.ename.setValue('apx-testgen');
  expect(await po.ename.getValue()).toBe('apx-testgen');
});
```

The full, real output this produces (generated from a committed fixture,
nothing hand-edited) is in `examples/employee-page/`. Regenerate every time
the `.apx` changes and review both diffs — the `.apx` diff and the
regenerated-test diff — side by side in the same PR.

## Why it exists

Testing an Oracle APEX app usually means hand-writing a Playwright spec
for every page — repetitive work nobody wants to do first — or shipping
with zero automated answer to "does every page still load, do the fields
round-trip, are the buttons still there." apx-testkit generates that
answer from data you already have: point it at your app's own **APEXlang
export** (a text-based snapshot of your app's pages, unique to Oracle APEX
26.1, that Oracle itself generates — apx-testkit only ever reads it,
never writes it) and it writes one typed page object plus one smoke
**Playwright** spec per page, deterministically. No AI model runs during
generation — same export in, byte-identical files out, so a reviewer can
read the diff and know exactly what changed, the same way they'd review
any other generated code.

Every assertion the generator emits is built on a documented,
live-verified Oracle APEX JavaScript API (`apex.item()`, `apex.region()`)
— never a CSS selector guessed by scraping the DOM. It doesn't cover
every part of an APEX app yet, and says so plainly — see the capability
matrix below and `docs/limitations.md`.

It also ships an MCP server (`@apx/mcp`) alongside the parser and
generator, so an AI coding agent can drive the same pipeline natively as
part of its own workflow instead of a human running a CLI — point Cursor,
Claude Code, or any other MCP-capable agent at it and it can inspect a
real APEX export and regenerate deterministic tests itself; see
`docs/editor-integration.md`.

**Why not just hand-write Playwright tests?**
- **Deterministic, so it's diffable.** Same `.apx` input -> byte-identical
  output (verified in CI's determinism gate). The regenerated diff sits
  next to the `.apx` diff in the same review — nobody has to guess what
  changed or re-derive it by hand.
- **The DOM lives in one place.** Generated code never contains a raw CSS
  selector — only `@apx/testkit` primitives built on documented
  `apex.item()`/`apex.region()` APIs. When APEX's DOM changes across a
  release, fix it once in the testkit; every generated suite inherits the
  fix without hand-editing.
- **Catches "the AI agent broke this page" the same day.** With agents now
  editing `.apx` files directly, the risk isn't a human typo — it's an
  autonomous edit nobody reviewed for rendering/validation breakage. A
  regenerated smoke suite is the safety net that would have caught it.
- **Zero LLM calls in the test loop.** Generation is metadata -> template,
  not model -> guess. The assertions are identical every run — the
  opposite trade-off from an AI test-writer, and the reason this stays
  CI-stable.
- **The floor is a floor, not a strategy.** This doesn't replace test
  authorship for business logic — it replaces "does the page still
  render/validate correctly" as a repetitive hand-written chore.

## Architecture

The pipeline is four packages wired together, AST-first:

<img width="4200" height="2600" alt="apx_architecture_docs_style" src="https://github.com/user-attachments/assets/d37ff414-3557-429a-b5a0-f4d642c822cc" />

```
.apx export
    │
    ▼
@apx/parser    — read-only, .apx -> typed JSON AST (unrecognized constructs
                 land in `raw` bags + warnings, never silently dropped)
    │
    ▼
@apx/testgen   — AST -> per page: <alias>.page.ts (PageObject) +
                 <alias>.spec.ts (smoke spec exercising it)
                 deterministic: same AST in -> byte-identical files out
                 also: --watch (auto-regen on .apx change), the
                 apx-coverage CLI (touch log -> coverage report), the
                 apx-diff CLI (pure AST-to-AST regression report), the
                 apx-docs CLI (AST -> per-page Markdown docs, no live app),
                 the apx-flow CLI (AST -> Flow Map navigation graph
                 JSON, no live app), apx-report (self-contained HTML CI
                 dashboard bundling coverage + diff + parser warnings -- no
                 new analysis, pure composition of the above), and
                 apx-onboard (one shared runOnboarding() orchestration
                 function driving inspect/generate/flow/docs, plus diff +
                 coverage when a baseline/touch log are given, plus opt-in
                 SQLcl `apex validate` -- also called directly by the MCP
                 tool below, never duplicated)
    ▼
@apx/testkit   — the primitives BOTH generated and hand-written specs
                 import: item.ts (apex.item, VERIFIED), region.ts
                 (ApexRegion: refresh; ApexDataRegion: record/session APIs;
                 ApexInteractiveReportRegion: getViewName),
                 cards.ts + faceted-search.ts (pagination, selection,
                 facet counts -- verified live; confirmed-broken Cards
                 getRecords()/getModel() are intentionally not exposed),
                 lifecycle.ts (event-based waits on APEX's real
                 apexafterrefresh, not polling/timeouts), button.ts
                 (accessible-role locators, partial -- DOM id convention
                 still open), auth.ts (login fixture -- field ids
                 P101_USERNAME/P101_PASSWORD confirmed live against a
                 second real APEX app; submission switched to a
                 button-click after Enter proved unreliable there, fix
                 not yet independently re-verified),
                 coverage.ts (opt-in touch recorder, zero overhead unless
                 APX_COVERAGE_LOG is set), console-guard.ts, session.ts

@apx/mcp       — MCP stdio server wrapping @apx/testgen for agentic editors:
                 seven tools, each a thin deterministic wrapper (no LLM calls
                 anywhere in this file) around the same library function its
                 CLI counterpart calls -- inspect_apex_export,
                 generate_apex_tests, generate_flow_map (apx-flow),
                 diff_apex_exports (apx-diff), analyze_coverage
                 (apx-coverage), generate_apex_docs (apx-docs),
                 onboard_generated_apex_app (apx-onboard)
```

Repo layout: `packages/parser`, `packages/testkit`, `packages/generator`,
`packages/mcp`. `spike/` is a runnable Playwright project against a live
public reference app (UX Pattern Catalog); `examples/` is real generator
output, committed, so you can read the current output shape without
running anything.

Scope commitments: verified against APEX 26.1 only. No linter (APEX Advisor/SQLcl own that
role). No `.apx` writer (SQLcl owns import — a writer invites round-trip
corruption bugs). Interactive Grid has a real, live-verified component
(`ApexInteractiveGridRegion`) but the generator cannot auto-wire it up —
see the capability matrix below.

**Running the test suite:** `npm install && npm run test --workspaces`
runs the unit tests (the parser's integration test and the full spike
suite both need a real APEX export/instance and skip cleanly without
one). To run the spike suite itself: `cd spike && npm install && npm
test`.

## Current status

**Pre-alpha (M3 engineering-complete).** UPDATE (corrected in place — this
used to say "verified against exactly one real APEX 26.1 application"; that
is no longer accurate and understates the current corpus): the static parser
corpus is **46 real Oracle APEX 26.1 applications**, all parsing with zero
warnings (13 Oracle gallery apps + 11 independently-authored apps from
`ujnak/APEXlang-exports` + 18 apps from `github.com/oracle/apex`'s `26.1`
branch + 3 further independent apps + 1 more, this project's own user's own
app — see `.ai/knowledge/verification.md` for the full breakdown). Live
verification against a real *running* instance is narrower and a genuinely
different claim — confirmed so far against **4 of the 46** (UX Pattern
Catalog, Sample File Upload and Download, Sample Interactive Grids, Sample
Charts) — see docs/support-matrix.md before trusting anything here beyond
that, and docs/grammar-assumptions.md for the full ledger of what's
confirmed vs. open.

`apx-*` naming (not "apexlang"/"apex") is a permanent, compliance-driven
choice per Oracle's trademark guidelines, not a placeholder — see
docs/license-check.md.

### Capability matrix

Three questions per component, because they have different answers:
does the **parser** type it (or does it fall into `raw`/`unmodeled`)? Does
**`@apx/testkit`** have a verified runtime wrapper? Does the **generator**
emit assertions for it automatically? ✅ verified · 🚧 partial/known gap ·
❌ not built (see `packages/testkit/src/components/unsupported.ts` for
components that throw an explicit, reasoned error rather than silently
not existing).

| Component | Parser (metadata) | Runtime (`@apx/testkit`) | Generator (auto-assertions) |
|---|---|---|---|
| Application/Page | ✅ typed app runtime metadata (`friendlyUrls`, `compatibilityMode`), exported static application substitutions, APEXlang page identifier/number, alias/name/title/mode/security | ✅ `gotoApexPage`/`normalizeTitle`; `assessNavigationSafety` explicitly handles all four protection values, including `noUrlAccess`, and fails closed on unknown values; `apexPageUrl` rejects `friendlyUrls: false` until verified legacy URL generation exists | ✅ generated PageObject `goto()` uses the same safety assessment and rejects modal dialogs; exact-title assertions resolve only exported static substitutions (for example `&APP_NAME.`) and are explicitly omitted when runtime-dependent tokens remain; unsafe specs are skipped with a precise reason instead of bypassing the guard |
| pageItem (text/number/select/date/hidden) | ✅ | ✅ `ApexItem` | ✅ presence + round-trip |
| Button | ✅ (label/action) + `ApexButton.htmlDomId` (typed; CORRECTED runtime-review P0 item 4 — an earlier claim that it was unset on every real button in the corpus was an overclaim based on grepping one app; a full-corpus sweep found 4 real buttons across 4 apps that DO set it — see below) + `ApexButton.target`/`ApexButton.url` (redirect destination: `target` for `redirectThisApp`/`redirectOtherApp` page/app redirects, `url` for the flat `redirectUrl` variant — `url`/`redirectUrl` DIRECTLY confirmed live, 17 real buttons in `ux-pattern-catalog`; `target`/`redirectThisApp` DIRECTLY confirmed via real parsed export data, 17 occurrences across 12 pages in `concurrent-manager`, `page`/`items`/`clearCache` all witnessed — `redirectOtherApp` specifically still unwitnessed — see `docs/grammar-assumptions.md`'s "Navigation Graph prerequisite pass" entry and `ApexButtonTarget`'s doc comment in `packages/parser/src/ast.ts` for the Fourteenth-round correction) | 🚧 accessible-role locator, no verified id convention; ✅ `expectButtonsPresent()`/`buttonsPresent()` confirmed live against 9 real buttons (Sample Charts, Area page); 🚧 `buttonByHtmlDomId()` exists (runtime-review P0 item 4) but is NOT YET LIVE-VERIFIED for buttons (unlike regions' identical mechanism, ADR-003); ✅ successful interactions record page-scoped semantic identity, never locator creation alone | ✅ click methods (each carrying its button's `{ pageId, identifier }` semantic identity) + an auto-generated non-mutating presence assertion for every uniquely labeled button; ✅ buttons whose label collides with another button's on the same page get NO generated click method or falsely individualized presence assertion — a clear comment instead, never a guessed/ambiguous one (confirmed real on UX Pattern Catalog's "Dashboard Advanced" page, 5 buttons sharing one label) |
| Region (generic) | ✅ (type/name/source) | ✅ `ApexRegion.refresh()` only; `ApexDataRegion` owns shared record/session methods and `ApexInteractiveReportRegion` owns IR-only `getViewName()`. `resolveRegion()` records semantic APEXlang identity separately from the successful runtime region id | ✅ auto-generated resolve-check per page for Interactive Report/Cards/Faceted Search regions (via `resolveRegion()`, not a baked-in id), with explicit skip notes for other types |
| Interactive Report | ✅ | 🚧 `ApexRegion` — search/sort/pagination confirmed private on the JS widget API, no public API there; ✅ search/sort ARE verified through a genuinely different path — `interactive-report.ts`'s UI-locator-driven `searchInteractiveReport()`/`sortReportColumn()`/`getColumnSortState()`, confirmed live (quoted-phrase vs. unquoted-OR search semantics documented; sort requires a documented `{ force: true }` click due to a confirmed `stickyTableHeader` DOM overlap). Pagination not verified — no live multi-page dataset available | ❌ (column-heading auto-assertion was attempted and reverted — see Report columns row) |
| Cards | ✅ | ✅ `ApexCardsRegion` — pagination/selection only; confirmed-broken `getRecords()`/`getModel()` are not exposed; row-level actions also verified for presence (see Region actions row) | ❌ not wired into generator yet |
| Faceted Search | ✅ | ✅ `ApexFacetsRegion` | ❌ not wired into generator yet |
| Page messages (success/error/alert) | N/A (global, not page metadata) | ✅ `messages.ts` — `expectSuccess`/`expectError`/`expectNoErrors`/`expectNoSuccessMessage` (page-banner `#APEX_ERROR_MESSAGE`/`#APEX_SUCCESS_MESSAGE`) AND `expectAlert`/`dismissAlert`/`alertDialog` (modal `apex.message.alert()`, `role="alertdialog"`, confirmed a genuinely different mechanism — see Validations row) | ❌ not wired into generator yet |
| Checkbox | ✅ (type string) | ❌ not tested live — attempted 2026-08-12 (GitHub issue #8), blocked by an instance-wide outage on the only no-login live app plus unset login credentials for the others, not a finding about actual behavior; see docs/quirks/26.1.json `checkbox-item-live-verification-blocked` | ❌ |
| Switch, RadioGroup, Popup LOV, Rich Text, File Browse, Shuttle | ✅ (type string) | ❌ explicit `UnsupportedComponentError` stub | ❌ |
| Interactive Grid | ✅ (type string) + `ApexRegion.htmlDomId` (predicts the runtime region id when set) | ✅ `ApexInteractiveGridRegion` — `getActions`/`getViews`/`getCurrentView`/`getCurrentViewId`/`getSelectedRecords` confirmed live | ✅ auto-generated when `htmlDomId` is set — resolved LIVE via `resolveRegion()` (htmlDomId-only candidate; the APEXlang identifier is confirmed NOT to work as a fallback for this type) before constructing the wrapper; ❌ otherwise — the runtime region id can differ from its APEXlang identifier (confirmed: `basic-editing` in the export, `emp` at runtime) and is genuinely unconstructible from static data alone when `htmlDomId` is absent; construct it by hand with the live-discovered runtime region id |
| Chart | ✅ `ApexRegion.chartSettings.type` (17-value chart type enum; defaults to `'bar'` when the `chart {}` group is omitted — confirmed live) + `ApexRegion.htmlDomId` (predicts the runtime region id when set) | ✅ `ApexChartRegion` — `getOption()`/`getOption(key)`/`setOption(key, value)` confirmed live on 3 chart types, plus inherited `ApexRegion.refresh()`; corrects an earlier wrong claim that `apex.region(id).widget()` returns `null` for charts — it does not | ✅ auto-generated when `htmlDomId` is set — resolved LIVE via `resolveRegion()` (htmlDomId-only candidate) before constructing the wrapper; confirms the live type resolves to a real, non-empty string — **not** an exact-match against the declared type, since APEX's declarative `donut` type is confirmed to report live as JET's `pie` — see docs/quirks/26.1.json `chart-declared-type-not-runtime-type`); ❌ otherwise, genuinely unconstructible from static data alone |
| Calendar | ✅ `ApexRegion.calendarSettings` (displayColumn/startDateColumn/endDateColumn/pkColumn/showTime/views/dragAndDrop) | ❌ explicit stub — confirmed present in real exports (`sample-calendar`: 21 regions), typed metadata now exists, but zero LIVE ground truth on the runtime widget | ❌ |
| Map | 🚧 (falls to `raw`) | ❌ explicit stub — confirmed present in real exports (`apextogo`/`sample-application-search`), but zero LIVE ground truth | ❌ |
| Tree (as a content/data-display pattern) | 🚧 (falls to `raw`) | ❌ explicit stub — the only Tree seen live is the universal left-nav reused as a login picker, not a distinct content region | ❌ |
| Dynamic Actions | ✅ `ApexPage.dynamicActions` — trigger, condition, and nested true/false actions all typed | ❌ — no known way to trigger one by name at runtime (typed metadata does not solve this) | ❌ |
| Branches (page-processing redirects) | ✅ `ApexPage.branches` (target page/URL/carried items, condition) | N/A — no runtime hook exists; the only observable effect (which page/URL is landed on) is already assertable via `page.url()` | ❌ not wired into generator yet |
| Validations (server-side field/page rules) | ✅ `ApexPage.validations` (rule type/item/column, error, condition) | ✅ resolved 2026-08-01, confirmed live against Sample Interactive Grids page 31 — TWO mechanisms, both covered: page-level SQL `validation()` (`comm-limit`, `hire-date-in-past`) routes through the existing `messages.ts` `expectError()`/`#APEX_ERROR_MESSAGE`, zero new code; column-level `valueRequired` is a genuinely different CLIENT-SIDE check (`apex.message.alert()` modal, never reaches the server) now covered by new `expectAlert()`/`dismissAlert()` helpers. See docs/quirks/26.1.json `interactive-grid-validation-mechanism-split` and `spike/tests/interactive-grid-validation-demo.spec.ts` | ❌ not wired into generator yet |
| LOV references (`selectList`/`radioGroup`/`popupLov` only) | ✅ `ApexItem.lovName` — narrow reference to the named LOV; the LOV's actual list of values (`shared-components/lovs.apx`) remains out of scope | — | ❌ not wired into generator yet |
| Processes (page-processing PL/SQL or built-in DML) | ✅ `ApexPage.processes` (name/type/sequence/point, condition) | N/A — no runtime hook exists; the only observable effect (resulting page state) is already assertable via existing mechanisms | ❌ not wired into generator yet |
| Computations (item-value-setting rules) | ✅ `ApexPage.computations` (itemName/sequence/type, condition) | N/A — same reasoning as Processes | ❌ not wired into generator yet |
| Report columns (classicReport/IR/IG column definitions) | ✅ `ApexRegion.columns` (identifier/type/heading/sequence, link target — `ApexColumnLinkTarget` now covers BOTH the in-app page-redirect shape and the external-URL-redirect shape (`url`), a real bug fix: this field's own doc comment previously and wrongly claimed no URL variant existed for column links at all — corrected in place, see `docs/grammar-assumptions.md`'s "Navigation Graph prerequisite pass" entry) | ✅ `report-column.ts` — `reportColumnHeader()`/`expectReportColumnHeadersPresent()` confirmed live on classicReport AND interactiveReport; `classicReportColumnById()` confirmed live: DOM id === `.apx` identifier verbatim (classicReport only — interactiveReport's column id is a confirmed-internal, undiscoverable numeric id) | ❌ a generator auto-assertion was built and then REVERTED — a real Interactive Report counter-example (a declared, non-hidden column heading with no matching runtime `columnheader`, folded into another column's cell instead) would have shipped a guaranteed-failing test; see docs/quirks/26.1.json `interactive-report-column-heading-not-always-own-header` |
| Region actions (row-level action/link in Cards/List regions) | ✅ `ApexRegion.actions` (`ApexRegionAction` — identifier/label/kind/target/url; distinct from the Dynamic-Action `action`) | 🚧 `region-action.ts` — presence-only, confirmed live for Cards' `action-d` shape (NOT unique per region — same label repeats once per record); List's `action-e` shape confirmed structurally different (menu-based), not wrapped. Click-through effects confirmed a DEAD END on the only live app available (every tested action is a non-functional placeholder) | ❌ not wired into generator yet |
| Login / authentication | N/A | 🚧 field ids confirmed (both username AND password checked explicitly before fill, with an actionable "custom auth scheme?" error if either is missing); a real race-condition bug found+fixed, fix not independently re-verified; success detection is now CONFIGURABLE (`options.success`: a URL pattern, a post-login Locator, or a custom predicate) — the plain "URL changed away from login" check remains only the documented-weaker DEFAULT for backward compatibility, not the recommended path | ✅ login-required pages get a real generated test that logs in via `login()` in a `beforeEach`, gated at runtime on `APX_LOGIN_TEST_USERNAME`/`APX_LOGIN_TEST_PASSWORD` (skips cleanly if unset) — assumes the app's default auth scheme; custom-scheme apps fail loudly and specifically from `login()` instead |
| Coverage mapping (`apx-coverage`) | — | ✅ | — |
| Regression detection (`apx-diff`) | — | ✅ (pure AST diff, no live app needed; `--format human` for prose output alongside the default structured tree) | — |
| Documentation generation (`apx-docs`) | — | ✅ (pure AST read, no live app needed) | — |
| Flow Map / navigation graph (`apx-flow`) | — | ✅ (pure AST read, no live app needed) — Phase 1a scope: `ApexPage.branches`, `ApexRegion.actions` (Cards/List), `ApexRegion.columns[].linkTarget`, `ApexButton.target`/`.url`. Every edge carries a real confidence tier: `'high'` (all 8 of 8 mechanisms — live-witnessed real data; button page/app-redirect targets were `'medium'` until the Fourteenth round corrected a false "zero real occurrences" claim that had only ever checked one app — `concurrent-manager` has 17 real `redirectThisApp` occurrences across 12 pages, `redirectOtherApp` specifically still unwitnessed). Breadcrumbs/navigation lists (shared-component parser support needed), dialog-page detection (cross-page join needed), Dynamic Action redirects (no declarative metadata found), and `apex.navigation` (runtime JS API) are all explicitly out of scope — see `docs/ecosystem-roadmap.md`'s Thirteenth and Fourteenth rounds | — |
| CI dashboard (`apx-report`) | — | ✅ (self-contained HTML bundling coverage + diff + parser-warning-summary; no new data source, pure composition of the three rows above) | — |
| Onboarding orchestration (`apx-onboard`) | — | ✅ one shared `runOnboarding()` function (`@apx/testgen/onboard`) drives BOTH the CLI and the `onboard_generated_apex_app` MCP tool; sequences inspect/generate/flow-map/docs, plus diff (given `--baseline`) and coverage (given `--baseline` AND an already-existing `--touch-log`) — never silently omitted, always an explicit note when a section can't run yet; `liveVerificationRequirements` is derived from this same run's real parser warnings/unmodeled components/generation diagnostics. Opt-in SQLcl `apex validate -input <exportDir>` (OFF by default; hard-fails the whole run if requested but unresolvable — see `docs/quirks/26.1.json` `sqlcl-apex-validate-command-shape`) | — |

Full list of limitations in docs/limitations.md; a few of the stories
behind specific rows:

- **CORRECTED — this line was stale.** Region resolve-checks
  (`expectRegionsResolve()`) and report-column-heading assertions
  (`expectReportColumnHeadersPresent()`) both exist and are live-verified
  (see the capability matrix above); what remains genuinely open is
  narrower: a verified button HTML DOM ID convention specifically (button
  *click methods* work today via accessible-role/label locators as a
  deliberate, still-current choice — see `docs/quirks/26.1.json`
  `button-id-not-static-id`: the mechanism exists in the EBNF, mirroring
  regions, but is confirmed unset on every real button in this project's
  corpus so far, so nothing safer to build against exists yet).
- **`auth.ts` is partially verified, not fully closed out.** Field ids
  (P101_USERNAME/P101_PASSWORD) confirmed live against a second real APEX
  app with a real login page. Found and fixed a real race condition: the
  original code checked `page.url()` once right after
  `waitForLoadState('domcontentloaded')`, which can run before an
  async/AJAX-driven redirect actually lands (confirmed via a failure
  screenshot showing the login had, in fact, succeeded). An earlier theory
  — "Enter-key submission is unreliable, switch to a button click" — was
  likely the wrong diagnosis for the same race. Now waits for an actual URL
  change (`page.waitForURL`) instead. This fix hasn't been independently
  re-verified either — spike/tests/auth-login-verify.spec.ts is ready for
  whoever has credentials to run it (`APX_LOGIN_TEST_USERNAME`/
  `APX_LOGIN_TEST_PASSWORD` env vars — neither is hardcoded in the file, so
  no account info is committed at all).
  **P1 hardening pass (maintainer review):** "the URL changed to
  *something*" is itself a weak signal — a redirect to an MFA step or an
  error-redisplay page would pass it just as easily as a real authenticated
  landing page. `login()` now accepts `options.success` — a URL pattern the
  final page must actually match, a `Locator` that must become visible
  (e.g. a Logout link only the authenticated shell renders), or a custom
  `async (page) => boolean` predicate — with the original URL-changed check
  kept only as the documented-weaker DEFAULT when `options.success` is
  omitted, for backward compatibility. The password field is now also
  checked to exist BEFORE it's filled, with the same actionable
  "custom-auth-scheme?" error message pattern already used for the
  username field. Regression-tested against a synthetic fake-Page/Locator
  harness (`packages/testkit/test/auth.test.ts`) covering every branch of
  the new `success` option; live re-verification of this pass specifically
  is still open — see docs/quirks/26.1.json `login-race-condition.
  secondPass` for exactly what was and wasn't checked live this round
  (reachability was re-confirmed fresh; blocked on test credentials, not
  on the app being down).
- **Drawer/modal pages fail to load** via a plain friendly-URL GET
  (confirmed live on p00420) — a known, documented gap, not yet root-caused.
- **`spike/tests-generated/`'s 18 committed files are stale** relative to
  the current page-object generator template; regenerating them for real
  needs the actual export, which isn't committed (redistribution unchecked).
- **Interactive Grid support exists (`ApexInteractiveGridRegion`) but is
  hand-wired only** — the generator cannot auto-construct it, since the
  region's runtime region id can differ from its `.apx` identifier
  (confirmed live). **Interactive Report's JS widget API only has the
  generic `ApexRegion` methods** (search/sort/pagination are confirmed
  private there) — but search/sort ARE reachable through a different,
  UI-locator-driven path (`interactive-report.ts`, see the capability
  matrix above), also hand-wired only: a generator auto-assertion for
  report column headings was built and reverted after a real live
  counter-example (see `docs/quirks/26.1.json`
  `interactive-report-column-heading-not-always-own-header`). No
  `required`-item assertion, no data-dependent assertions — the last one
  is permanent, by design; the generator has no way to know what data
  your instance holds.

## Roadmap

| Milestone | Status |
|---|---|
| M0 — ground truth, license/naming check | Done |
| M1 — parser | Done — UPDATE (corrected in place; this used to say "done against one app, needs a second, independent export"): now confirmed against a 46-app real Oracle APEX 26.1 corpus, zero warnings across all 46 — see .ai/knowledge/verification.md |
| M2 — testkit fixtures | Done — exit criterion met (hand-written spec, testkit primitives only, passing live) |
| M3 — generator (page objects + smoke specs) | Engineering-complete; the literal exit criterion (a green run in a live 26.1 GitHub Actions container) is open — needs Oracle APEX/ORDS infrastructure this project doesn't have access to |
| M4 — release + second user | Launch-prep done: LICENSE (full Apache-2.0), trademark/license review, support matrix, limitations doc, examples/. The actual milestone — a real second user filing real breakage reports — is still open and isn't something engineering work alone can produce |

Highest-value next steps (see docs/limitations.md and CLAUDE.md "Outstanding
debts"): capture the region/button DOM discovery report, validate the
parser against a second independent `.apx` export, independently re-verify
the button-click login fix (spike/tests/auth-login-verify.spec.ts, needs
real credentials someone else supplies), and — the actual M4 milestone —
find that second user.

### Beyond M4: a comprehensive APEX testing ecosystem

The longer-term direction is richer component APIs, lifecycle-aware waits,
snapshot testing, coverage mapping, and editor integration. Done so far
(all verified live, not just designed): Interactive Report/Cards/Faceted
Search/**Interactive Grid**/**Chart** component APIs, event-based lifecycle
waits (`refreshRegionAndWait`/`fetchFacetCountsAndWait`), a `--watch` CLI flag for editor
auto-regeneration, and coverage mapping — set `APX_COVERAGE_LOG=<path>`
before running your suite, then run `apx-coverage <export-dir>
<touch-log-path>` to see which declared items/regions/buttons a run
actually touched vs. missed (add `--html <report.html>` for a
self-contained heatmap/checklist view of the same report, see
docs/tutorial.md 2.9). Also done: `apx-docs <export-dir> --out
<docs-dir>` generates deterministic Markdown page/region documentation
(items, buttons, regions — including calendar/chart settings, columns,
row-level actions — dynamic actions, branches, validations, processes,
computations) straight from the already-typed AST, no live app needed;
see `docs/tutorial.md` §2.16 and `examples/employee-page/` for real
output. Also done: `apx-report <old-export-dir> <new-export-dir>
<touch-log-path> --out <report.html>` — a single self-contained HTML CI
dashboard bundling coverage (embeds `renderCoverageHtmlFragment()`
verbatim), regression diff (embeds `formatDiffHuman()` verbatim — the
exact text `apx-diff --format human` prints), and a parser-warning
summary (`@apx/parser`'s own `ParseResult.warnings`) in one artifact, safe
to attach to a CI run. Deliberately scoped to exactly these three already-
real data sources, not the larger coverage/diff/screenshots/perf/
failures/a11y/parser-warnings pitch — screenshots, performance metrics,
and accessibility results don't exist anywhere in this project yet, so
there's nothing to compose them from; see docs/tutorial.md §2.17. Also
done: `apx-onboard --export <export-dir> [--baseline <dir>] --tests
<outDir> --docs <outDir> --report <path> [--touch-log <path>]
[--sqlcl[=<path>]]` — one shared onboarding orchestration function
(`runOnboarding()`, `@apx/testgen/onboard`) also exposed as the
`onboard_generated_apex_app` MCP tool, for the "I just got a new
(often AI-generated) APEXlang export — what do I do with it?" workflow:
inspect/generate/flow-map/docs always; diff and coverage added only when
a baseline export and an already-run touch log are available
(never a silent omission — always an explicit note); an opt-in
`--sqlcl` flag runs SQLcl's `apex validate -input <export-dir>` (off by
default, hard-fails the whole run if requested but unavailable); see
docs/tutorial.md §2.19. Still open: snapshot testing (needs a
masking-policy design), and Trees as content — the only Tree widget seen
live so far is the universal left-nav reused for a login picker (see
docs/ecosystem-roadmap.md), not a distinct page-content pattern.

---

If `apx-testkit` makes testing your APEX apps easier, give us a ⭐️ on GitHub!
