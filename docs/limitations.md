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
  (`ApexInteractiveGridRegion`), but the generator cannot auto-wire it up.**
  Confirmed live: the region's runtime static id can differ from its `.apx`
  identifier (`basic-editing` in the export, `emp` at runtime) — see
  docs/quirks/26.1.json `region-id-not-static-id`. Construct it by hand
  with the real static id, discovered from the live DOM.
- **Region assertions don't exist.** The region identifier -> DOM convention
  is still an open ledger item (see docs/grammar-assumptions.md "Still
  open") — no selector guess has been committed. `@apx/testkit`'s
  `probeRegions()`/`refreshRegion()` only report what apex.region()'s own
  widget API resolves, which is known to miss non-widget regions
  (staticContent, form). Confirmed concretely divergent for Interactive
  Grid (see above) — open whether other region types can also diverge.
- **Pages with `security.pageAccessProtection: argumentsMustHaveChecksum`
  cannot be reached via `gotoApexPage()`'s bare-goto navigation**, even
  immediately after a verified login. Confirmed live: only real in-app link
  clicks preserve the session; a bare `page.goto()` to any page (including
  the exact page just landed on) redirects to `/login`. Navigate via real
  UI clicks for apps/pages configured this way — see
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
- **No page-object/spec support for Interactive Report search, pagination,
  or Interactive Grid** — an `ir.ts` component was deliberately not built;
  there's no verified DOM contract for it yet.
- **Data-dependent assertions are out of scope, permanently, by design** —
  the generator has no way to know what data your instance holds.

## Grammar / parser

- Comment syntax, string quoting/escaping edge cases, and property-order
  significance are all unverified assumptions (assumed "none" until proven
  otherwise) — see docs/grammar-assumptions.md "Still open".
- Verified against exactly one application. A second, independently-sourced
  export is needed before any of the "verified" claims in this repo should
  be trusted beyond that one app — see docs/support-matrix.md.
