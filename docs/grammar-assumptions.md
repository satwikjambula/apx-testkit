# Grammar ledger — updated against a REAL 26.1 export

Ground truth: UX Pattern Catalog app export, manifest mmdVersion 26.1.0+3102.
Parser status: parses the full export (19 pages, application.apx, page-groups,
all shared-component .apx files) with ZERO warnings. Ledger below records what
is verified, what changed vs. the docs-derived guesses, and what remains open.

## Verified (from real files)

- [x] Component: `type [identifier] ( ... )`. Roots seen: `app IDENT (`,
      `page N (`, plus `list`, `lov`, `authentication`, `authorization`,
      `breadcrumb`, `buildOption`, `componentSetting`, `file`, `pageGroup`...
- [x] Item component is `pageItem`, NOT `item` (docs example was simplified).
      Parser accepts both; projection treats them identically.
- [x] Properties are newline-terminated `name: value`, no commas. Scalars run
      to end of line (spaces, en-dashes, colons, inline HTML all legal).
- [x] Property KEYS may be numeric (`userDefinedAttributes { 1: ... }`).
- [x] Groups `name { ... }` AND object-valued properties `name: { ... }`
      (e.g. `homeUrl: {`, `link.target: {`) — both flattened to dotted keys.
- [x] Arrays `[ ... ]` whitespace-separated, spanning lines; the same property
      (templateOptions) appears both as scalar and as array.
- [x] Fenced code blocks as property values: `prop:` then ```lang ... ``` on
      following lines, dedented by fence indent. Langs seen: (none), sql,
      html, css, javascript. SQL/JS/CSS are embedded, NOT sibling files —
      except theme/static assets, which ARE native sibling files.
- [x] References `@local` and `@/standard-theme`.
- [x] STRUCTURAL: regions, pageItems, and buttons are SIBLINGS under the page;
      containment is via `layout.parentRegion: @ref` (region->region),
      `layout.region: @ref` (item/button->region), plus `layout.slot`.
      Projection resolves these; lexical nesting (docs style) also accepted.
- [x] Item label lives in a group: `label { label: X }`. Item source column:
      `source { column: X }` with `source.formRegion: @form` linkage.
- [x] Validation group holds `maxLength` etc.; NO required flag observed in
      this app — requiredness may be template-driven (@/required-floating) or
      a property not exercised here. OPEN until seen in another export.
- [x] Global page 0 exists with no alias; page files p00000-... zero-padded 5.
- [x] Package layout: application.apx, page-groups.apx, pages/, shared-
      components/ (with themes/ + static-files/ native assets), .apex/
      apexlang.json manifest ({"mmdVersion"}), deployments/default.json.


## Runtime verification (live 26.1 instance, spike run — VERIFIED facts)

- [x] Friendly URL = lowercased page alias appended to app base; page-level
      `authentication: public` serves with no redirect/session bounce (200).
- [x] pageItem identifiers map to the DOM VERBATIM: DOM node id equals the
      .apx identifier for every item type tested (textField, textarea,
      numberField, selectList, datePicker, hidden), and apex.item(id)
      setValue/getValue round-trips. This is the generator's item contract.
- [x] Page title at runtime differs from .apx title by invisible characters
      (dash/space variant). GENERATOR RULE: compare titles only after NFKC
      normalization + dash folding + whitespace collapse; never raw equality.
- [ ] OPEN (spike v3 in flight): region identifiers and button identifiers/
      buttonNames matched NO probed DOM convention (verbatim #id, R_ prefix,
      data-region-id, data-static-id, apex.region()). Note apex.region()
      misses are expected for staticContent/form (non-widget) regions. v3
      dumps ground truth: HTML occurrence + attribute location per region id,
      full page id inventory, and reverse-mapped button attributes by label.
      Do not design region/button selectors until that report lands.
      Interim workaround shipped in `packages/testkit/src/components/button.ts`:
      locate buttons by accessible role + label (`.apx` `label` field) via
      Playwright's accessibility tree, not a static-id guess. Does not close
      this item — a verified id-based convention should still be preferred
      once known.
- [x] Full generated-suite run (M2), live UX Pattern Catalog instance:
      39/43 tests passed. All 4 failures are p00420-data-entry-drawer-form
      (GET returns 400) — a drawer/modal page does not resolve via a plain
      friendly-URL GET, consistent with it needing a parent-page/dialog
      context. Confirms the V1-V5 contracts hold for every other page type
      exercised (list, dashboard, browse/search, item-detail, master-detail,
      simple data-entry). Root cause of the p420 400 is still unexplored —
      candidate for a future ledger entry, not urgent for M2.
- [x] GENERIC apex.region(id) method surface confirmed live on TWO
      independently-typed regions (an Interactive Report and a Cards
      region, both on the ground-truth app): `refresh`, `getSessionState`,
      `getCurrentRecordId`/`setCurrentRecordId`, `getRecordValues`/
      `setRecordValues`, `getSelectedValues`/`setSelectedValues`, `focus`.
      `getViewName` is Interactive-Report-only (absent on Cards; calling it
      on Cards throws, confirmed). Shipped as `ApexRegion` in
      `packages/testkit/src/components/region.ts`.
      `apex.region(id).call(action)` (the generic action-dispatch API) was
      tested against Interactive Report with a dozen plausible action names
      (refresh, search, getViews, getCurrentView, reset, collapse, ...) and
      REJECTED ALL of them with "Call not supported." — that dispatch path
      is not how this widget type is driven; the direct methods on the
      region object are.
      Interactive Report's search/sort/pagination internals ARE exposed on
      the underlying jQuery-UI-style widget instance, but every one of
      those methods is `_`-prefixed (`_search`, `_paginate`, `_reset`,
      `_download`, ...) — private by jQuery UI widget-factory convention.
      The only PUBLIC (non-underscore) instance methods beyond the generic
      region API are `refresh`, `openDialogChat`, `openInlineChat`,
      `closeChat` (APEX 26.1 ships an AI chat integration on IR). Do not
      call the private methods from the testkit — same "no raw
      internals" principle as the DOM-selector ban.
- [x] Cards region (`packages/testkit/src/components/cards.ts`) confirmed
      live, additional to the generic API: `getPageInfo()` (shape: {
      rowHeight, recordsPerRow, firstOffset, lastOffset, pageSize,
      pageOffset, scrollOffset, viewOffset }), `firstPage`/`lastPage`/
      `nextPage`/`previousPage`/`gotoPage`/`loadMore`, `getSelectedRecords`/
      `setSelectedRecords`/`selectAll`.
      KNOWN BROKEN, confirmed (not a timing fluke — tested immediately
      after navigation AND after an awaited `refresh()`, both threw the
      same error): `getRecords()` and `getModel()` throw `TypeError: Cannot
      read properties of undefined (reading 'each')` from inside APEX's own
      `modelViewBase.min.js`. Left in the typed API (so the failure is
      visible, not silently absent) but do not treat as working.
- [x] Faceted Search region (`packages/testkit/src/components/faceted-search.ts`)
      confirmed live: `getTotalResourceCount()` returns a real number (24 in
      the ground-truth app) -- but NOT reliably right after navigation. A
      single `await fetchCounts()` then read is NOT sufficient: tested in a
      genuinely fresh Playwright browser context (not a reused/warmed tab)
      and it still returned `null`. FIXED via a real lifecycle-event wait
      (see next entry), not polling.
- [x] APEX lifecycle events `apexbeforerefresh`/`apexafterrefresh` CONFIRMED
      live -- discovered by monkey-patching `$.fn.trigger` to log every
      event actually fired during `ApexFacetsRegion.fetchCounts()`, not
      guessed from docs. Both fire DIRECTLY on the region's own DOM element
      (element id === region id). CRITICAL: these are jQuery custom events,
      NOT native DOM CustomEvents -- a plain
      `element.addEventListener('apexafterrefresh', ...)` was tested and
      confirmed to NEVER fire; only `apex.jQuery(el).on(...)` sees them.
      Waiting for `apexafterrefresh` before reading
      `getTotalResourceCount()` resolved the flakiness deterministically
      (~400ms observed, 3/3 repeated live runs passed). Shipped as
      `callRegionMethodAndWaitForEvent()`/`waitForRegionEvent()` in
      `packages/testkit/src/fixtures/lifecycle.ts` and
      `ApexFacetsRegion.fetchCountsAndWait()`. Scope note: this event-based
      pattern is for "did operation X finish" waits; it does NOT apply to
      the `page.waitForTimeout(1000)` in generated "clean console" specs,
      which waits for late/unpredictable async errors -- a different
      problem with no single completion event.

- [x] SECOND real APEX 26.1 app confirmed available and partially explored:
      "Sample File Upload and Download" (standard username/password login)
      and "Sample Workflow, Approvals, and Tasks" (custom auth scheme --
      login as any employee, no password, using a tree-based user picker
      that turned out to be the standard `t_TreeNav` navigation-menu widget
      reused for this page, NOT a distinct page-content Tree region --
      verified via `apex.region('t_TreeNav')` parent-chain inspection
      before it got documented as a new finding; does not close the "Trees
      as content pattern" gap in docs/ecosystem-roadmap.md Tier 3).
      On the file-upload-download app: `P101_USERNAME`/`P101_PASSWORD`
      CONFIRMED as the real login field ids -- exact match, first
      independent confirmation of this assumption.
      Login submission -- root cause found and corrected once already:
      first diagnosis (one live attempt succeeded using Enter-to-submit,
      then three consecutive attempts failed with the form filled
      correctly, no error/lockout) was "Enter is unreliable" -- so
      `login()` was changed to click the accessible-role submit button
      instead. That change was then run by the user (not Claude --
      credential-based testing is intentionally not repeated by Claude
      itself, see CLAUDE.md) and FAILED THE SAME WAY. Its failure
      screenshot revealed the true cause: the user was already logged in
      on the real post-login dashboard when the check ran -- `login()`'s
      `page.url() === loginUrl` check, sampled once right after
      `waitForLoadState('domcontentloaded')`, is a race condition against
      this app's async/AJAX-driven redirect, independent of submission
      method. Fixed by waiting for an actual URL change
      (`page.waitForURL`, bounded by `timeoutMs`) instead of a single
      point-in-time check. This second fix has NOT been independently
      re-verified live either. `spike/tests/auth-login-verify.spec.ts` is
      the env-var-gated (`APX_LOGIN_TEST_USERNAME`/`APX_LOGIN_TEST_PASSWORD`
      -- neither hardcoded) test ready for whoever has credentials to
      close this out.

- [x] `apex.message` CONFIRMED live as a universal, documented top-level
      API (`showPageSuccess`, `hidePageSuccess`, `showErrors`,
      `clearErrors`, `confirm`, `alert`, `showDialog`, ...).
      `#APEX_SUCCESS_MESSAGE`/`#APEX_ERROR_MESSAGE` are standard DOM
      elements present on every page's template (confirmed: class
      `u-hidden` on a fresh load, before any message ever shown), toggled
      to `u-visible` by the show calls and back to `u-hidden` by the
      hide/clear calls.
      REAL BUG FOUND, same class of mistake as the Cards/login findings:
      do NOT use Playwright's `toBeVisible()`/`toBeHidden()` against these
      elements. Confirmed live: even with `u-visible` correctly applied
      (verified in the same DOM read that showed the class), the element's
      rendered height stayed exactly `0px` -- checked repeatedly over
      1.8s, not a transient animation -- when the message was triggered by
      calling `apex.message.showPageSuccess()`/`showErrors()` directly
      (bypassing a real form submission). Playwright's visibility check
      requires a non-empty bounding box, so `toBeVisible()` reports
      "hidden" regardless of the class; and because the box is *always*
      zero-height in this app/theme, `toBeHidden()` would trivially pass
      even while a message genuinely is showing -- unsafe in both
      directions. Fixed by asserting the `u-visible`/`u-hidden` CLASS
      directly instead of rendered visibility -- shipped as
      `packages/testkit/src/components/messages.ts`
      (`expectSuccess`/`expectError`/`expectNoErrors`/
      `expectNoSuccessMessage`). Verified live, 3 repeated runs, 4/4
      passing each time -- `spike/tests/messages-demo.spec.ts`.

## Still open

- [ ] Comment syntax: none observed anywhere. Assume none until spec says so.
- [ ] Quoting/escaping: no quoted strings observed. What happens when a value
      must contain a leading `[`/`@` or a literal ```? Unknown — needs a
      hostile fixture app.
- [ ] Whether components may legally appear inside `{ }` groups (parser
      tolerates; not observed).
- [ ] `required` property canonical name — build a form with a required item
      and re-export to confirm (`validation.valueRequired` is our guess).
- [ ] Casing rules; property-order significance (assumed none).
- [ ] Region/report types beyond this app (calendar, map, tree...); 18
      component types currently land in `unmodeled` — that list IS the
      typed-projection backlog: action, authentication, authorization, axis,
      breadcrumb, buildOption, column, componentSetting, dynamicAction, facet,
      facetGroup, file, list, lov, pageGroup, process, savedReport, series.

## Fixture policy

`test/fixtures/p00003-employee.apx` is hand-written docs-style (kept for the
lexically-nested variant). The real export is used by integration.test.ts via
a local path and is NOT committed — check redistribution terms before adding
any Oracle-authored export to the repo.
