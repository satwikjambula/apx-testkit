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

## Still open

- [ ] **NEW (this round): quoted, substitution-embedding property KEYS
      inside `link.target.items { }` blocks are not parsed.** 8 real
      occurrences, `strategic-planner` only (see the dated entry above for
      full evidence and the EBNF cross-check already performed — the
      grammar types `link.target` as an opaque `<value>`, silent on this
      internal shape, so real data is the only source). The current
      `PROPERTY` regex (`packages/parser/src/parser.ts`) requires the key
      to start with `[A-Za-z0-9_]`; a leading `"` falls through to
      "Unrecognized line". Needs a `/parser` decision: either (a) extend
      `PROPERTY` to accept a quoted-string key alternative (mirroring the
      existing `unquoteIdentifier()` handling for quoted component
      identifiers), unquoting into the same `props` key space, or (b) a
      narrower fix scoped just to `items { }` blocks if a general quoted-key
      property is judged too broad a grammar change from one app's evidence.
      Either way, the malformed lines currently fall safely into
      `node.props['#unparsed']` (a warning, not silent data loss or a
      parser crash) — consistent with ADR-001's "never lose information"
      guarantee — but the two affected `link.target.items` values
      themselves are NOT captured in any typed or raw field today. Only
      one app in the 45-app corpus is affected; do not generalize a fix
      without a second real occurrence, per this project's "one instance
      is not enough to generalize from" discipline (the Chart `widget()`
      lesson).
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
