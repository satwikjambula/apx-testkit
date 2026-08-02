# Support matrix

**Verified against Oracle APEX 26.1 only.** Nothing in this repo has been
run against any other APEX version. Do not assume backward or forward
compatibility.

| Component | Verified against | How |
|---|---|---|
| `@apx/parser` grammar | APEX 26.1.0+3102 (UX Pattern Catalog export) | Full export parses with zero warnings — see docs/grammar-assumptions.md |
| `@apx/testkit` item.ts | Live APEX 26.1 instance (same app) | apex.item() round-trip verified for textField, textarea, numberField, selectList, datePicker, hidden |
| `@apx/testkit` session.ts | Live APEX 26.1 instance (same app) | Friendly-URL alias resolution, title normalization rule |
| `@apx/testkit` region.ts / button.ts | Partially — see docs/grammar-assumptions.md "Still open" | region.ts only claims what apex.region()'s own API reports; button.ts uses accessible-role/label locators, not a verified static-id convention |
| `@apx/testkit` auth.ts | Partially verified: live, against FOUR real APEX 26.1 apps (Sample File Upload and Download; Sample Interactive Grids; Sample Charts; the P101_USERNAME/P101_PASSWORD convention held on all four) | Field ids confirmed exact match, no changes needed. Submission switched from Enter to a button click after live evidence of Enter unreliability; that specific fix is NOT yet independently re-verified — see docs/limitations.md |
| `@apx/testkit` interactive-grid.ts | Live, against a real IG region (Sample Interactive Grids gallery app) | `getActions`/`getViews`/`getCurrentView`/`getCurrentViewId`/`getSelectedRecords` confirmed via the widget-factory pattern, 3/3 repeated runs — see docs/quirks/26.1.json. Region's runtime static id confirmed to differ from its `.apx` identifier; generator cannot auto-wire this component |
| `@apx/testkit` region.ts against Chart | Live, against a real chart region (Sample Charts gallery app) | `ApexRegion.refresh()` confirmed live, 3/3 repeated runs. `apex.region(id).widget()` confirmed to return `null` for charts (unlike IG/Cards/IR); runtime static id confirmed to differ from `.apx` identifier — see docs/quirks/26.1.json |
| `@apx/testgen` generator output | Live APEX 26.1 instance, one app (UX Pattern Catalog) | 39/43 generated smoke tests passed live; determinism verified against a committed synthetic fixture, not the real export (not available in every environment) |
| `@apx/testkit` report-column.ts | Live, against a real classicReport region (`item-detail-full`) AND a real interactiveReport region (`browse-interactive-report`), both UX Pattern Catalog | `reportColumnHeader()`/`expectReportColumnHeadersPresent()` confirmed on both region types via the accessible `columnheader` role. `classicReportColumnById()` confirmed live: DOM id === `.apx` column identifier verbatim, all 5 columns of `child-records` — scoped to work around a confirmed sticky-header duplicate-id issue. Interactive Report's column DOM id confirmed internal/undiscoverable — see docs/quirks/26.1.json |
| `@apx/testkit` interactive-report.ts | Live, against the same interactiveReport region (`browse-interactive-report`) | `searchInteractiveReport()` confirmed live (real `QUICK_FILTER` AJAX + `apexafterrefresh` event, quoted-phrase vs. unquoted-OR semantics documented). `sortReportColumn()`/`getColumnSortState()` confirmed live on 3 independent columns (Title/Category/Priority), 2 repeated runs — see docs/quirks/26.1.json for the confirmed `stickyTableHeader` force-click requirement. Pagination NOT verified — no live multi-page dataset available |
| `@apx/testkit` region-action.ts | Live, against a real Cards region (`faceted-search-cards`) and a real List region (`faceted-search-content-row`), both UX Pattern Catalog | Presence (`regionActionLocator()`/`expectRegionActionPresent()`) confirmed live for Cards' `action-d` shape. Click-through effects confirmed a DEAD END on this app (every tested action is a non-functional placeholder) — not asserted; see docs/quirks/26.1.json `region-action-cards-not-unique-inert` |
| `ApexButton.htmlDomId` (parser field) | Live (3 pages, UX Pattern Catalog) + full local-corpus static grep | Confirmed live: absent buttons resolve to an internal `B<numeric>` DOM id (not derivable from `.apx` data). Confirmed via grep: zero buttons in the entire local corpus (46+ apps) ever set `advanced { htmlDomId / staticId }` — field is typed for when one eventually does, `button.ts`'s runtime behavior is unchanged; see docs/quirks/26.1.json `button-id-not-static-id` |
| `@apx/testkit` messages.ts (`expectSuccess`/`expectError`/`expectNoErrors`/`expectNoSuccessMessage`) | Live, against UX Pattern Catalog (direct `apex.message` calls) AND Sample Interactive Grids page 31 (real triggered validation failures, not direct API calls) | `expectError()` confirmed to catch a REAL, triggered Interactive Grid page-level SQL `validation()` failure (`comm-limit`, `hire-date-in-past`) end-to-end — a stronger form of verification than the original direct-API-call check; see docs/quirks/26.1.json `interactive-grid-validation-mechanism-split` |
| `@apx/testkit` messages.ts (`expectAlert`/`dismissAlert`/`alertDialog`, new 2026-08-01) | Live, against Sample Interactive Grids page 31 | Confirmed live: Interactive Grid's column-level `valueRequired` check calls `apex.message.alert()` (a `role="alertdialog"` modal, "OK" button), NOT `showErrors`/`#APEX_ERROR_MESSAGE` — a genuinely different mechanism from page-level SQL validations; see docs/quirks/26.1.json `interactive-grid-validation-mechanism-split` |

## What "verified against one app" means

Every runtime fact in docs/grammar-assumptions.md's "Runtime verification"
section came from a single application (UX Pattern Catalog, a reference/demo
app). A second, independent app with different region types, a real login
page, and a `required` item would either confirm or break several open
assumptions (see docs/grammar-assumptions.md "Still open" and CLAUDE.md
"Outstanding debts"). Treat every "verified" claim in this repo as "verified
for this one app" until that happens.

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
