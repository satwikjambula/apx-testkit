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

- [x] **Full audit of every currently-typed AST field against the
      official EBNF** (prompted directly: the first pass above only
      checked `dynamicAction`/calendar because those were freshest, not
      for any principled reason -- this pass covers everything else).
      Checked `<page>`, `<region>`, `<page-item>`, `<button>` productions
      in full, not just keyword grep:
      - `ApexPage.alias`/`name`/`title` -- exact match, all three are
        `<page-direct-property>` string-like values.
      - `ApexItem.label`/`required`/`sourceColumn` -- exact match:
        `label.label`, `validation.valueRequired`, `source.column`.
      - `ApexButton.label` -- exact match, a direct property (not
        grouped). `ApexButton.action` -- confirmed correct
        (`behavior.action`, enum: submitPage/triggerAction/
        redirectThisApp/redirectOtherApp/redirectUrl/
        definedByDynamicAction/resetPage/nextPage/previousPage) --
        this project's fallback to a bare top-level `action` property
        (`?? str(n.props['action'])`) is confirmed to never fire in any
        real export (grep across all 13 -- zero bare top-level `action:`
        on any button), harmless extra leniency, not a bug.
      - `ITEM_TYPES = new Set(['pageItem', 'item'])` -- the official
        grammar names the component ONLY `pageItem`; there is no
        standalone `item` production anywhere in the 11,700-line file.
        Confirms the pre-existing note ("docs example was simplified")
        as definitively correct: accepting bare `item` is harmless,
        defensive leniency for a form that has never once appeared in
        real data, not a hedge against something real.
      - **`ApexRegion.source.sql` -- REAL BUG FOUND AND FIXED.** The
        parser read `source.sql`, but the grammar's actual property name
        is `sqlQuery` (`region-source-property ::= "sqlQuery" ":" <ws>
        <multiline-string> ...`) -- meaning `region.source.sql` was
        silently `null` for EVERY SQL-backed region, always, since this
        field was first added. The committed test fixture (a table-based
        form) never exercises `sqlQuery` at all, which is exactly why
        this went unnoticed -- confirmed zero downstream consumers ever
        relied on it either (grepped the whole codebase), so the
        practical impact was zero, but the field itself has never worked.
        Also confirmed live: `sqlQuery` appears BOTH as a bare
        single-line string AND as a fenced multiline block, despite the
        grammar typing it as `<multiline-string>` only -- fixed with a
        new `multilineText()` helper that handles both shapes. Verified
        against real data: 245 of 1069 real regions with a `source` block
        now correctly get `sql` populated (previously 0, always).
        Regression-guarded with 2 new tests (fenced and bare-inline
        shapes). Zero regressions: all 13 real exports still
        parse/generate cleanly, committed `examples/employee-page` output
        byte-identical (that fixture is table-based, never touches this
        path either way).
      - `<region-group-block>`'s full list of ~55 named sub-groups was
        checked structurally (not just grepped for property names) for
        anything calendar-related -- confirmed NONE exists. This
        reconfirms, more rigorously than the earlier keyword-grep pass,
        that `ApexRegion.calendarSettings`'s real properties genuinely
        have no home anywhere in the official grammar, not just under an
        unexpected name.

  - [x] Chart region `chart { type: ... }` group promoted to a typed field
        (`ApexRegion.chartSettings`, gated on `region.type === 'chart'`,
        same pattern as `calendarSettings`).
      - Checked the FULL `region-chart-property` production (not just the
        `type` keyword) plus the sibling `region-chart-appearance-property`
        and `region-chart-layout-property` productions, per the
        just-updated CLAUDE.md instruction to check complete productions,
        not narrow keyword greps. `type` is the only property with clear
        testing value; `chartAppearance`/`chartLayout` and the
        `axis`/`series`/`column` sub-components are font/color/position/
        scaling styling with no assertion value -- left in `raw`/
        `unmodeled`, documented as a deliberate scope decision in the
        `ApexChartSettings` doc comment (not an oversight).
      - `type` enum confirmed against the official EBNF: 17 values (area,
        bar, boxPlot, bubble, combination, statusMeterGauge, donut, funnel,
        gantt, line, lineWithArea, pie, polar, pyramid, radar, range,
        scatter, stock).
      - Real, consistent shape confirmed across all 97 chart regions in
        Oracle's own "Sample Charts" gallery app, plus 10 more chart
        regions found across other real exports checked this project
        (107 total).
      - Confirmed live/structurally: 16 bar-chart regions in "Sample
        Charts" have the `chart {}` group entirely OMITTED from the
        export -- `bar` is the implicit default when the group is absent,
        not missing data. Represented directly as `'bar'`, not `null`, so
        nothing downstream has to re-derive the omission-means-bar
        convention itself. 23 of the 107 real chart regions across all
        exports defaulted this way.
      - Parser-only work, no live running app needed (this is static
        export metadata, distinct from the separately-tracked runtime
        `Chart` component stub in `unsupported.ts`, which remains
        unbuilt/unverified for actual runtime behavior).
      - Regression-guarded with 3 new tests (explicit type, omitted-group
        default, non-chart region stays `null`) -- 26 total parser tests,
        all passing. `diff.ts` updated in the same pass to diff
        `chartSettings` (and `calendarSettings`, which had been typed
        earlier but never wired into the differ -- a real gap this pass
        also closed).

- [x] **Re-verification pass, `apextogo`, 2026-07-24** -- a fresh copy of
      this app's export zip was supplied and re-parsed independently of
      the existing corpus entry (not a first-time addition; `apextogo` was
      already one of the 13 real local exports). Findings:
      - The freshly-unzipped export is **byte-identical** to the
        already-held local copy (`diff -rq` across every file: zero
        differences). This is the same export data as before, not updated
        or re-exported Oracle content -- so no region/DA/item counts could
        plausibly have changed, and none did.
      - Zero-warnings parse confirmed again: 28 files loaded
        (`application.apx`, `page-groups.apx`, 18 `pages/*.apx`, 8
        `shared-components/*.apx`), `parseApp()` warnings array empty.
      - **Region count correction to the task framing**: this app has
        **54 regions** across 18 pages, not 14 -- the "14" that
        exists in `docs/component-coverage-matrix.md` for `apextogo` is
        the **Dynamic Actions** count (confirmed exactly: 14 parsed
        `dynamicActions` this pass, matching that table's Dynamic Actions
        section precisely). The coverage matrix has never claimed a
        14-region figure for this app; there is no per-app region-count
        row in that doc at all, only aggregate app-count ratios. Flagging
        this so the "14 regions" framing isn't repeated as fact elsewhere.
      - Region types confirmed present (by count): `staticContent` (32),
        `themeTemplateComponent/contentRow` (7), `cards` (9),
        `classicReport` (3), `regionDisplaySelector` (1), `map` (1),
        `list` (1). No `chart` and no `interactiveGrid` regions exist in
        this app at all -- confirmed by exhaustive type enumeration, not a
        sampling gap. All seven types were already accounted for in
        `docs/component-coverage-matrix.md` (individually or under the
        `themeTemplateComponent/*` aggregate bucket); nothing new to add
        to that table.
      - `map` region reconfirmed present (`MY-ADDRESS` page, region
        `location-map`) -- re-confirms the existing `MapRegion` stub
        reason in `packages/testkit/src/components/unsupported.ts`
        ("confirmed present in real exports (apextogo,
        sample-application-search)"); still zero live ground truth, no
        change to that stub's status.
      - **`advanced { htmlDomId: ... }` cross-check (ADR-003), as
        specifically requested**: `apextogo` has **zero** Chart or
        Interactive Grid regions, so it does NOT provide a third
        real-app data point for the Chart/IG runtime-id-prediction claim
        that ADR-003 documents -- that claim remains confirmed on exactly
        two apps/widget types (Sample Charts, Sample Interactive Grids),
        unchanged by this pass. What this app DOES show: `htmlDomId` is
        set on 4 of its 54 regions, and none of them is Chart or IG --
        literal evidence:
        `pages/p00000-global-page.apx`: `region search (type:
        staticContent ...) advanced { htmlDomId: SearchDialog }` and
        `region search-restaurants (type: themeTemplateComponent/
        contentRow ...) advanced { htmlDomId: SearchRestaurants }`;
        `pages/p00008-cart.apx`: `region cart (type:
        themeTemplateComponent/contentRow ...) advanced { htmlDomId:
        CartRegion }` and `region total (type: classicReport ...)
        advanced { htmlDomId: CartTotal }`. This confirms `htmlDomId` is a
        genuinely generic `region-advanced-property` used across region
        types in real exports, consistent with its EBNF production not
        being Chart/IG-specific -- but it is NOT new evidence for the
        runtime-id-prediction mechanism itself, since that mechanism was
        only ever confirmed (and only claimed) for Chart (`_jet`) and IG
        (`_ig`) widget containers; no live instance of `apextogo` exists
        to check what, if anything, `htmlDomId` predicts for
        `staticContent`/`themeTemplateComponent`/`classicReport` regions.
        Left as an open question, not assumed to generalize.
      - Determinism reconfirmed for this app specifically: `parseApp()`
        run twice produced byte-identical JSON (`shasum -a 256` match);
        `apx-testgen` run twice into separate output directories produced
        byte-identical generated files (`diff -rq`: zero differences,
        "Generated 17 page object(s) + spec(s) (13 marked skip: auth
        required)" both times); `apx-diff` self-diff
        (`apextogo` against itself) reported "0 added, 0 removed, 0
        changed, 17 unchanged."
      - Full regression sweep re-run: all four packages build clean,
        `npm test` green (29 parser tests + 5 testkit tests, plus 5
        integration tests correctly skipped -- gated on the separate
        UX Pattern Catalog ground-truth path, unrelated to this app),
        `spike/` typechecks clean, `examples/employee-page` regenerates
        byte-identical to the committed fixture, and all 13 real local
        exports (this fresh `apextogo` plus the other 12 held locally)
        parse with zero warnings, zero total.
      - Net result: no repo documentation needed a factual correction --
        `docs/component-coverage-matrix.md` and
        `.ai/knowledge/verification.md` already correctly describe this
        app (static-only, no live access, region types already tabulated)
        and were left unchanged. This entry exists per this project's own
        rule that a clean, uneventful re-parse is still evidence worth
        recording, not nothing.

- [x] **`htmlDomId` region-id resolution generalized from Chart/Interactive
      Grid to ALL region types -- a correction, not just an extension.**
      While building an auto-generated "region resolves" assertion for
      Interactive Report/Cards/Faceted Search (assumed safe because their
      export identifier had matched the runtime id in every app checked
      so far), a real counter-example turned up: `sample-charts` page 13
      has an `interactiveReport` region declared as `region projects (
      type: interactiveReport ... advanced { htmlDomId: projects_report }
      )`. Confirmed live: `apex.region('projects')` -> `false`;
      `apex.region('projects_report')` -> `true`. The earlier "IR/Cards/
      Facets always match" claim (in ADR-003 and `docs/quirks/26.1.json`
      `region-id-not-static-id`) was wrong, based on incomplete sampling,
      and both are corrected in place with this finding.
      - A full sweep of the 13-app local corpus: 6/86 (~7%)
        `interactiveReport`/`cards`/`facetedSearch` regions have
        `htmlDomId` set (5 IR, 1 Cards, 0 Faceted Search) -- confirmed a
        real, if minority, pattern, not a one-off fluke.
      - Also confirmed: unlike Chart/IG's OWN internal widget-factory
        dispatch (which additionally appends `_jet`/`_ig` to reach a
        nested widget container), plain `apex.region(id)` resolution uses
        `htmlDomId` VERBATIM, no suffix -- `apex.region('area1')` (no
        suffix) already resolved the region itself in earlier Chart work;
        the suffix is specific to Chart/IG's nested widget lookup, not
        generic region resolution.
      - `packages/testkit/src/components/region.ts` gained
        `expectRegionsResolve()` -- a safe pass/fail assertion for
        `interactiveReport`/`cards`/`facetedSearch` specifically (all
        three confirmed live to resolve as widget regions; `form`/
        `staticContent` confirmed NOT to, by design). `@apx/testgen` now
        auto-emits this per page, resolving each region's id as
        `htmlDomId ?? identifier` (ADR-003's layered strategy, now
        correctly generalized), with an explicit comment listing which
        other region types on that page were skipped and why.
      - Live-verified via direct manual browser evaluation against the
        real `sample-charts` Interactive Report page (reachable only via
        a drill-down path, not a stable nav link, and itself declares
        `pageAccessProtection: argumentsMustHaveChecksum` -- scripting a
        reliable Playwright click path was not attempted this pass; the
        underlying mechanism is the identical `apex.region(id)` check
        already scripted and passing for Chart/IG elsewhere).
      - Regenerated `examples/employee-page` and all 13
        `examples/verified-apps/` outputs to match; zero warnings across
        all 13 real exports; determinism reconfirmed (regenerate twice,
        byte-identical).

- [x] **Chart/Interactive Grid auto-wiring (item 3/3 of the auto-assertions
      scope) + two real bugs found and fixed along the way.**
      `@apx/testgen` now emits, per page, a test per Chart/Interactive
      Grid region whose `htmlDomId` is set (ADR-003 layer 1): Chart gets a
      live type-resolution check; Interactive Grid gets a
      `getCurrentViewId()` check. Regions without `htmlDomId` are listed
      in the generated file's header comment as explicitly skipped (ADR-003
      layer 3 -- genuinely unconstructible from static data), never a
      silent omission.
      - **Real bug #1, found while starting this item**: CI has been
        failing on every push since a prior commit (`d1b5702`, before this
        session) renamed the generator's test fixture from `mini-export`
        to `reference-fixtures` without updating
        `.github/workflows/ci.yml`, which still referenced the old path.
        Confirmed via `gh run list` (last 5 runs all "failure") and the
        failure log ("Export directory not found"). This means the CI
        badge added to README earlier this session was accurately
        showing red. Fixed by updating the path; verified by running
        every CI step locally end-to-end.
      - **Real bug #2**: `coverage.ts`'s `summarizeRegions()` matched a
        recorded region touch only against the `.apx` export identifier,
        never `region.htmlDomId`. Per ADR-003, `recordCoverageTouch`
        logs the RUNTIME id (`htmlDomId ?? identifier`), so any region
        with an `htmlDomId` override was silently under-reported as
        untouched even when genuinely exercised -- confirmed on real
        Chart, Interactive Grid, AND Interactive Report regions this
        session (three region types, not the two originally suspected).
        Fixed by matching against `r.htmlDomId ?? r.identifier` while
        still displaying the export identifier in the report. Verified
        against the REAL touch logs captured earlier this session
        (`spike/tests/chart-demo.spec.ts`,
        `interactive-grid-demo.spec.ts`) -- previously-"untouched"
        regions now correctly show touched. `@apx/testgen` never had a
        test runner before this; added `vitest` (matching parser/testkit's
        version) and 5 regression tests, wired into CI as its own step.
      - **Real finding #3, discovered while building the Chart
        auto-assertion**: APEX's declarative chart type does NOT always
        equal the live JET widget's reported type. A region declaring
        `chart { type: donut }` (`sample-charts`, `donut-chart-sorting`,
        runtime id `donut1` via `htmlDomId`) reports
        `getOption('type') === 'pie'` live, confirmed directly. Root
        cause, also confirmed live: Oracle JET's `ojChart` widget has no
        separate "donut" type at all -- APEX's donut is JET's `pie` type
        plus a nonzero `styleDefaults.pieInnerRadius`. `pie` and `area`
        were separately confirmed to report their declared type
        verbatim, but that's not exhaustive across the 17 declared enum
        values. Consequence: the auto-generated Chart assertion checks
        that the live type resolves to a real, non-empty string --
        deliberately NOT an exact-match assertion against the declared
        `chartSettings.type`, since that would have asserted more than
        verified (ADR-004). Documented in `docs/quirks/26.1.json`
        `chart-declared-type-not-runtime-type`.
      - Live-verified: `spike/tests/chart-demo.spec.ts` gained two new
        tests (the auto-generated pattern replicated exactly, and a
        dedicated correction test proving the donut→pie mapping plus
        `styleDefaults.pieInnerRadius`), both passing. Interactive Grid's
        `getCurrentViewId()` auto-generated pattern was already covered
        by the pre-existing `interactive-grid-demo.spec.ts` live spec --
        no new test needed there.
      - Regenerated `examples/employee-page` and all 13
        `examples/verified-apps/` outputs; full test suite green
        (parser 29, testkit 5, generator 5); spike typechecks clean;
        determinism reconfirmed; zero warnings across all 13 real
        exports.

- [x] **First non-Oracle real apps added to the corpus:
      `ujnak/APEXlang-exports` (11 apps, MIT licensed).** Beyond Oracle's
      own sample gallery (13 apps + UX Pattern Catalog), this project
      now also parses 11 small, independently-authored real apps from
      `github.com/ujnak/APEXlang-exports`: `CSP-REPORT`,
      `XLIFF-TRANSLATE`, `draw-polygon-on-map`, `driving-with-apex`,
      `employee-management`, `get-table-info-by-apex-db-dictionary`,
      `menu-popup-with-action`, `salary-management-agent`,
      `sample-terminal-emulator`, `test-button-show-as-disabled-261`,
      `world-diner`. Confirmed genuine APEXlang 26.1 format
      (`mmdVersion 26.1.0+3102`, matching the rest of the corpus,
      confirmed by direct file fetch before cloning) and MIT license
      (confirmed via the repo's own LICENSE file) before adding.
      - Parsed all 11 with `@apx/parser` — **zero warnings**, matching
        the existing 13-app corpus. No new region or component types
        found (all 8 region types seen — breadcrumb, classicReport,
        form, interactiveGrid, interactiveReport, list, map,
        staticContent — and all 4 unmodeled component types — column,
        layer, process, savedReport — were already known).
      - Confirmed the parser handles a real non-ASCII/Unicode region
        identifier correctly: `menu-popup-with-action` has a region
        named `ジョブのリスト` ("job list" in Japanese).
      - **New finding**: `advanced { htmlDomId: ... }` confirmed present
        in real static export data on two region types never checked for
        it before — `map` (`draw-polygon-on-map`, region `map` →
        `htmlDomId: MAP`) and `classicReport`
        (`menu-popup-with-action`/`salary-management-agent`, region
        `employees`/`employees_1` → `htmlDomId: EMP`). This is a
        *static* confirmation only (no live instance available for these
        apps to verify actual runtime resolution) — recorded as such in
        `docs/quirks/26.1.json` `region-id-not-static-id`, distinct from
        the live-confirmed cases (Chart/IG/Interactive Report).
      - Determinism confirmed on all 11 (generate twice, byte-identical);
        `apx-diff` self-diff spot-checked on 3, all report zero changes.
      - Regenerated `docs/component-coverage-matrix.md` in full (13→24
        apps — every ratio recomputed, not just appended, to avoid a
        mixed-denominator table) and `.ai/knowledge/verification.md`
        (new "Non-Oracle real apps" section). Also recorded two more
        genuine 26.1-format apps found in the same research pass but
        NOT added — `maniltns/ojas-apex-varient` (AI-generated POC
        content, not a real business app) and `ShayneJaya/customer-
        portal` — both blocked on having no license at all (all-rights-
        reserved by default), pending the author's explicit permission.

- [x] **21 more real apps added: 18 from `github.com/oracle/apex`'s `26.1`
      branch (UPL-1.0) + 3 independent apps (Apache-2.0/MIT).** Corpus now
      45 real apps (was 24). Full details, per-app breakdown, and license
      evidence in `.ai/knowledge/verification.md`. Parser/grammar-specific
      findings from this pass:
      - **44/45 apps parse with zero warnings.** `strategic-planner` is
        the sole exception — 8 warnings, all "Unrecognized line", all in
        `link.target.items` blocks. This is the first app in this
        project's entire corpus that does NOT parse cleanly.
      - **Genuinely new construct found and cross-checked against the
        full relevant EBNF production (not a narrow grep)**: a quoted
        string used as a property KEY inside an `items { }` group, where
        the quoted string itself embeds `#substitution#` tokens, paired
        with a bare (unquoted) `#substitution#` token as the VALUE.
        Literal evidence (`pages/p00003-project-details.apx:2154`):
        ```
        link {
            target: {
                page: #EDIT_PAGE#
                items: {
                    "P#EDIT_PAGE#_ID": #DOCUMENT_ID#
                }
                clearCache: #EDIT_PAGE#
            }
        }
        ```
        Seven more occurrences of the identical shape across
        `pages/p00003-project-details.apx` and
        `pages/p00094-initiative.apx` (both `strategic-planner`). This is
        a real, dynamically-computed page-item name (`P` + the
        destination page-number substitution + `_ID`) used as a
        column-link target item — genuinely new, not seen anywhere else
        in this project's 45-app corpus (confirmed by grep across the
        entire corpus for the same `": #` pattern — zero matches
        elsewhere).
      - **Full-production EBNF cross-check performed** (curled the raw
        `.ebnf` directly, per ADR-004 — not a narrow grep): searched every
        `"target" ":" <ws> <value>` production (11 occurrences, all typed
        `LINK`) and confirmed the grammar treats `target`/`LINK` as an
        opaque `<value>` everywhere — it does NOT define the internal
        `page`/`items`/`clearCache`/`anchor` object-literal shape at all.
        The grammar is SILENT on this internal structure, the same way it
        was already found silent on `calendarSettings` — real data is the
        authority here per ADR-004, and real data confirms the quoted
        substitution-key shape is genuine, reproducible APEXlang, just
        not one the current `PROPERTY` regex (`/^([A-Za-z0-9_][\w-]*)\s*:
        \s*(.*)$/`, requiring a bare-identifier-style key) recognizes.
        Root cause is precisely diagnosed (the regex's key-character
        class), but NOT fixed in this pass — filed to `/parser` per the
        new-verification-app checklist ("any warning here is a real
        parser gap... immediate handoff to /parser, not something to
        route around"). Added to "Still open" below.
      - **Genuinely new region types**: `reflowReport`,
        `columnToggleReport`, `helpText` (all `universal-theme-reference`
        — a dedicated Universal Theme showcase app, so new UI-pattern
        types here are expected), and a brand-new type-name PREFIX,
        `appTemplateComponent/contentRowSimple` (`strategic-planner`,
        pages `p00117-release2.apx`/`p00141-documents1.apx`) — the first
        confirmed instance of an `appTemplateComponent/*` namespace
        anywhere in this project's corpus, distinct from the
        already-known `themeTemplateComponent/*` prefix. All four remain
        untyped (fall into `unmodeled`/`raw` per ADR-001 — real signal
        for the typed-projection backlog, not typed this pass, no clear
        testing value identified yet).
      - **Genuinely new item types**: `combobox`, `colorPicker`,
        `percentGraph`, `textFieldWithAutocomplete`, `displayMap`,
        `listManager`, `qrCode`, `selectMany`, `starRating`,
        `stopAndStartGridLayout`. Cross-checked against the EBNF's
        `page-item-direct-property` production: `"type" ":" <ws>
        <string-like-value>` (* type: SUPPORTED UI *) — the grammar
        deliberately does NOT enumerate the allowed values (unlike, e.g.,
        `chart.type`'s 17-value enum), so new item-type strings surfacing
        with each new app is expected, real-data-driven behavior per
        ADR-004 (grammar silent, real data fills the gap), not a
        contradiction of anything previously assumed.
        `stopAndStartGridLayout` specifically is a layout pseudo-item
        (Universal Theme grid row start/stop marker), not a data-bearing
        field — confirmed via `pageItem P7_SS ( type:
        stopAndStartGridLayout )` in `customers` (also present in
        `team-calendar`).
      - **`tree` region type CORRECTED, not just extended** (see
        `.ai/knowledge/verification.md` and
        `docs/component-coverage-matrix.md` for the full evidence): three
        genuine content Tree regions found this batch (`sample-trees`,
        `universal-theme-reference`, `cloud-apps-rest-explorer`),
        overturning the prior "not a distinct content pattern, just
        `t_TreeNav` nav-widget reuse" framing from the earlier
        `sample-workflow-approvals` finding (recorded further up this
        file, "Sample Workflow, Approvals, and Tasks" entry). Both framings
        are left visible in this file per this project's correction
        discipline — the earlier finding was correct for the ONE instance
        it was based on (the workflow-approvals login picker genuinely IS
        `t_TreeNav` reuse), it was the generalization ("not a distinct
        content pattern", full stop) that was wrong.
      - **`htmlDomId` (ADR-003) confirmed present in real static export
        data on 22 more region types** never checked for it before in this
        project's corpus: `staticContent`, `list`, `plugin/badgeList`,
        `themeTemplateComponent/contentRow`, `plSqlDynamicContent`,
        `regionDisplaySelector`, `themeTemplateComponent/comments`,
        `breadcrumb`, `dynamicContent`, `cards`, `facetedSearch`,
        `smartFilters`, `plugin/componentInstructions`, `search`,
        `reflowReport`, `columnToggleReport`,
        `themeTemplateComponent/avatar`, `mediaList`, `timeline`,
        `metricCard`, `flexboxContainer`, `plugin/html5BarChart`,
        `plugin/tagCloud` — plus a much richer count on `map` (11/18 map
        regions in `sample-maps` alone, vs. the single prior instance from
        `ujnak/draw-polygon-on-map`). All static-only (no live instance
        available for any of these 21 apps) — nothing contradicts
        ADR-003's "universal mechanism, not gated to specific types"
        finding; this substantially strengthens it. Recorded in
        `docs/quirks/26.1.json`'s `region-id-not-static-id` entry
        (updated in place, not appended separately).
      - Determinism confirmed byte-identical (generate twice via
        `generate()`, `sha256` of the full output directory identical;
        `apx-diff` self-diff reports zero changes) on the four
        largest/most complex apps specifically required: `strategic-planner`
        (261 generated files), `opportunities` (152), `customers` (126),
        `cymbal-coffee-ops` (8, from the independent-apps set).

- [x] **RESOLVED: quoted, substitution-embedding property KEYS inside
      `link.target.items { }` blocks (the `strategic-planner` 8-warning
      gap from the entry directly above) — fixed in `packages/parser/src/
      parser.ts`.**
      - **Root cause confirmed against the literal real source, not the
        earlier paraphrase alone**: re-read every one of the 8 occurrences
        directly from `strategic-planner`'s own `.apx` files (not just the
        two already cited) — `pages/p00003-project-details.apx` has 5
        occurrences (lines 2154, 2291-2292, 2639) and
        `pages/p00094-initiative.apx` has 3 (lines 1655, 1776-1777, 2760),
        all the identical shape: a `link { target: { items: { "P#<PAGE-
        SUBSTITUTION>#_ID": #<VALUE-SUBSTITUTION># } } }` object literal,
        one instance nested inside a region's own `link` group (page-level
        column-link target on an Interactive Report), the rest inside
        `column NAME ( link { target: { items: { ... } } } } )` blocks (a
        per-column link target) — confirming the construct occurs in both
        of the two structural positions `link.target` can appear in this
        app, not just one.
      - **Full-production EBNF cross-check re-verified independently**
        (fresh `curl` of the raw `.ebnf`, 11,743 lines, per ADR-004 — not
        reused from the prior pass' claim): grepped literally every
        `"target" ":" <ws> <value>` occurrence in the file (30 total, not
        the 11 originally estimated) across `<entry-b-link-property>`,
        `<classic-navigation-bar-entry-link-property>`,
        `<entry-c-link-property>`, `<column-b-link-property>`,
        `<column-c-link-property>`, `<column-d-link-property>`,
        `<column-g-link-property>`, `<pwa-shortcut-shortcut-property>`,
        plus every branch/action `REDIRECT_PAGE`/`REDIRECT_APP` `target`
        property — confirmed EVERY one types `target` as an opaque
        `<value>` (`<value> ::= <string> | <identifier> | <boolean> |
        <number> | <reference> | <multiline-string> | <array>`). The
        grammar has no production anywhere that names `page`/`items`/
        `clearCache`/`anchor`, nor any general "object literal with
        arbitrary keys" concept at all — `<value>`'s own definition has no
        map/object alternative. This means `target`'s internal
        `{ page: ..., items: { ... }, clearCache: ..., anchor: ... }`
        shape is being serialized using the SAME line-oriented `NAME ':'
        value` property syntax as everything else, just nested one level
        deeper than the grammar's own named productions ever reach — real,
        reproducible APEXlang, genuinely outside what the EBNF formally
        describes, exactly the same "opaque `<value>`, grammar silent on
        the internal shape" situation as `calendarSettings` before it.
        Real data wins per ADR-004 — documented here, not silently
        resolved by assuming the grammar is exhaustive.
      - **The fix**: `PROPERTY`'s key-capturing group (`packages/parser/
        src/parser.ts`) now accepts a quoted-string alternative,
        `/^("[^"]*"|[A-Za-z0-9_][\w-]*)\s*:\s*(.*)$/` (previously bare-
        identifier-only), unquoted via the SAME `unquoteIdentifier()`
        helper already used for quoted, space-containing COMPONENT
        identifiers (the `column "Row Header" (` fix) — same underlying
        cause in both cases: the bare `<identifier>` production
        (`<identifier-start> ::= "A".."Z" | "a".."z" | "0".."9" | "_"`,
        `<identifier-rest>` adds only "." and "-") cannot contain the
        characters the real value needs (a space there, a `#` here), so
        the exporter quotes it — and both times the fix is "accept the
        quoted alternative, unquote into the same key/identifier space,"
        not a special case bolted on separately. The `#substitution#`
        token embedded in the key is kept completely literal (never
        evaluated) — identical treatment to how `#substitution#` tokens in
        property VALUES were already handled, now extended to keys.
      - **No new typed AST field** — `link.target.items.*` stays in
        `raw`/`ApexRegion.raw` only, per ADR-001 (this is a raw-capture
        completeness fix, not a new semantic field, so there is nothing to
        wire into a NEW `apx-diff` field-by-field diff line; the EXISTING
        whole-`raw`-bag comparison (`rawEqual()` in
        `packages/generator/src/diff.ts`) already picks up the
        newly-captured data automatically, confirmed by inspection of
        `diffRegionFields()`).
      - **Regression-guarded**: 4 new tests in `packages/parser/test/
        parser.test.ts` (zero warnings on the real construct; the quoted
        key unquotes correctly and the embedded `#substitution#` token
        stays literal; sibling keys in the same `link.target` group are
        undisturbed, i.e. no desync; a normal bare-identifier key in the
        same `items { }` shape is unaffected) — confirmed the first two
        tests fail without the fix (`git stash` the parser-source-only
        change, rebuild, rerun: "Unrecognized line" warning + `undefined`
        raw value; restored and reconfirmed green).
      - **Verified zero warnings**: `strategic-planner` alone (298 `.apx`
        files, 0 warnings, `link.target.items.P#EDIT_PAGE#_ID` etc. now
        populated with the correct literal value in `raw`) and the FULL
        45-app corpus plus the separately-tracked UX Pattern Catalog ground
        truth app (46 apps total swept) — 0 warnings across every single
        one, no regressions introduced by the widened `PROPERTY` regex
        (confirmed no other app in the corpus has a line starting with `"`
        that used to warn and now mis-parses, by the same zero-warnings
        sweep catching any new misparse as a `raw`/structural anomaly).
      - **Determinism reconfirmed**: `examples/employee-page` regenerated
        byte-identical to the committed fixture; the CI-style
        generate-twice-diff on `packages/generator/test/fixtures/
        reference-fixtures` byte-identical; `strategic-planner` itself
        regenerated twice (261 files both times) byte-identical, AND
        `apx-diff` self-diff on `strategic-planner` against itself reports
        "0 added, 0 removed, 0 changed, 261 unchanged."

- [x] **46th real app added: `concurrent-manager`, authored by this
      project's own user — the best-provenance app in the corpus (no
      licensing question at all, unlike every other entry).** Confirmed
      genuine `mmdVersion 26.1.0+3102`, 56 pages. Full provenance and
      corpus-size accounting in `.ai/knowledge/verification.md`; full
      per-app breakdown in
      `examples/verified-apps/concurrent-manager/RESULTS.md`. Parser/
      grammar-specific findings from this pass:
      - **Zero warnings**, matching the rest of the corpus.
      - **No genuinely new region, item, or unmodeled-component type** —
        checked deliberately, not assumed clean by default, per
        `.ai/checklists/new-verification-app.md`. All 10 region types
        (`breadcrumb`, `staticContent`, `interactiveGrid`,
        `interactiveReport`, `classicReport`, `form`, `chart`, `cards`,
        `regionDisplaySelector`, `dynamicContent`), all 15 item types, and
        all 8 unmodeled component types (`axis`, `branch`, `column`,
        `pageGroup`, `process`, `savedReport`, `series`, `validation`)
        were already known from the 45-app corpus before this addition.
        This is itself a real (negative) finding, not a non-event: a
        56-page app with its own custom plugin was a real candidate for
        new signal, and it's being reported honestly that none surfaced,
        rather than the checklist being treated as satisfied by parsing
        cleanly alone.
      - **Custom item plugin checked specifically, found unused**: this
        export ships `shared-components/plugins/item/advancedSlider`
        (static id `HR.BILOG.MGORICKI.ADVANCED_SLIDER`), a real,
        independently-authored jQuery UI slider item plugin — exactly the
        kind of thing expected to surface a new `plugin/*` item-type
        instance. A full grep of every `pages/*.apx` file in this export
        for the plugin's static id/name found **zero page items
        reference it** — the plugin is defined but never placed on any
        page. It therefore contributes no `plugin/*` item-type instance
        to this app's parse output. Separately, and true for every app in
        this corpus already, not something new here: `shared-components/**`
        (plugin definitions, themes, static files) is outside
        `@apx/generator`'s `loadExport()` scope entirely
        (`application.apx` + `page-groups.apx` + `pages/*.apx` only) — a
        plugin's own `plugin.apx` definition is never itself parsed by
        this project's tooling, only a resulting `pageItem ( type:
        plugin/... )` reference on a page that uses it, had one existed.
      - **ADR-003 (`htmlDomId`) cross-checked specifically against this
        app**: present on 17/159 regions, across `staticContent`,
        `interactiveReport`, `interactiveGrid`, `dynamicContent` — all
        four already confirmed elsewhere in the corpus. Nothing
        contradicts ADR-003's "universal mechanism" finding; a small
        additional corroboration on an independently-sourced 46th app.
      - **Determinism confirmed**: generated twice, byte-identical output
        both times; `apx-diff` self-diff against itself: 0 added, 0
        removed, 0 changed, 55 unchanged (55 page-object/spec pairs from
        56 parsed pages — the global page, id 0, is excluded from
        generation by design, same convention as every other app in this
        corpus).
      - **Live verification**: none available. The export's own
        `deployments/default.json` records only an app id (`20500`), no
        reachable instance URL — checked directly, not assumed, per this
        task's explicit instruction to confirm rather than assume
        static-only status.
      - **Full regression sweep re-run against the whole 46-app corpus in
        this pass** (not just the new app): all 46 exports parse with
        zero warnings; all 45 pre-existing apps in `examples/
        verified-apps/` regenerate byte-identical output (no drift); the
        `examples/employee-page` determinism fixture regenerates
        byte-identical; full `vitest` suite green across all workspaces;
        `spike/` typechecks clean.

- **2026-07-27, `branch`/`validation`/`lov` typed AST fields (Seventh
  round follow-through, Compiler/Parser Engineer)** — Product Architect's
  scope decision (`docs/ecosystem-roadmap.md` "Seventh round (2026-07-27)")
  actioned: `ApexPage.branches`, `ApexPage.validations`, and
  `ApexItem.lovName` added to `packages/parser/src/ast.ts`, wired into
  `packages/parser/src/parser.ts`'s `projectPages()`, and into
  `packages/generator/src/diff.ts`'s field-by-field diffing (and
  `diff-cli.ts`'s printed output) in the same change, per this project's
  own repeated-gap history (`calendarSettings`, then
  `chartSettings`/`htmlDomId`) — not deferred this time.
  - **`ApexPage.branches` (`branch (...)`, EBNF `branch-a`, FULL
    production checked: name/execution/behavior/serverSideCondition/
    security/config/comments)**. Real data: 325 real branches across this
    project's full corpus (concurrent-manager: 6 pages, matching the
    Seventh-round prompt exactly). **Confirmed identifier asymmetry**:
    branches NEVER carry a component-id (0/325) — the one
    page-child-component type observed with none at all, unlike
    `validation`/`region`/`item`/`button` (always present) — so
    `apx-diff`'s `diffBranches()` cannot reuse `diffByIdentifier` and
    matches positionally instead (documented limitation: a true
    reordering between two export versions would show as spurious
    per-position changes, not a real add/remove).
  - **CONFIRMED EBNF DISCREPANCY (real data wins, ADR-004)**:
    `branch-a-behavior-property` types `target` as an opaque scalar
    `<value>` with a sibling `type` enum (`pageOrUrl`/
    `urlIdentifiedByItem`/...) and a flat `pageNumber` property. Real data
    NEVER matches this — `target` is always a nested object group
    (`target: { page: N, items: {...}, clearCache: N|[N]|&ITEM.,
    action: ..., successMessage: ..., request: ... }`, or `target: {
    type: url, url: ... }` for the external-redirect variant, confirmed
    in `apextogo`'s sign-out branch). The same class of gap already
    documented for `calendarSettings` (real properties absent from the
    grammar entirely) — here the grammar names the concept but the shape
    it describes doesn't match what real 26.1 exports produce.
  - **Second, narrower real-data finding**: `target.page` is not always a
    literal page number as the EBNF's sibling button/menu "LINK_IN_APP"
    value type would suggest. Confirmed THREE real shapes in Oracle's own
    `customers` starter app (`p00002-customer-details.apx:1848-1896`,
    three consecutive branches, one of each): a literal number (`page:
    50`, the dominant case, 317/325), a page ALIAS string (`page:
    CUSTOMERS`), and an item-substitution token (`page: &LAST_VIEW.`, on
    an entirely unconditional branch with no `serverSideCondition` block
    at all — also confirmed real and common, not an edge case).
    `ApexBranchTarget.page` typed `number | string | null` to hold all
    three without lossy coercion.
  - **`ApexPage.validations` (`validation <id> (...)`, EBNF
    `validation-b`, FULL production checked: name/execution/validation/
    advanced/error/serverSideCondition/security/config/comments)**. Real
    data: 353 real validations across this project's full corpus
    (concurrent-manager: 8 pages / 14 instances). **Confirmed the
    inverse identifier asymmetry from `branch`**: every real validation
    carries a component-id (353/353) — `diffByIdentifier` reused as-is,
    no bespoke diff needed. `validation.type`'s open-string enum (9
    distinct real values: itemIsNotNull, noRowsReturned,
    functionBodyReturningBoolean, itemMatchesRegexp,
    itemIsAValidTimestamp, rowsReturned, itemIsNumeric, functionBody,
    columnMatchesRegexp) matches the EBNF's item-scoped/column-scoped
    enums exactly — no discrepancy found here, unlike `branch`.
  - **Clarifying the Seventh-round prompt's own counts**: the roadmap
    entry cited "34 pages use validation" and "LOVs referenced across
    11+ pages" for concurrent-manager, sourced from a broad substring
    grep (`grep -rl validation pages/`, `grep -rl lov pages/`) done
    during the scope-decision pass. That substring net is intentionally
    wider than the typed constructs added here: it also catches
    `ApexItem.required`'s existing `validation { valueRequired }` group
    (an item-level "is this field required" flag, unrelated to the
    page-level `validation()` component — already typed, unchanged by
    this pass) and every `lov {}` group regardless of LOV type
    (`sqlQuery`/`staticValues`/`functionBody`, not just
    `sharedComponent`). The precise, typed-construct counts for
    concurrent-manager specifically: 8 pages / 14 instances of the actual
    `validation()` component; 8 pages carry a gated-type
    (`selectList`/`radioGroup`/`popupLov`) item with a `sharedComponent`
    LOV reference. Not a contradiction of the scope decision — the
    decision to build was correct and the real data backs it — just a
    reconciliation worth recording so the two numbers aren't mistaken for
    the same measurement later.
  - **`ApexItem.lovName` (`lov { type: sharedComponent, lov: @name }`,
    EBNF `page-item-lov-property`, `"lov" ":" <ws> <reference>`, applies
    when `type = SHARED`)** — gated to exactly the three item types
    Product Architect scoped this to (`selectList`/`radioGroup`/
    `popupLov`), per the roadmap's explicit "narrow scope only" framing.
    Real data confirms the identical shape is ALSO common on
    `checkboxGroup` (30/70 real items), `selectOne` (13/37),
    `displayOnly` (23/251), `shuttle` (1/4), and
    `textFieldWithAutocomplete` (1/2) across the full corpus — reported
    honestly rather than silently expanding the gate, since the scope
    decision was explicit about which three types, not "wherever the
    data supports it." `shared-components/lovs.apx` (the LOV's actual
    list of values) remains entirely out of `loadExport()`'s scope, per
    the same roadmap entry — this field is a reference only, resolvable
    to nothing further without a separate architecture change.
  - **`Sawalhah/apexlang-view` cross-check**: fetched
    `github.com/Sawalhah/apexlang-view/blob/main/src/parser.js` directly
    (`curl` to raw.githubusercontent.com, browsed as text, never
    imported/depended on). Real, direct signal found, not a non-event:
    that project DOES have construct-specific handling for `branch`
    (`NAV_TRIGGER_TYPES`/`collectNavTargets`, part of its page-navigation-
    graph feature), and its own code comment is an independent
    corroboration of this exact pass's EBNF-discrepancy finding: *"a
    page-level `branch (...)` form... nest[s] the target under groups...
    confirmed against real exports"* — i.e. their own, separately-
    authored, ~1,263-real-export-validated parser also treats `branch`'s
    `behavior { target: { page: N } } }` as a nested-group shape, not the
    official EBNF's flat scalar `<value>`, the same real-data-vs-grammar
    divergence this pass found independently. One partial divergence
    worth flagging rather than silently smoothing over: their
    `collectNavTargets` only accepts a target `page` that matches
    `/^\d+$/` (a bare digit string) — it silently drops the alias-string
    (`CUSTOMERS`) and substitution-token (`&LAST_VIEW.`) shapes this
    pass's `ApexBranchTarget.page` explicitly types as `number | string |
    null` to hold. Read as indirect corroboration that non-numeric
    targets are real (their code guards for exactly that possibility)
    rather than a contradiction — they chose to narrow their feature's
    scope (page-navigation-graph edges only make sense for a resolvable
    page number) where this project chose to preserve the value losslessly
    instead. No construct-specific handling for `validation` or `lov`
    exists anywhere in their `parser.js` — nothing to cross-check against
    for those two.
  - **Wired into `apx-diff` in this same change** (`diffBranches()`,
    `diffValidationFields()` via `diffByIdentifier`, and `lovName` added
    to `diffItemFields()`) — not deferred, per ADR-001's consequence
    about this exact gap having happened twice already.
  - **Regression tests**: `packages/parser/test/parser.test.ts`, three
    new `describe` blocks (`typed branch support`, `typed validation
    support`, `item.lovName`), covering the alias/substitution/URL target
    variants, the compound-condition case, the null-condition
    (unconditional) case, and the gated-vs-ungated LOV item-type cases.
  - **Zero-warnings sweep**: re-ran the full 46-app corpus sweep after
    this change — 0 warnings, unchanged from the prior pass. `branch` and
    `validation` no longer appear in any app's `ApexAppAst.unmodeled`
    (aggregate union across the 46-app corpus: 317 real branches across
    27 apps, 340 real validations across 19 apps, 718 real `lovName`
    references across 23 apps -- these three counts match the "27/46
    branch, 19/46 validation" figures the Product Architect's own,
    independently-run "Continuation" pass recorded the same day, a useful
    cross-check that this pass's sweep methodology and that pass's
    per-app `RESULTS.md` grep agree; an EARLIER draft of this sweep,
    before that cross-check, undercounted badly -- 239/16, 278/12,
    552/16 -- traced to a stale, emptied-out `pages/` directory under one
    of two duplicate local copies of the 13 original Oracle sample-gallery
    apps in this session's scratch space; re-pointed at the populated
    copy and re-verified against the Product Architect's independent
    figures before writing this entry, per this project's own "don't
    trust a script blindly" discipline).
  - **Determinism confirmed**: `examples/employee-page` regenerates
    byte-identical (unaffected — that fixture has no branch/validation/
    LOV constructs to exercise, confirming no regression to unrelated
    generation paths); concurrent-manager itself (which DOES exercise all
    three) regenerated twice into scratch output, byte-identical both
    times; `apx-diff` self-diff against itself unchanged (0 added, 0
    removed, 0 changed, 55 unchanged) with the new branch/validation
    diffing wired in, confirming no spurious diffs on an identical
    export; a synthetic two-export diff (hand-written fixture, one
    branch target page changed, one validation error message changed)
    confirmed both new diff paths actually surface a change when one
    exists, not just stay silent on identical input.

- **2026-07-29, `process`/`computation`/`column`/`action` typed AST fields
  (Continuation-round follow-through, Compiler/Parser Engineer)** —
  Product Architect's "Continuation (same pass): the remaining 15
  unmodeled types" scope decision (`docs/ecosystem-roadmap.md`, Seventh
  round) actioned the four items marked "BUILD NOW": `ApexPage.processes`,
  `ApexPage.computations`, `ApexRegion.columns`, `ApexRegion.actions`
  added to `packages/parser/src/ast.ts`, wired into `packages/parser/src/
  parser.ts`'s `projectPages()`, and into `packages/generator/src/diff.ts`'s
  field-by-field diffing (and `diff-cli.ts`'s printed output) in the same
  change — not deferred, per this project's own repeated-gap history.
  - **`ApexPage.processes` (`process <id> (...)`, EBNF `<process>`, FULL
    production checked: name/type/executionChain/formRegion/editableRegion
    direct properties, plus every group — genAI/source/execution/
    successMessage/error/advanced/serverSideCondition/security/config/
    comments)**. Real data: 1732 real processes across 45/46 apps in this
    project's full corpus — the single highest app-count of any construct
    typed so far (branch 27/46, validation 19/46 included). Always
    carries a real identifier (1732/1732), unlike `branch`.
  - **CONFIRMED EBNF GAP (real data wins, ADR-004)**: the EBNF's
    `<process-group-block>` enumerates exactly ten groups, with NO `target`
    group defined anywhere in the `process` production. Real data confirms
    one anyway — `autoRowProcessing`/`formAutoRowProcessing` processes (117
    + 93 real instances) carry a `target { tableName: ..., pkColumn: ...,
    pkItem: ..., returnKeyIntoItem: ... }` group (confirmed live, Oracle's
    own `customers` starter app, `p00002-customer-details.apx:1821`). Same
    class of gap as `calendarSettings`/`branch.target` — deliberately left
    UNTYPED (kept in `raw` only): no concrete consumer has asked for
    `tableName`/`pkColumn` specifically, matching this project's
    restrained-typing bar; the gap itself is the citable finding.
  - **`process.point` is an OPEN string in the EBNF** (`<string-like-value>`,
    no enum) — unlike `branch.execution.point`, which the grammar
    enumerates to exactly 5 values. Real values observed: beforeHeader
    (258), afterHeader (163), afterSubmit (11), ajaxCallback (9),
    beforeRegions (8) — a real subset of the wider open set, not a
    contradiction of the grammar's silence.
  - **`ApexPage.computations` (`computation <id> (...)`, EBNF
    `<computation-a>`, FULL production checked: direct property itemName,
    plus every group — execution/computation/error/advanced/
    serverSideCondition/security/config/comments)**. Real data: 373 real
    computations across 19/46 apps. Always carries a real identifier
    (373/373) and always carries `itemName` (373/373, 100%).
  - **CONFIRMED EBNF DISCREPANCY**: every alternative in
    `<computation-a-computation-property>` marks `type` "required,"
    including as a stated precondition for `sqlQuery` itself. Real data
    confirms `type` can be entirely ABSENT while `computation.sqlQuery` is
    present alone (confirmed live, `customers` starter app,
    `p00050-customer.apx:5058`) — `sqlQuerySingleValue` is the implicit
    default when the group is present but `type` isn't set, the same
    omission-means-default class of finding as `ApexChartSettings`'
    bar-when-absent default. 149/373 real computations show this shape.
  - **Contamination caught and corrected BEFORE being recorded, not
    after**: an initial full-tree, position-blind survey pass (walking
    every raw tree node named `computation` regardless of nesting
    position) counted 375 instances across 20 apps, including
    `sample-reporting` — traced directly to that app's own
    `computation-b` instance (`p00001-interactive-report.apx:499`, a
    DIFFERENT, unrelated production nested inside a `savedReport`
    alongside `displayColumn`/`aggregate` siblings, confirmed via the
    EBNF's own `saved-report-a-child-component` list). Re-verified against
    this projection's own actual, position-scoped output (`page.
    computations`, walking only real `ApexPage`/`ApexRegion` objects, not
    a raw-tree grep-and-walk) before recording the real 373/19 figures
    here — the discrepancy is recorded in `ApexComputation`'s own doc
    comment in `ast.ts` too, not silently smoothed over. `computation-b`
    itself is out of scope (no concrete consumer, nested inside the
    already out-of-scope `savedReport`) and cannot be accidentally
    captured by the real projection, since only a page's DIRECT children
    are walked for `computation`, the same gating already used for
    `branch`/`validation`.
  - **`ApexRegion.columns` (`column <id> (...)`, SIX sibling EBNF
    productions sharing the bare name `column` — `column-b` through
    `column-g`, one family each for Interactive Grid, two near-identical
    classicReport/tabular-form variants, a `show`-toggle variant, a
    REST/JSON-duality-view variant with a `name` direct property instead
    of `columnName`, and a richer cascading-LOV/validation variant — ALL
    six confirmed `region-child-component` in the EBNF's own component
    index, never `page-child-component`)**. Real data: 10,683 real columns
    across 39/46 apps — the single highest-volume construct typed in this
    batch (`classicReport` 35/46 apps, `interactiveReport` 29/46).
  - **CONFIRMED EBNF DISCREPANCY, opposite direction from `branch`'s**:
    every one of the six productions marks `columnName` (or `name` for
    `column-f`) "required" as a body property line. NOT ONE of the 10,683
    real columns in this corpus emits it as a body property — the
    exporter ALWAYS uses the component-id syntax slot instead (`column
    ENAME ( ... )`). Confirmed by direct inspection (0/10683 have a
    `columnName`/`name` body property; 10683/10683 carry a real,
    non-generic identifier instead) — where `branch`'s finding was "the
    EBNF's optional identifier slot is never real," this one is "the
    EBNF's declared-required BODY PROPERTY is never real," because the
    same information is always carried by the identifier slot instead.
  - **`column.link.target` reuses the identical nested-object shape
    already confirmed for `branch.target`** (page/items/clearCache) — the
    SAME real-data-vs-EBNF-opaque-`<value>` divergence already documented
    for `link.target` in the `strategic-planner` entry above, now also
    confirmed on a column specifically (Oracle's own `opportunities`
    starter app, `p00002-accounts.apx:748`).
    **CORRECTED (2026-08-12, see the dated entry below, "Navigation Graph
    prerequisite pass"): this bullet used to end "No external-URL variant
    exists for a column's link target (unlike `branch`/`action`)" — that
    claim was WRONG, a real counter-example was found
    (`ux-pattern-catalog`, `pages/p00320-item-detail-full.apx:459-464`,
    column `CHILD_RECORD_NAME`: `link { target: { type: url url: # }
    linkText: #CHILD_RECORD_NAME# } }`). Left visible here rather than
    silently rewritten, per this project's correction discipline — see the
    dated entry below for the fix.**
  - **`ApexRegion.actions` (`action <id> (...)`, deliberately named
    `ApexRegionAction` to keep it unambiguously distinct from the
    Dynamic-Action `action`/`ApexDAAction`)**. EBNF confirms TWO sibling
    `region-child-component` productions sharing the bare name `action`:
    `action-d` (Cards-region shape, `type` direct property:
    button/fullCard/title/subtitle/media) and `action-e` (List/
    template-driven shape, `position` direct property, open string) — both
    confirmed structurally distinct from `action-c` (the Dynamic-Action
    variant, parent production `dynamic-action-child-component`, already
    typed as `ApexDAAction`, unaffected by this pass). Real data: 2403
    real `action` component instances total in this corpus; 2211 are the
    already-typed Dynamic-Action variant, 192 are this NEW region-nested
    variant across 14/46 apps.
  - **CONFIRMED-COMMON IMPLICIT DEFAULT (not asserted with full
    certainty)**: `action-d`'s `type` is marked "required," but real data
    shows it frequently OMITTED with only `label` present (confirmed live,
    `sample-cards`, `p00002-blob-column.apx:185`) — 169/192 real
    region-nested actions have neither `type` nor `position` set. Likely
    an implicit `button` default (matching `action-d`'s own semantics),
    the same class of finding as the Chart bar-default and the
    computation `sqlQuerySingleValue` default above — but kept `null`
    here rather than coerced, since this batch's evidence is real but
    narrower than the Chart precedent's 65-region confirmation.
  - **Region-nested action identifiers are always present but NOT
    reliably unique** — a substantial fraction (23/192 in this corpus)
    reuse the literal string `"action"` when the developer never renamed
    it from Page Designer's own default; APEX auto-suffixes a second+
    default-named action WITHIN THE SAME region (`action-2`, `action-3`,
    ...) but the first stays the bare literal. A genuinely renamed action
    carries a real, meaningful identifier instead (`edit`, `delete`,
    `approve`, `claim`, `reject`, `terminate`, all confirmed real in
    `strategic-planner`). Diffed via the same `diffByIdentifier` items/
    buttons already use, scoped per-region (not per-page) specifically to
    minimize collision risk, an honest, documented limitation rather than
    a structural guarantee.
  - **`Sawalhah/apexlang-view` cross-check**: fetched
    `github.com/Sawalhah/apexlang-view/blob/main/src/parser.js` directly
    (reference only, never imported/depended on). No construct-specific
    handling exists anywhere in their `parser.js` for `process`,
    `computation`, `column`, or `action` — their parser treats all four as
    generic, untyped components the same way this project's own `raw` bag
    already did before this pass. Nothing to cross-check convergence or
    divergence against for any of the four; recorded as a checked-and-
    negative finding, not a skipped one.
  - **Wired into `apx-diff` in this same change** (`diffProcessFields`/
    `diffComputationFields` via `diffByIdentifier` at the page level;
    `diffColumnFields`/`diffRegionActionFields` via `diffByIdentifier`
    nested PER-REGION inside `diffRegionFields`, the same pattern already
    used for Dynamic-Action's nested `action` diffs inside
    `diffDynamicActionFields`) — not deferred.
  - **Regression tests**: `packages/parser/test/parser.test.ts`, four new
    `describe` blocks (`typed process support`, `typed computation
    support`, `typed report column support`, `typed region action
    support`), covering the target-group-in-raw-only case, the
    type-omitted-implicit-default case for both `computation` and
    `action`, the nested `link.target`/`behavior.target` shapes, the flat
    `behavior.targetUrl` variant, and an explicit test confirming a
    dynamicAction-nested `action` is NOT collected as an `ApexRegionAction`
    (keeping the two constructs' test coverage as clearly separated as
    their types).
  - **Zero-warnings sweep**: re-ran the full 46-app corpus sweep after this
    change — 0 warnings, unchanged from the prior pass. `process`,
    `computation`, `column`, `action` no longer appear in any app's
    `ApexAppAst.unmodeled` (confirmed directly against the built parser's
    own output, not a hand-count: 45/46 apps for `process`, 19/46 for
    `computation`, 39/46 for `column`, 14/46 for `action` — all four figures
    match the Product Architect's own independently-run "Continuation"
    pass table EXACTLY (45/39/19/14), the same kind of independent-method
    cross-check already performed for `branch`/`validation` in the entry
    above, and a stronger match than that entry's own initial draft, which
    needed a re-point-and-reverify pass before it agreed).
  - **Determinism confirmed**: `examples/employee-page` regenerates
    byte-identical (unaffected — no process/computation/column/action
    constructs to exercise there); `strategic-planner`, `opportunities`,
    and `customers` (the three largest/most complex apps in this corpus,
    all of which heavily exercise all four new constructs) each
    regenerated twice into scratch output, byte-identical both times;
    `concurrent-manager` (56 pages, 61 processes, 650 columns) also
    regenerated twice, byte-identical, and its own `apx-diff` self-diff
    against itself stayed at 0 added/0 removed/0 changed/55 unchanged with
    all four new diff paths wired in, confirming no spurious diffs on an
    identical export; a synthetic two-export diff (hand-written fixture,
    one process's `execution.point` changed, one computation's static
    value changed, one column's heading/link-target changed, one region
    action's target page changed) confirmed all four new diff paths
    actually surface a change when one exists, not just stay silent on
    identical input.

- [x] **Navigation Graph prerequisite pass (2026-08-12) — `ApexColumnLinkTarget`
      URL-redirect bug fixed; `ApexButton.target`/`ApexButton.url` typed.**
      Both changes required before `packages/generator`'s planned `flow.ts`
      (Flow Map data model, `docs/ecosystem-roadmap.md`'s Thirteenth round)
      can be built on complete underlying data — Decision 4 of that round
      made the column bug fix a hard prerequisite, not parallel work.
  - **`ApexColumnLinkTarget.url` — bug fix, not a new field alone.** This
    type's own doc comment previously claimed "no external-URL variant is
    defined anywhere in any column-link production" — WRONG, per a real,
    reproducible counter-example found in the Eleventh round
    (`docs/ecosystem-roadmap.md`, 2026-08-11) and re-confirmed directly in
    this pass against the same corpus file: `ux-pattern-catalog`,
    `pages/p00320-item-detail-full.apx:459-464`, region `child-records`,
    column `CHILD_RECORD_NAME`: `link { target: { type: url url: # }
    linkText: #CHILD_RECORD_NAME# } }` — the SAME `target: { type: url,
    url: ... }` nested shape already confirmed on `ApexBranchTarget`
    (`apextogo`'s sign-out branch). Before this fix, `projectColumn()`/
    `projectPageTarget()` silently returned `{page:null, items:null,
    clearCache:null}` for this real shape — the `url` value stayed in
    `raw` (`link.target.url`, ADR-001-compliant, never lost) but the typed
    `linkTarget` field was empty/misleading. Only ONE real occurrence found
    in this session's one directly-accessible corpus app (a full grep of
    every `pages/*.apx` `type: url` occurrence found exactly one, at this
    exact line) — a real, reproducible finding regardless of frequency, not
    inflated. `url` is read separately by `projectColumn()`, not folded
    into the `projectPageTarget()` helper shared with
    `action.behavior.target`/`button.behavior.target` (see next bullet) —
    those two never carry a nested `url` (their URL variant is a flat
    sibling `targetUrl` property instead), so folding `url` extraction into
    the shared helper would have silently leaked an always-`null` `url` key
    onto every action/button target object, a shape those types
    deliberately do not declare. `ApexColumnLinkTarget`'s doc comment in
    `ast.ts` is corrected in place (not silently rewritten) with the full
    correction history, per this project's standing discipline.
  - **`ApexButton.target`/`ApexButton.url` — net-new typed fields**, the
    page/app-redirect (`behavior.action: redirectThisApp`/
    `redirectOtherApp`) and external-URL-redirect (`behavior.action:
    redirectUrl`) variants respectively. Full `button-behavior-property`
    EBNF production checked (`apexlang.ebnf:2578-2589`, every alternative
    read, not just `action`/`target`): `action` is a closed 9-value enum
    (`submitPage | triggerAction | redirectThisApp | redirectOtherApp |
    redirectUrl | definedByDynamicAction | resetPage | nextPage |
    previousPage`); `"target" ":" <ws> <value>` appears twice (once
    "applies when action = REDIRECT_PAGE", type `LINK_IN_APP`; once
    "applies when action = REDIRECT_APP", type `LINK_IN_DIFF_APP`), both
    the same EBNF-opaque-`<value>`-but-real-`{page,items,clearCache}`-
    object pattern already confirmed on `branch`/`column`/`action` —
    `ApexButton.target` reuses the identical `projectPageTarget()` helper,
    no new parsing design. `targetUrl` ("applies when action =
    REDIRECT_URL") is a separate FLAT property, matching
    `ApexRegionAction.url`/`ApexRegionActionTarget`'s already-confirmed
    flat-vs-nested shape exactly.
    - **`redirectUrl`/`targetUrl` variant: directly re-witnessed this
      pass.** 17 real buttons confirmed in `ux-pattern-catalog` (grep
      count of `action: redirectUrl` across `pages/*.apx`, matching the
      Eleventh round's identical count exactly). Concrete example:
      `pages/p00110-dashboard-simple.apx:1120-1141`, button
      `view-details`: `behavior { action: redirectUrl targetUrl: # }`
      (`#` is this export's own literal placeholder value in this
      particular sample app, not a parser artifact).
    - **`redirectThisApp`/`redirectOtherApp` variant: NOT re-witnessed
      live this pass** — a full grep of every `pages/*.apx` file in this
      session's one directly-accessible corpus app for both enum values
      found ZERO occurrences, matching the Eleventh round's identical
      finding on the same app. Typed anyway on the strength of the EBNF
      production plus the already-proven, already-shipped
      `projectPageTarget()` pattern (shipped identically three times
      already for branch/column/action) — an explicit, deliberate
      Product Architect scoping call (Thirteenth round, Decision 2:
      "a direct application of an already-proven projection helper... low
      risk, small, same pattern as work already shipped"), not a claim
      that this specific variant has been live-confirmed. `ApexButtonTarget`'s
      doc comment in `ast.ts` states this evidence-tier distinction
      explicitly rather than blurring the two variants together.
  - **`Sawalhah/apexlang-view` cross-check**: fetched
    `github.com/Sawalhah/apexlang-view/blob/main/src/parser.js` directly
    (reference only, never imported/depended on) — no construct-specific
    handling exists anywhere for `button`/`column` beyond generic
    group/property parsing; their parser does not distinguish a nested
    `target: { type: url }` shape from a page-target shape either way, the
    same generic treatment already noted for `process`/`computation`/
    `column`/`action` in the entry above. Nothing to cross-check
    convergence or divergence against specifically for the `url` fix or
    the button target fields; recorded as a checked-and-negative finding.
  - **Wired into `apx-diff` in this same change**: `diffButtonFields`
    (`packages/generator/src/diff.ts`) gained `target`/`url` lines (the
    same `JSON.stringify` whole-object-compare pattern already used for
    `ApexRegionAction.target`); `diffColumnFields`'s existing `linkTarget`
    line already JSON-compares the WHOLE `linkTarget` object, so the new
    `url` field is automatically covered by that pre-existing line, no new
    diff.ts code needed for the column side. Confirmed automatically, not
    just asserted: `packages/generator/test/diff-field-coverage.test.ts`'s
    generic, fixture-key-driven mechanism (96 tests total after this
    change) passes for both `ApexButton.target`/`ApexButton.url` and
    `ApexReportColumn.linkTarget` (including its new `url` sub-field via
    the fixture's populated value) — this is the actual regression
    guard for "was this wired into apx-diff," not a manual claim.
  - **Regression tests**: `packages/parser/test/parser.test.ts` — a new
    `describe('projects a flat, external-URL link.target (bug fix...)')`
    test reproducing the exact real `p00320-item-detail-full.apx` shape
    (asserts `linkTarget` equals `{page:null, items:null, clearCache:null,
    url:'#'}`, plus a `raw['link.target.url']` check confirming `raw` was
    never affected by the fix); a fixed pre-existing assertion in the
    `column.link.target` page-redirect test (now expects the added
    `url: null` key); and a new `describe('typed button redirect target
    ...')` block with three cases — nested page-target
    (`redirectThisApp`), flat URL target (`redirectUrl`, reproducing the
    real `view-details` button verbatim), and the neither-set case
    (a plain `submitPage`-style button with an unrelated `behavior {}`
    group present, confirming `hasTarget` detection doesn't false-positive
    on sibling `behavior.*` keys).
  - **Zero-warnings sweep**: re-parsed the full `ux-pattern-catalog` export
    (31 `.apx` files: `application.apx`, `page-groups.apx`, all 19
    `pages/*.apx`, all `shared-components/*.apx`) through the rebuilt
    `@apx/parser` — 0 warnings, matching the pre-existing baseline exactly
    (unchanged). This session had direct file access to only this one real
    export (found in `~/.Trash`, same access constraint the Eleventh round
    recorded) — not the full 46-app corpus referenced elsewhere in this
    project's history, which was not present in this environment either.
  - **Determinism confirmed**: `packages/generator/test/fixtures/reference-fixtures`
    regenerated via `node packages/generator/dist/cli.js
    packages/generator/test/fixtures/reference-fixtures --out <scratch>`
    and diffed byte-for-byte against committed `examples/employee-page`
    (`p00003-employee.page.ts`/`p00003-employee.spec.ts`) — identical
    (that fixture is a table-based form with no button/column redirect
    target at all, so this confirms no regression to the unaffected
    common path, not new target-field coverage itself, which the parser
    unit tests above cover directly).
  - **Full regression sweep**: `npm run build --workspaces` (all four
    packages, 0 errors), `npm test --workspaces --if-present` (263 tests
    total: 69 parser + 189 generator + 5 testkit, all passing, 5 parser
    integration tests conditionally run against `ux-pattern-catalog` via
    `APX_EXPORT_DIR`), `npm run lint` (0 errors/warnings), `cd spike && npx
    tsc --noEmit` (0 errors).

## Still open

(the quoted, substitution-embedding property KEY item that lived here has
been resolved — see the dated entry below, "RESOLVED: quoted,
substitution-embedding property KEYS...". Left this pointer in place, not
silently removed, per this project's correction discipline.)
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
- [ ] Region/report types beyond this app (calendar, map, tree...); this
      list is the typed-projection backlog. **Correction (this pass,
      concurrent-manager addition)**: the 18-entry list that used to sit
      here (`action, authentication, authorization, axis, breadcrumb,
      buildOption, column, componentSetting, dynamicAction, facet,
      facetGroup, file, list, lov, pageGroup, process, savedReport,
      series`) had gone stale — several of those (`breadcrumb`,
      `dynamicAction`, `list`) are now typed, not unmodeled (see
      `docs/component-coverage-matrix.md`), and several real unmodeled
      types present in the current 46-app corpus were missing from it
      entirely (`branch`, `columnGroup`, `computation`, `filter`, `layer`,
      `metaTag`, `parameter`, `searchSource`, `validation`). Left the old
      list visible above rather than silently deleted, per this project's
      correction discipline. **Unmodeled set as it stood right before the
      2026-07-27 `branch`/`validation`/`lov` pass** (union of every app's
      `ApexAppAst.unmodeled` across the full 46-app corpus, computed
      directly from `@apx/parser`'s built output, not hand-maintained):
      `action`, `axis`, `branch`, `column`, `columnGroup`, `computation`,
      `facet`, `filter`, `layer`, `metaTag`, `pageGroup`, `parameter`,
      `process`, `savedReport`, `searchSource`, `series`, `validation` —
      17 types. (`authentication`, `authorization`, `buildOption`,
      `componentSetting`, `facetGroup`, `file`, `lov` from the old list do
      not currently appear as top-level unmodeled component types
      anywhere in this corpus — either they were seen only in the
      separately-tracked UX Pattern Catalog ground-truth app, not the
      46-app corpus this list is now scoped to, or the earlier list was
      simply inaccurate; not re-investigated further in that pass,
      flagged here rather than silently carried forward.)

      **CORRECTION (2026-07-27, same-day follow-through pass)**: `branch`
      and `validation` are typed as of this pass — see the dated entry
      above ("`branch`/`validation`/`lov` typed AST fields") — and no
      longer appear in any app's `unmodeled` set. The re-swept, current
      15-type unmodeled set across the same 46-app corpus: `action`,
      `axis`, `column`, `columnGroup`, `computation`, `facet`, `filter`,
      `layer`, `metaTag`, `pageGroup`, `parameter`, `process`,
      `savedReport`, `searchSource`, `series`. `lov` was never itself a
      top-level unmodeled type (a `pageItem`'s `lov {}` group is a nested
      property group on an already-typed `ApexItem`, not its own
      top-level component) — the narrow `ApexItem.lovName` reference
      field added this pass does not change that; the bigger,
      out-of-scope `shared-components/lovs.apx` LOV-definition file
      remains outside `loadExport()`'s scope entirely, unrelated to this
      list.

      **CORRECTION (2026-07-29, Continuation-round follow-through)**:
      `process`, `computation`, `column`, and `action` are typed as of this
      pass — see the dated entry above ("`process`/`computation`/`column`/
      `action` typed AST fields") — and no longer appear in any app's
      `unmodeled` set either. The re-swept, current 11-type unmodeled set
      across the same 46-app corpus: `axis`, `columnGroup`, `facet`,
      `filter`, `layer`, `metaTag`, `pageGroup`, `parameter`, `savedReport`,
      `searchSource`, `series` — matching exactly the Product Architect's
      own "Genuine individual consideration, DEFER" and "FAST-TRACKED —
      not worth it now" groups from `docs/ecosystem-roadmap.md`'s
      "Continuation" pass, none of which this round's build-now decision
      touched.

## Fixture policy

`test/fixtures/p00003-employee.apx` is hand-written docs-style (kept for the
lexically-nested variant). The real export is used by integration.test.ts via
a local path and is NOT committed — check redistribution terms before adding
any Oracle-authored export to the repo.
