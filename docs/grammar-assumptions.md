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
- [x] Component identifiers MAY be a quoted, space-containing display string,
      not just a bare token: Oracle's "Sample Interactive Grids" gallery app
      has `column "Row Header" (` for the IG row-selector pseudo-column (11
      occurrences across that export). The original grammar only matched a
      single `\S+` token for the identifier, which silently desynced the
      block parser on this line: the column's own `type`/`layout` props
      leaked onto and OVERWROTE the enclosing region's `type` (corrupting
      `interactiveGrid` into `rowSelector`), and the column's closing `)` was
      consumed as the region's own closer, orphaning everything declared
      after it in that region (a real `next` button, in the reproducing
      case). Fixed: `COMPONENT_OPEN` now accepts `"[^"]*"` as an identifier
      alternative, unquoted before being stored as `ComponentNode.identifier`.
      Regression-guarded in `packages/parser/test/parser.test.ts` (asserts
      zero warnings, the correct unquoted identifier, the region's type
      surviving uncorrupted, and the trailing button not being orphaned) —
      confirmed the test fails all four ways on the pre-fix regex.
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

- [x] THIRD real APEX 26.1 app confirmed available and explored: Oracle's
      own "Sample Interactive Grids" gallery app -- the first LIVE ground
      truth for Interactive Grid this project has had (previously a
      zero-live-ground-truth stub; see `unsupported.ts` history and
      docs/quirks/26.1.json `interactive-grid-widget-factory-api`).
      Standard `@apex-accounts` scheme, `P101_USERNAME`/`P101_PASSWORD`
      confirmed again (third independent confirmation of this convention).
      Two real, load-bearing findings:
      1. **Region identifier != runtime static id, confirmed concretely.**
         The `.apx` export declares `region basic-editing (type:
         interactiveGrid ...)` on page 30; at runtime `apex.region
         ('basic-editing')` returns `null`, while `apex.region('emp')`
         resolves correctly (DOM widget container `#emp_ig`). This
         resolves the long-open "region-id-not-static-id" question from
         speculative to confirmed, at least for Interactive Grid -- see
         docs/quirks/26.1.json. Practical consequence: `@apx/testgen`
         cannot auto-wire an `ApexInteractiveGridRegion` from `.apx`
         metadata alone; the real static id must be discovered from the
         live DOM by hand.
      2. **`security.pageAccessProtection: argumentsMustHaveChecksum`
         blocks bare `page.goto()` navigation, even post-login.** Right
         after a successful, verified `login()`, landing on
         `.../home?session=<id>` is genuinely authenticated -- but a
         subsequent bare `page.goto()` to ANY page (including that exact
         same `/home` URL, with or without the `session=` param) silently
         redirects to `/login` (HTTP 200, not an error). Only real in-app
         link clicks (which carry APEX's own embedded checksum) preserve
         the session. This is a real, correctly-functioning APEX security
         feature, not a bug -- but it means `gotoApexPage()`'s bare-goto
         navigation strategy will not work against pages configured this
         way; reaching them requires clicking through the actual UI. See
         docs/quirks/26.1.json `page-access-protection-blocks-bare-navigation`.
      Verified Interactive Grid API surface (via
      `apex.region(id).widget().interactiveGrid(method)`, the jQuery
      UI widget-factory pattern -- NOT the direct `region[method]()` shape
      IR/Cards use): `getActions()` (a real `apex.actions` instance),
      `getViews()` (`{grid, chart}`), `getCurrentView()`, `getCurrentViewId()`
      (a string), `getSelectedRecords()` -- all confirmed working, 3/3
      repeated live runs. Confirmed REJECTED with a clear "no such method"
      error: `model`, `view`, `getRegion`. Also confirmed, a genuine
      contrast with IR/Cards: `apex.region(id).call(action)` DOES work for
      Interactive Grid (`refresh`/`getSelectedRecords`/`getActions` all
      succeeded), unlike IR/Cards where every tested `.call()` action was
      rejected with "Call not supported." Shipped as
      `ApexInteractiveGridRegion` in
      `packages/testkit/src/components/interactive-grid.ts`, verified via
      `spike/tests/interactive-grid-demo.spec.ts` (3/3 repeated live runs).

- [x] FOURTH real APEX 26.1 app confirmed available and explored: Oracle's
      own "Sample Charts" gallery app -- the first LIVE ground truth for
      Chart this project has had. Same `@apex-auth` scheme and
      `pageAccessProtection: argumentsMustHaveChecksum` pattern as Sample
      Interactive Grids (navigate via real UI clicks, not `page.goto()`).
      Two significant findings:
      1. **Region identifier != runtime static id, confirmed a SECOND
         time on an independent widget type.** Export declares `region
         area-chart-color-javascript-code-customization (type: chart
         ...)`; at runtime the real static id is `area1` (widget
         container `#area1_jet`). This broadens the earlier Interactive
         Grid-only finding to "confirmed on two independent region
         types" -- see docs/quirks/26.1.json.
      2. **`apex.region(id).widget()` returns `null` for chart regions --
         a real structural difference from Interactive Grid/Cards/IR,
         where it returns a real jQuery-wrapped element.** The actual
         jQuery UI widget-factory plugin for Oracle JET charts is
         `ojChart` (confirmed present in `jQuery.fn`), attached directly
         to the JET container element, NOT reachable through
         `region.widget()` at all. Confirmed live via
         `apex.jQuery('#area1_jet').ojChart(method)`: `refresh` and
         `getContextByNode` are callable (the latter returns `null` with
         no arguments); `getProperty`/`getOption` are confirmed NOT valid
         method names ("no such method" errors).
      Most valuable finding: the ALREADY-EXISTING generic `ApexRegion`
      class (region.ts) works cleanly against chart regions --
      `new ApexRegion(page, 'area1').refresh()` confirmed live, 3/3
      repeated runs, no new component code required. No dedicated
      `ApexChartRegion` was built -- the two confirmed `ojChart` methods
      weren't compelling enough alone to justify one (matching this
      project's restraint principle: verified-and-useful, not
      verified-for-its-own-sake). Verified via
      `spike/tests/chart-demo.spec.ts`.

- [x] Dynamic Actions promoted to a TYPED AST field (`ApexPage.
      dynamicActions: ApexDynamicAction[]`) -- parser-only work, no live
      app needed, evidenced by Oracle's own "Sample Dynamic Actions"
      gallery app (27 pages, 329 real dynamicActions parsed across all 13
      real exports this project has). Real, consistent grammar: `when {
      selectionType: items|button|region|..., items/button/region: ...,
      event: <name> }` (trigger), an optional `clientSideCondition {
      type: item=value|item!=value|item>value|itemIsNull|itemIsNotNull|
      jsExpression, item, value }` (confirmed many DAs have NO condition
      block at all -- unconditional, not a gap), and one or more nested
      `action <id> ( action: <name>, execution.fireWhenEventResultIs:
      bool )` children forming true/false-action lists. Real, enumerable
      action vocabulary observed: disable, enable, show, hide, setValue,
      addClass, removeClass, setStyle, setFocus, alert, confirm, refresh,
      executeJsCode, executeServerSideCode, redirectThisApp,
      definedByDynamicAction, plus namespaced plugin actions
      (`plugin/timer`, `plugin/stripeReport`, ...). Real, specific event
      names observed beyond generic ones: component-namespaced custom
      events like `region/interactiveGrid/interactivegridselectionchange`,
      `region/calendar/apexcalendardateselect`,
      `region/map/spatialmapobjectclick`,
      `region/tree/treeviewselectionchange`,
      `item/plugin-slider/slidechange`,
      `dynamicAction/plugin-timer/timer_expired` -- real ground truth for
      future lifecycle-wait work (see `lifecycle.ts`), not yet acted on.
      IMPORTANT scoping note: the component type name `action` is
      OVERLOADED in the grammar -- a `dynamicAction`'s nested `action`
      children (DA steps) are a different construct from a stand-alone
      page-level `action` nested directly inside a `region` (a row-level
      action alongside `column` nodes, e.g. `position: fullRowLink` on a
      Cards/List region) -- confirmed both exist, only the former is
      typed now; the latter is untouched and still correctly reported in
      `unmodeled`. Wired into `apx-diff` (`diffDynamicActionFields`,
      including a nested by-identifier diff of the actions list) --
      verified with a real before/after mutation (clientSideCondition
      value change + an affected item change) correctly detected both the
      typed field change and the untyped raw-bag change on the affected
      sub-action. Regression-guarded in `packages/parser/test/
      parser.test.ts` (4 new tests: no warnings, trigger + condition
      projection, nested action projection including
      fireWhenEventResultIs, and the unconditional-DA case).

- [x] Calendar region `settings {}` promoted to a typed field
      (`ApexRegion.calendarSettings`, gated on `type === 'calendar'` since
      `settings.*` is reused by other region types for unrelated config).
      Real, consistent shape confirmed across 21 calendar regions in
      Oracle's own "Sample Calendar" gallery app: `displayColumn`,
      `startDateColumn`, `endDateColumn`, `pkColumn`, `showTime`,
      `calendarViewsAndNavigation` (normalized to `views: string[]`,
      real values observed: day, week, month, list, navigation), and
      `dragAndDrop` (confirmed `true` on the two drag-and-drop demo pages,
      `null` elsewhere). Other `settings.*` keys observed but NOT typed
      (stay in `raw`): `additionalCalendarViews`, `dragAndDropPlsqlCode`,
      `initJavaScriptFunction`, `firstHour`, `maxEventsDay`,
      `multipleLineEvents`, `showWeekend`, `escapeSpecialChars`, `cssClass`.
      Parser-only work, no live app needed. Regression-guarded with 2 new
      tests (calendar region gets the typed field; a non-calendar region
      with its own unrelated `settings` group does NOT).

- [x] **REAL, WIDE-REACHING PARSER BUG FOUND AND FIXED** while building the
      above: `parseArray()`'s line-advancement logic double-counted the
      property line's own `i++` (already done by the caller,
      `parseBody`'s PROPERTY branch, before `parseValue()`/`parseArray()`
      ever runs) against its own unconditional `i++` on the first loop
      iteration. This silently dropped a real content element in TWO
      shapes: (1) `foo: [` with NOTHING inline (array's first element,
      each item and the closing `]` each on their own line) -- confirmed
      `templateOptions: [` in exactly this shape appears **1550+ times**
      across every real export this project has parsed, meaning
      `#DEFAULT#` -- almost always the FIRST templateOption -- was
      silently missing from parsed `raw` bags project-wide, the entire
      time, until this fix; and (2) `foo: [bar` (first element inline
      with the bracket) continued across further lines -- dropped the
      first FULL continuation line instead (confirmed live has ZERO
      occurrences across every real export parsed so far -- a real bug,
      but purely latent until a hostile fixture exercised it). Root cause
      for both: `i` already points at the correct next line the moment
      `parseArray` starts, regardless of whether inline content followed
      `[`; only advance `i` when a chunk was actually read via `lines[i]`
      -- exactly what `consumedLine` already tracks, and exactly the
      guard the `end >= 0` branch already used for the closing-bracket
      case. Fixed by using that identical guard symmetrically for the
      `end < 0` branch. Regression-guarded with 3 new tests covering all
      three array shapes (bracket-alone, first-token-inline, single-line)
      -- confirmed the two multi-line tests fail without the fix.
      Verified zero regressions: all 13 real exports still parse/generate
      with zero warnings, deterministic output, and the committed
      `examples/employee-page` output is byte-identical (that fixture has
      no array-valued properties, so it was never exposed to either bug
      shape, consistent with the fix only changing previously-wrong
      behavior).

- [x] **Official grammar reference obtained and cross-checked for the
      first time**: Oracle's own published APEXlang EBNF
      (docs.oracle.com/en/database/oracle/apex/26.1/apxln/apexlang.ebnf,
      11,700+ lines, every component). Fetched the raw file directly via
      `curl`, not through an AI-summarizing fetch tool -- confirmed the
      summarized version had HALLUCINATED a `@{component-id}` reference
      form that doesn't exist anywhere in the real grammar (it misread
      the EBNF's own `{ X }` = "zero or more X" meta-notation as literal
      syntax; the real rule is just `<reference> ::= "@" {
      <reference-character> }`). See CLAUDE.md for the standing
      instruction to check this reference before extending the parser,
      and to always fetch it raw.
      Cross-checked against `dynamicAction` (this project's most recently
      typed component) and found it fully, precisely documented --
      confirmed two real gaps in what this project had typed:
      `when.customEvent` (populated specifically when `event ===
      'custom'`; confirmed live, 7 real occurrences across 2 exports:
      `event: custom` / `customEvent: apexendrecordedit` and similar) and
      `action.name` (a nested action's own optional display name,
      distinct from the parent dynamicAction's `name`; confirmed live,
      56/509 real actions across every export this project has parsed).
      Both added to `ApexDATrigger`/`ApexDAAction` and wired into
      `apx-diff`, verified against real data (exact counts matched: 7 and
      56) and regression-guarded with 2 new tests.
      Also confirmed genuinely NOT in the official grammar, despite being
      real and live-verified: `ApexRegion.calendarSettings`'s properties
      (`displayColumn`, `startDateColumn`, `endDateColumn`, `pkColumn`,
      `showTime`, `dragAndDrop`) -- confirmed absent by direct search
      (`grep` for each exact property name across the whole 11.7k-line
      file), not a sampling miss. This is the same "docs can be wrong or
      incomplete, verify against real exports" lesson this project has
      hit before (the M0 lesson), now demonstrated against Oracle's OWN
      published reference, not just simplified doc excerpts -- the
      official EBNF is authoritative for what it covers, but "covers
      everything" was never a safe assumption, confirmed by this specific
      gap.
      Also confirmed by the official grammar, not yet acted on: comment
      syntax (`//` line comments, `/* */` block comments) IS real,
      first-class grammar -- see the "Still open" entry below, now
      updated from "unconfirmed" to "confirmed real, zero real-world
      occurrences so far."

## Still open

- [ ] Comment syntax: CONFIRMED real per Oracle's official EBNF
      (`<comment> ::= "//" { <any-character-except-newline> } <line-end> |
      "/*" { <any-character> | <nl> } "*/"`), not just an assumption
      anymore -- but still zero real occurrences across all 13 real
      exports this project has parsed (the ~40 `//`/`/*` matches found
      during that check were all false positives: JS/PLSQL comments
      embedded INSIDE fenced multiline-string code blocks, e.g.
      `` ```javascript-browser // Update Badge Text ``` ``, which this
      parser's `tryFence()` already captures correctly as opaque text --
      not top-level APEXlang comments at all). Not implemented: this
      project's discipline is to build against real occurrences, not
      well-specified-but-unencountered ones; revisit if a real export
      ever actually contains one (the parser would currently emit
      "Unrecognized line" warnings for it, fail loudly rather than
      silently misparse).
- [ ] Quoting/escaping in PROPERTY VALUES specifically: no quoted values
      observed. What happens when a value must contain a leading `[`/`@` or a
      literal ```? Unknown — needs a hostile fixture app. (Quoted, space-
      containing component IDENTIFIERS are now handled — see "Verified"
      above; this item is narrower than it used to be.)
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
