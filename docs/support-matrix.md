# Support matrix

**Verified against Oracle APEX 26.1 only.** Nothing in this repo has been
run against any other APEX version. Do not assume backward or forward
compatibility.

This table is generated FROM `docs/verification/26.1.json` (the
`supportMatrixRow` field on each registry entry) by
`scripts/generate-support-matrix.mjs` — do not hand-edit the rows between
the markers below; edit the registry entry instead and regenerate
(`node scripts/generate-support-matrix.mjs`). `node
scripts/generate-support-matrix.mjs --check` fails if this file has
drifted from what the registry would produce — see
`docs/verification/README.md`.

<!-- GENERATED:BEGIN verification-registry support-matrix-table -->
| Component | Verified against | How |
|---|---|---|
| `@apx/parser` grammar | APEX 26.1.0+3102 (UX Pattern Catalog export) | Full export parses with zero warnings -- see docs/grammar-assumptions.md. Re-confirmed zero-warnings across the full 46-app local corpus (see .ai/knowledge/verification.md). |
| `@apx/testkit` item.ts | Live APEX 26.1 instance (UX Pattern Catalog) | apex.item() round-trip verified for textField, textarea, numberField, selectList, datePicker, hidden. |
| `@apx/testkit` session.ts | Live APEX 26.1 instance (same app) | Friendly-URL alias resolution and title normalization rule (NFKC + dash-fold + whitespace-collapse, never raw equality) both confirmed live. |
| `@apx/testkit` region.ts / button.ts | Partially -- see docs/grammar-assumptions.md "Still open" | Region-id resolution is now substantially resolved by ADR-003's layered strategy (`resolveRegion()`, confirmed live) for regions where htmlDomId or the export identifier resolves; button.ts still has no verified static-id DOM convention and uses accessible-role/label locators as a deliberate fallback (`buttonByHtmlDomId()` exists but is NOT yet live-verified). |
| `@apx/testkit` auth.ts | Partially verified: live, against FOUR real APEX 26.1 apps (Sample File Upload and Download; Sample Interactive Grids; Sample Charts; the P101_USERNAME/P101_PASSWORD convention held on all four) | Field ids confirmed exact match, no changes needed. Submission switched from Enter to a button click after live evidence of Enter unreliability; a subsequent race-condition fix (waiting for a real URL change instead of one point-in-time check) is NOT yet independently re-verified -- see docs/quirks/26.1.json `login-race-condition` and docs/limitations.md. |
| `@apx/testkit` interactive-grid.ts | Live, against a real IG region (Sample Interactive Grids gallery app) | `getActions`/`getViews`/`getCurrentView`/`getCurrentViewId`/`getSelectedRecords` confirmed via the widget-factory pattern. Region's runtime region id confirmed to differ from its `.apx` identifier (`basic-editing` export -> `emp` runtime); generator cannot auto-wire this component from static data alone when `htmlDomId` is absent -- see docs/quirks/26.1.json. |
| `@apx/testkit` `ApexChartRegion` (chart.ts) against Chart | Live, against real chart regions (Sample Charts gallery app, 3 chart types) | `ApexRegion.refresh()` confirmed live, 3/3 repeated runs. `apex.region(id).widget()` returns a real jQuery-wrapped element for charts, confirmed independently on THREE chart types -- `widget().ojChart('option', ...)` is a real, working getter/setter API, shipped as `ApexChartRegion`. This row previously (wrongly) claimed `widget()` returns `null` for charts; corrected in place by this registry extraction pass, which found the drift. Runtime region id confirmed to differ from `.apx` identifier -- see docs/quirks/26.1.json `chart-region-widget-returns-null` and `region-id-not-static-id`. |
| `@apx/testgen` generator output | Live APEX 26.1 instance, one app (UX Pattern Catalog) | 39/43 generated smoke tests passed live -- all 4 failures are the same modalDialog page (`p00420-data-entry-drawer-form`), since fixed at the generator level (`isModalDialogUnroutable()`, see runtime-drawer-modal-pages-400). Determinism verified against a committed synthetic fixture, not the real export (not available in every environment). |
| `@apx/testkit` report-column.ts | Live, against a real classicReport region (`item-detail-full`) AND a real interactiveReport region (`browse-interactive-report`), both UX Pattern Catalog | `reportColumnHeader()`/`expectReportColumnHeadersPresent()` confirmed on both region types via the accessible `columnheader` role. `classicReportColumnById()` confirmed live: DOM id === `.apx` column identifier verbatim, all 5 columns of `child-records` -- scoped to work around a confirmed sticky-header duplicate-id issue. Interactive Report's column DOM id confirmed internal/undiscoverable from static data -- see docs/quirks/26.1.json `interactive-report-column-id-internal`. |
| `@apx/testkit` interactive-report.ts | Live, against the same interactiveReport region (`browse-interactive-report`) | `searchInteractiveReport()` confirmed live (real `QUICK_FILTER` AJAX + `apexafterrefresh` event, quoted-phrase vs. unquoted-OR semantics documented). `sortReportColumn()`/`getColumnSortState()` confirmed live on 3 independent columns (Title/Category/Priority), 2 repeated runs -- see docs/quirks/26.1.json for the confirmed `stickyTableHeader` force-click requirement. Pagination NOT verified -- no live multi-page dataset available. |
| `@apx/testkit` region-action.ts | Live, against a real Cards region (`faceted-search-cards`) and a real List region (`faceted-search-content-row`), both UX Pattern Catalog | Presence (`regionActionLocator()`/`expectRegionActionPresent()`) confirmed live for Cards' `action-d` shape. Click-through effects confirmed a DEAD END on this app (every tested action is a non-functional placeholder) -- not asserted; see docs/quirks/26.1.json `region-action-cards-not-unique-inert`. |
| `ApexButton.htmlDomId` (parser field) | Live (3 pages, UX Pattern Catalog) + full local-corpus `parseApp()` sweep (46+ apps) | Confirmed live: absent buttons resolve to an internal `B<numeric>` DOM id (not derivable from `.apx` data). A full-corpus `parseApp()` sweep found FOUR real buttons across four independent apps that DO set `advanced { htmlDomId }` (~1.1%, 4/356) -- UX Pattern Catalog itself still has zero. `buttonByHtmlDomId()` exists but is NOT YET LIVE-VERIFIED for buttons (regions' identical mechanism IS live-verified, ADR-003 -- do not conflate the two); `button.ts`'s default runtime behavior is unchanged. See docs/quirks/26.1.json `button-id-not-static-id`. |
| `@apx/testkit` messages.ts (`expectSuccess`/`expectError`/`expectNoErrors`/`expectNoSuccessMessage`) | Live, against UX Pattern Catalog (direct `apex.message` calls) AND Sample Interactive Grids page 31 (real triggered validation failures, not direct API calls) | `expectError()` confirmed to catch a REAL, triggered Interactive Grid page-level SQL `validation()` failure (`comm-limit`, `hire-date-in-past`) end-to-end -- a stronger form of verification than the original direct-API-call check; see docs/quirks/26.1.json `interactive-grid-validation-mechanism-split`. |
| `@apx/testkit` messages.ts (`expectAlert`/`dismissAlert`/`alertDialog`, new 2026-08-01) | Live, against Sample Interactive Grids page 31 | Confirmed live: Interactive Grid's column-level `valueRequired` check calls `apex.message.alert()` (a `role="alertdialog"` modal, "OK" button), NOT `showErrors`/`#APEX_ERROR_MESSAGE` -- a genuinely different mechanism from page-level SQL validations; see docs/quirks/26.1.json `interactive-grid-validation-mechanism-split`. |
<!-- GENERATED:END verification-registry support-matrix-table -->

## What "verified against one app" means

UPDATE (corrected in place — no longer accurate as originally written): this
section originally said every runtime fact in docs/grammar-assumptions.md's
"Runtime verification" section came from a single application (UX Pattern
Catalog) and that a second, independent app was still needed. That has since
happened, more than once: live runtime verification now spans **four** real
running APEX 26.1 apps — UX Pattern Catalog, Sample File Upload and Download
(real login page, second app), Sample Interactive Grids (third app, first
live ground truth for Interactive Grid), and Sample Charts (fourth app,
first live ground truth for Chart) — see docs/grammar-assumptions.md's
"Runtime verification" section for the full per-app ledger. Separately, the
much larger **static parser corpus is 46 real apps** (13 Oracle gallery + 11
`ujnak/APEXlang-exports` + 18 `oracle/apex` GitHub + 3 independent + 1 user's
own app — see `.ai/knowledge/verification.md`), all parsing with zero
warnings — but static parsing and live runtime verification are different
claims and should not be conflated: most of the 46 have no running instance
available, so their region/item *types* are confirmed to exist and parse
correctly, not confirmed to behave a specific way live. Treat every
"verified live" claim in this repo as scoped to the specific one of these
four apps named next to it, and every "parses correctly" claim as scoped to
the 46-app static corpus — not as blanket, project-wide facts.

## Not supported, by design

- Pre-26.1 APEX applications.
- Interactive Grid cell editing / data mutation as a general `@apx/testkit`
  capability — read-only inspection methods (getActions/getViews/
  getCurrentView/getSelectedRecords) are verified; a reusable, typed
  cell-editing API is still v0.2 at earliest. (Narrower exception: the
  live-verification pass that produced `interactive-grid-validation-
  mechanism-split` DID perform real cell edits via direct DOM/keyboard
  interaction to trigger validation failures — see
  `spike/tests/interactive-grid-validation-demo.spec.ts` — but that is
  page-local test code proving a specific validation-display finding,
  not a general "edit any IG cell" testkit component.)
- `.apx` writing/emitting — SQLcl owns import; this project is read-only.
- Linting — APEX Advisor and SQLcl own that role.
- Data-dependent assertions — the generator cannot know your data.
