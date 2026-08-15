# Limitations

Honest list of what this toolkit does not cover today. If you hit one of
these, it's a known gap, not a bug — but please file an issue anyway if the
workaround isn't obvious; that's exactly the signal M4 needs.

## Page types / DOM patterns

- **Drawer/modal pages (e.g. `pageMode: modalDialog`) don't load via a plain
  friendly-URL GET.** Confirmed live: p00420 (Data Entry — Drawer Form)
  returns 400 on direct navigation. These pages need a parent-page/dialog
  context this generator doesn't construct. Generated tests for such pages
  will fail until this is addressed — that's expected, not a regression.
- **Interactive Grid has a real, live-verified component
  (`ApexInteractiveGridRegion`).** The generator DOES auto-wire it up when
  `ApexRegion.htmlDomId` is set — resolving the runtime id LIVE via
  `@apx/testkit`'s `resolveRegion()` (packages/testkit/src/components/
  resolve-region.ts, runtime-review P0 item 1) before constructing the
  wrapper, rather than trusting a static `htmlDomId ?? identifier` guess.
  When `htmlDomId` is absent, auto-wiring remains genuinely impossible:
  confirmed live, the region's runtime static id can differ from its
  `.apx` identifier (`basic-editing` in the export, `emp` at runtime), AND
  the export identifier is confirmed NOT to work as a fallback for this
  component type — see docs/quirks/26.1.json `region-id-not-static-id`.
  Construct it by hand with the real static id, discovered from the live
  DOM, in that case.
- **Region assertions don't exist for arbitrary region types** — the
  region identifier -> DOM convention is still an open ledger item for
  most types (see docs/grammar-assumptions.md "Still open") — no selector
  guess has been committed. `@apx/testkit`'s `probeRegions()`/
  `refreshRegion()` only report what apex.region()'s own widget API
  resolves, which is known to miss non-widget regions (staticContent,
  form). Confirmed concretely divergent for Interactive Grid (see above)
  — open whether other region types can also diverge. UPDATE (stale line,
  corrected in place): `expectRegionsResolve()` DOES exist and is
  auto-wired into generated specs for `interactiveReport`/`cards`/
  `facetedSearch` specifically (see `lib.ts`'s `RESOLVABLE_REGION_TYPES`)
  — this bullet's "don't exist" framing predates that and is narrower than
  it reads; "most types" is the accurate scope now. Report COLUMN headers
  (a level below the region itself) are also now covered —
  `report-column.ts`'s `reportColumnHeader()`/
  `expectReportColumnHeadersPresent()`, confirmed live on classicReport
  AND interactiveReport (Eighth round, 2026-08-01) — but a generator
  auto-assertion deriving the full heading list from `.apx` metadata was
  attempted and REVERTED: a real Interactive Report counter-example (a
  declared, non-hidden column with no matching runtime header, folded
  into another column's cell) would have shipped a guaranteed-failing
  test. See docs/quirks/26.1.json
  `interactive-report-column-heading-not-always-own-header`. Interactive
  Report's search/sort are also now reachable, through UI locators rather
  than the (confirmed-private) JS widget API — `interactive-report.ts`,
  same round. Cards/List row-level actions (`ApexRegion.actions`) are
  reachable for PRESENCE only — `region-action.ts` — click-through effects
  are a confirmed dead end on the one live app available (non-functional
  placeholder affordances); see docs/quirks/26.1.json
  `region-action-cards-not-unique-inert`.
- **Pages with `security.pageAccessProtection: argumentsMustHaveChecksum`
  cannot be reached via `gotoApexPage()`'s bare-goto navigation** when the
  page is NOT `authentication: public`, even immediately after a verified
  login. Confirmed live: only real in-app link clicks preserve the
  session; a bare `page.goto()` to any page (including the exact page
  just landed on) redirects to `/login`. UPDATE (runtime-review P0 item
  2): `@apx/testgen` now DETECTS this at generation time
  (`isNavigationUnsafe()`/`@apx/testkit`'s `assessNavigationSafety()`) and
  emits an unconditional `test.skip()` with a specific reason instead of
  a normal test guaranteed to redirect and fail — it no longer silently
  generates a broken test for these pages. `@apx/testkit`'s
  `navigateViaUiPath(page, steps)` formalizes the real workaround (a
  hand-supplied sequence of in-app link clicks) into a reusable
  primitive for hand-written specs — auto-deriving that click path from
  the Flow Map is a real, deliberately scoped-out follow-up, not built
  this pass (see docs/ecosystem-roadmap.md). A PUBLIC page with the same
  flag set (e.g. UX Pattern Catalog's own pages, which all declare it) is
  treated as safe for direct-url navigation — an INFERENCE from indirect
  evidence (p00420 returns a page-level 400, not a `/login` redirect, on
  direct GET — see `drawer-modal-pages-400`), not independently
  live-reconfirmed; flagged for a future live pass. See
  docs/quirks/26.1.json `page-access-protection-blocks-bare-navigation`.
- **`ApexCardsRegion.getRecords()`/`.getModel()` are confirmed broken** in
  the one app tested — they throw a genuine runtime error from inside
  APEX's own client code, not a testkit bug. Left in the typed API so the
  failure is visible rather than silently unavailable; see
  docs/grammar-assumptions.md.
- **`ApexFacetsRegion.getTotalResourceCount()` needed a lifecycle-event wait
  — FIXED.** It could return `null` for a short window after navigation
  even after `await fetchCounts()`. Use `fetchCountsAndWait()` instead of
  `fetchCounts()` — it waits for APEX's own `apexafterrefresh` event on the
  region (verified live, deterministic, ~400ms), not a poll or a fixed
  timeout. See `fixtures/lifecycle.ts` and
  spike/tests/faceted-search-cards-demo.spec.ts. This event-based wait
  pattern (`callRegionMethodAndWaitForEvent`/`waitForRegionEvent`) is
  reusable for any region operation that fires a lifecycle event — it does
  NOT replace the one `page.waitForTimeout(1000)` in generated "clean
  console" specs, which exists to catch late/unpredictable async console
  errors, a different kind of wait with no single completion event.
- **Button assertions use accessible-role/label locators, not a verified
  static-id convention.** Works today for ordinary labeled buttons; not
  verified for icon-only buttons or heavily template-customized ones.
  UPDATE (Eighth round, 2026-08-01): the "static-id convention" question
  has real, confirmed evidence now, not just an open question — the EBNF
  confirms `button.advanced.htmlDomId`/`staticId` exist (the SAME
  mechanism ADR-003 already established for regions, now typed as
  `ApexButton.htmlDomId`), but a full grep of every button in this
  project's entire local corpus (46+ real exports) found ZERO that ever
  set either field; live-confirmed the runtime id in that (universal, so
  far) case is an internal `B<numeric>` id, undiscoverable from export
  data. `button.ts`'s locator strategy is unchanged as a direct result —
  see docs/quirks/26.1.json `button-id-not-static-id`.

## Item coverage

- **`required` item behavior is unmodeled.** No required item exists in the
  ground-truth app used so far, so the generator can't yet assert "required
  items reject empty submit" as the original plan describes.
- Item *types* not seen in the ground-truth app (calendar pickers, rich text,
  map regions, etc.) parse into `raw` bags rather than typed fields — see the
  `unmodeled` list the generator/parser print.

## Authentication

- **`auth.ts`'s login fixture is partially verified; one real bug found and
  fixed, one earlier diagnosis corrected.** Field ids
  (`P101_USERNAME`/`P101_PASSWORD`) are confirmed live against a real
  second APEX 26.1 app with a genuine login page — no changes needed there.
  The actual bug: `login()` checked `page.url()` once, right after
  `waitForLoadState('domcontentloaded')` — a race condition, not a
  submission-method problem. A run that threw "URL unchanged after submit"
  had its failure screenshot show the user already logged in on the real
  post-login dashboard — the login had succeeded, the check just ran before
  an async/AJAX-driven redirect had landed. (An earlier theory — "Enter
  is unreliable, switch to a button click" — was very likely the wrong fix
  for the same underlying race; both submission methods can trigger this.)
  Fixed by waiting for an actual URL change (`page.waitForURL`, up to
  `timeoutMs`) instead of a single fixed-point check. This fix has NOT been
  independently re-verified against workflow-approvals/brookstrut-style
  apps either. `.apx` pages requiring login now get a real generated test
  (login via `beforeEach`, gated on `APX_LOGIN_TEST_USERNAME`/
  `APX_LOGIN_TEST_PASSWORD`, skips cleanly if unset) instead of a permanent
  `test.describe.skip()` — but this assumes the app's default APEX
  authentication scheme with a standard `P101_USERNAME`/`P101_PASSWORD`
  login page. Apps with a custom authentication scheme (no `P101` login
  page in their export at all — confirmed true of the real
  `sample-workflow-approvals` export, whose `application.apx` declares
  `scheme: @demo-purposes-only-custom-auth-scheme` and has no page 101)
  will fail loudly and specifically from inside `login()` rather than run.
  `spike/tests/auth-login-verify.spec.ts` is ready for whoever has
  credentials for a real login page to run (`APX_LOGIN_TEST_USERNAME=<user>
  APX_LOGIN_TEST_PASSWORD=<password> npx playwright test
  tests/auth-login-verify.spec.ts` from `spike/`) — neither credential is
  hardcoded in the file, this remains one of the highest-value things you
  could do for this project right now.

## Generator

- **Determinism is proven against a hand-written synthetic fixture**
  (`packages/generator/test/fixtures/reference-fixtures`), not the actual
  multi-page UX Pattern Catalog export — that export isn't committed
  (redistribution rights unchecked) and wasn't available in every
  environment this project has been developed in. `spike/tests-generated/`
  may lag the current generator template until someone with real export
  access regenerates it.
- **No page-object/spec (generator) support for Interactive Report
  search/sort/pagination or Interactive Grid.** UPDATE (Eighth round,
  2026-08-01): `@apx/testkit` itself DOES now have a verified component
  for IR search/sort — `interactive-report.ts` (`searchInteractiveReport`/
  `sortReportColumn`/`getColumnSortState`), confirmed live via UI
  locators (not the confirmed-private JS widget API). The gap this bullet
  describes is narrower than it used to be: the GENERATOR doesn't
  auto-wire either capability into generated specs (search/sort are
  mutating, state-changing operations — auto-firing them in every
  generated smoke spec wasn't judged safe to add without further review;
  a column-heading PRESENCE auto-assertion was attempted separately and
  reverted after a real live counter-example, see docs/quirks/26.1.json
  `interactive-report-column-heading-not-always-own-header`).
  Pagination remains genuinely unverified — no live multi-page dataset
  was available to check next/prev click behavior against. Interactive
  Grid's generator gap is unrelated and unchanged — see the `htmlDomId`
  bullet above.
- **Data-dependent assertions are out of scope, permanently, by design** —
  the generator has no way to know what data your instance holds.

## Grammar / parser

- Comment syntax, string quoting/escaping edge cases, and property-order
  significance are all unverified assumptions (assumed "none" until proven
  otherwise) — see docs/grammar-assumptions.md "Still open".
- Verified against exactly one application. A second, independently-sourced
  export is needed before any of the "verified" claims in this repo should
  be trusted beyond that one app — see docs/support-matrix.md.
