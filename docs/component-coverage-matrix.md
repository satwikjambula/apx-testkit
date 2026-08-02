# Component coverage matrix

Number of real apps was never the right metric on its own — app count
proves the parser handles real-world export variety, but says nothing
about whether any *specific* component has enough diversity behind it, or
whether it's been verified live at all. This tracks both: how many of the
46 real, statically-parsed exports contain each region/item type, and
separately, whether that type has ever been checked against a running
instance. (13 from Oracle's own sample gallery + 11 independently-authored
apps from `ujnak/APEXlang-exports` (MIT) + 18 more from `github.com/
oracle/apex`'s `26.1` branch (UPL-1.0) + 3 more independent apps
(Apache-2.0/MIT) + 1 more, `concurrent-manager`, this project's own user's
app with no licensing question at all — see `.ai/knowledge/verification.md`.)

Regenerate the counts with:

```bash
node -e "
const { parseApp } = require('./packages/parser/dist/index.js');
const { loadExport } = require('./packages/generator/dist/lib.js');
const fs = require('fs'), path = require('path');
// apps: any real .apx export directories you have locally, loaded via
// the generator's own loadExport() (application.apx, page-groups.apx,
// pages/*.apx) -- the same loader generate()/computeDiff() use, so this
// table's denominators can never drift from what the toolkit itself reads.
"
```

(The 46 real exports used to produce this table are not committed to this
repo — see docs/license-check.md on redistribution rights. Re-run against
your own exports to reproduce or extend it.)

## Region types

| Type | Apps | Total | Live verification |
|---|---|---|---|
| `staticContent` | 46/46 | 2849 | N/A — not a widget region |
| `breadcrumb` | 31/46 | 836 | N/A — not a widget region |
| `classicReport` | 35/46 | 499 | No region-level component (no `apex.region()` widget dispatch for this type), but its COLUMN HEADERS are now **verified** — `report-column.ts`'s `reportColumnHeader()`/`classicReportColumnById()`, confirmed live (Eighth round, 2026-08-01) against `item-detail-full`'s `child-records` region |
| `interactiveReport` | 29/46 | 377 | **Verified** — generic `ApexRegion` (refresh, getSessionState, getCurrentRecordId, getRecordValues, getSelectedValues, focus, getViewName); search/sort/pagination confirmed private (`_`-prefixed) at the JS-widget-API level; `expectRegionsResolve()` also confirmed live (ADR-003 htmlDomId-resolved where set). UPDATE (Eighth round, 2026-08-01): search/sort ARE now verified through a genuinely different path — accessible-role UI locators, not the JS API — see `interactive-report.ts`/`report-column.ts` and `docs/quirks/26.1.json` `interactive-report-accessible-locator-search-sort`. Pagination still not verified (no live multi-page dataset available) |
| `list` | 29/46 | 192 | Not verified — no dedicated region component. Its row-level actions were investigated (Eighth round, 2026-08-01, `faceted-search-content-row`): rendered behind a "Row Actions" menu, a confirmed-different DOM contract from Cards' `action-d` (see `region-action.ts` module doc) — not wrapped, see `docs/quirks/26.1.json` `region-action-cards-not-unique-inert` |
| `chart` | 14/46 | 149 | **Verified** — `ApexChartRegion` (`getOption`/`setOption`, confirmed live on 3 chart types); generic `ApexRegion.refresh()` also confirmed. Static config typed: `ApexRegion.chartSettings.type` + `ApexRegion.htmlDomId`. Corrects an earlier wrong claim that `apex.region(id).widget()` returns `null` for charts — it does not (see `docs/quirks/26.1.json` `chart-region-widget-returns-null`). Also confirmed live: declared type ≠ runtime type in at least one case (`donut` reports as `pie` — `chart-declared-type-not-runtime-type`) |
| `regionDisplaySelector` | 16/46 | 143 | Not verified |
| `form` | 14/46 | 114 | N/A — items within forms verified individually via `item.ts` |
| `dynamicContent` | 11/46 | 104 | Not verified, no dedicated component. Promoted from the long-tail catch-all row to its own line in an earlier round — no longer a rare type (11/46 apps, 104 instances) |
| `themeTemplateComponent/contentRow` | 9/46 | 93 | Not verified — see the `themeTemplateComponent/*` aggregate note below the table |
| `interactiveGrid` | 11/46 | 101 | **Verified** — `ApexInteractiveGridRegion` (getActions, getViews, getCurrentView, getCurrentViewId, getSelectedRecords); auto-generated `getCurrentViewId()` check when `htmlDomId` is set |
| `cards` | 12/46 | 61 | **Verified** — `ApexCardsRegion` (pagination, selection); `getRecords`/`getModel` confirmed broken. Row-level actions ALSO verified for presence (Eighth round, 2026-08-01, `region-action.ts`) — click-through effects confirmed a dead end on this app, presence-only, see `docs/quirks/26.1.json` `region-action-cards-not-unique-inert` |
| `plugin/componentInstructions` | 1/46 | 53 | Not verified — see the `plugin/*` aggregate note below the table |
| `plSqlDynamicContent` | 11/46 | 52 | Not verified, no dedicated component. Also promoted to its own line in an earlier round (11/46 apps, 52 instances) |
| `plugin/sourceDisplay` | 8/46 | 49 | Not verified — `plugin/*` aggregate |
| `facetedSearch` | 9/46 | 46 | **Verified** — `ApexFacetsRegion` (facet counts, apply/clear) |
| `plugin/previewTemplateOptions` | 1/46 | 43 | Not verified — `plugin/*` aggregate |
| `calendar` | 10/46 | 41 | Typed-but-unverified — `ApexRegion.calendarSettings` is now typed (parser-only), but the `Calendar` runtime stub remains unbuilt: zero live ground truth |
| `search` | 3/46 | 28 | Not verified — AI-powered search results region (gated on `CURRENT_AI_PROVIDER`), no dedicated component |
| `map` | 6/46 | 18 | Not verified — `MapRegion` stub, zero live ground truth. `htmlDomId` confirmed set on 11/18 `map` regions in an earlier round (`sample-maps`), the richest static confirmation of this mechanism on `map` yet (previously a single instance, `ujnak/draw-polygon-on-map`) |
| `listView` | 9/46 | 14 | Not verified — no dedicated component. Real ground truth grew sharply in an earlier round (was 1/24, total 1; now 9/46, total 14) |
| `tree` | 4/46 | 4 | **Corrected in an earlier round** — previously documented as "partially explored... standard `t_TreeNav` navigation widget reused as a login picker, not a distinct content pattern." Three genuine CONTENT tree regions found in that batch: `sample-trees` (Oracle's own dedicated Tree sample app, region `task-tree`), `universal-theme-reference` (region `demo-2` on the dedicated `p01901-tree.apx` showcase page), `cloud-apps-rest-explorer` (region `business-objects-tree`, a real REST-endpoint tree browser). All three have `htmlDomId` set (`task_tree`, `Demo1`, `bo-tree`). Tree IS a real, distinct content pattern — the `TreeRegion` stub in `unsupported.ts` still has zero LIVE ground truth (static-only), but the "not a distinct pattern" framing was wrong and is corrected here, not silently dropped. `concurrent-manager` (the newest app in the corpus) has zero `tree` regions — no change to this count from that addition |
| `reflowReport` | 1/46 | 3 | Not verified — genuinely new region type in an earlier round (`universal-theme-reference`, `p01710-reflow-report.apx`/`p01711-...-mobile-examples.apx`), not part of any previously-known catch-all bucket |
| `columnToggleReport` | 1/46 | 3 | Not verified — genuinely new region type in an earlier round (`universal-theme-reference`, `p01720-column-toggle-report.apx`/`p01721-...-mobile-examples.apx`), not part of any previously-known catch-all bucket |
| `smartFilters` | 5/46 | 10 | Not verified |
| `workflowDiagram` | 3/46 | 4 | Not verified |
| `helpText` | 1/46 | 1 | Not verified — genuinely new region type in an earlier round (`universal-theme-reference`, `p01903-help-text.apx`) |
| `appTemplateComponent/contentRowSimple` | 1/46 | 2 | Not verified — genuinely new region-type PREFIX in an earlier round (`strategic-planner`). Distinct from the existing `themeTemplateComponent/*` prefix — first confirmed instance of an `appTemplateComponent/*` namespace anywhere in this project's corpus |
| all remaining `plugin/*` subtypes (`translatedMessage`, `regionSourceCode`, `badgeList`, `tagCloud`, `html5BarChart`, `contentValidator`, `markdownRegion`, `authorizationAdministration`, `aclWarning`, `miniCalendar`, `aclStatus`, `timelineAndStatusList`, `jetLegend`, `legacyOracleHtml5MapsRegion`, `completeness`, `validateContent`, `sampleAppsFooter`) | 1–11/46 each | 1–27 | Not verified, no dedicated component for any of them. Many more distinct `plugin/*` subtypes surfaced in an earlier round than in the 24-app corpus (chiefly from `universal-theme-reference`, `customers`, `strategic-planner`) — all still fall under the generic `plugin/*` unmodeled bucket, not a new category of gap |
| all remaining `themeTemplateComponent/*` subtypes (`comments`, `flexboxContainer`, `metricCard`, `avatar`, `mediaList`, `timeline`) | 1–4/46 each | 1–13 | Not verified, no dedicated component for any of them |

`concurrent-manager` (the 46th app, added after the batch above — see
`.ai/knowledge/verification.md`) contributed real instances of 10 already-
known region types (`breadcrumb`, `staticContent`, `interactiveGrid`,
`interactiveReport`, `classicReport`, `form`, `chart`, `cards`,
`regionDisplaySelector`, `dynamicContent` — the ten rows whose Apps/Total
counts above increased by exactly 1 app / this app's per-type instance
count from the previous 45-app snapshot) but **zero genuinely new region
types** — checked specifically per `.ai/checklists/new-verification-app.md`,
not assumed clean by default.

Also notable: `htmlDomId` (ADR-003's "universal mechanism") was confirmed
present in real static export data on a substantially wider set of region
types this round than ever before — in addition to the previously
confirmed Chart/Interactive Grid/Interactive Report/map/classicReport,
this batch adds direct static confirmation on `staticContent`, `list`,
`plugin/badgeList`, `themeTemplateComponent/contentRow`,
`plSqlDynamicContent`, `regionDisplaySelector`, `themeTemplateComponent/
comments`, `breadcrumb`, `dynamicContent`, `cards`, `facetedSearch`,
`smartFilters`, `plugin/componentInstructions`, `search`, `reflowReport`,
`columnToggleReport`, `themeTemplateComponent/avatar`, `mediaList`,
`timeline`, `metricCard`, `flexboxContainer`, `plugin/html5BarChart`, and
`plugin/tagCloud` — 22 more region types than the five previously
confirmed, all consistent with (nothing contradicts) ADR-003's "universal
mechanism, not gated to specific types" finding. Static-only confirmation
(no live instance available for any of these 21 new apps) — see
`docs/quirks/26.1.json` `region-id-not-static-id` and
`docs/grammar-assumptions.md` for the full breakdown.

`concurrent-manager` (the 46th app) was checked against this specifically,
per `.ai/checklists/new-verification-app.md` — `htmlDomId` is present on
17/159 of its regions, across `staticContent`, `interactiveReport`,
`interactiveGrid`, and `dynamicContent`, all four already on the confirmed
list above. No new region type added to this list from this app; nothing
found to contradict ADR-003 either.

## Item types

| Type | Apps | Total | Live verification |
|---|---|---|---|
| `hidden` | 35/46 | 1330 | **Verified** — `apex.item()` round-trip |
| `textField` | 46/46 | 689 | **Verified** |
| `selectList` | 30/46 | 459 | **Verified** — basic get/set only; richer label/value/option-list interaction not verified |
| `displayOnly` | 23/46 | 251 | Not verified |
| `textarea` | 25/46 | 216 | **Verified** |
| `switch` | 16/46 | 145 | Not verified — `Switch` stub |
| `numberField` | 21/46 | 131 | **Verified** |
| `datePicker` | 21/46 | 128 | **Verified** — basic get/set only; calendar-widget interaction (`date.select("2026-04-10")`-style) not verified |
| `radioGroup` | 16/46 | 112 | Not verified — `RadioGroup` stub |
| `checkboxGroup` | 16/46 | 70 | Not verified |
| `popupLov` | 10/46 | 49 | Not verified — `PopupLov` stub |
| `password` | 41/46 | 48 | Partially — `login()`'s `.fill()` works against it in practice, but not verified via the generic `ApexItem`/`apex.item()` round-trip the way the other types are |
| `checkbox` | 26/46 | 40 | Not verified, not stubbed either — likely tractable, just never exercised live |
| `fileUpload` | 12/46 | 39 | Not verified — `FileBrowse` stub |
| `selectOne` | 4/46 | 37 | Not verified — new type as of an earlier round, real ground truth grew in that batch (was 1/24, now 4/46) |
| `richTextEditor` | 4/46 | 27 | Not verified — `RichText` stub |
| `displayImage` | 5/46 | 17 | Not verified |
| `combobox` | 2/46 | 10 | Not verified — genuinely new item type in an earlier round (`universal-theme-reference`, `strategic-planner`) |
| `imageUpload` | 4/46 | 7 | Not verified |
| `markdownEditor` | 3/46 | 6 | Not verified |
| `shuttle` | 4/46 | 4 | Not verified — `Shuttle` stub |
| `stopAndStartGridLayout` | 2/46 | 3 | Not verified — genuinely new item type in an earlier round; a layout pseudo-item (Universal Theme grid row start/stop marker inside a `form` region), not a data-bearing field. First confirmed in `customers` (`pageItem P7_SS ( type: stopAndStartGridLayout )`), also in `team-calendar` |
| `colorPicker` | 1/46 | 2 | Not verified — genuinely new item type in an earlier round (`universal-theme-reference`) |
| `percentGraph` | 1/46 | 2 | Not verified — genuinely new item type in an earlier round (`universal-theme-reference`) |
| `textFieldWithAutocomplete` | 2/46 | 2 | Not verified — genuinely new item type in an earlier round |
| `datePickerJquery` | 1/46 | 1 | Not verified |
| `plugin/slider` | 1/46 | 1 | Not verified |
| `displayMap` | 1/46 | 1 | Not verified — genuinely new item type in an earlier round (`sample-maps`) |
| `listManager` | 1/46 | 1 | Not verified — genuinely new item type in an earlier round |
| `qrCode` | 1/46 | 1 | Not verified — genuinely new item type in an earlier round (`universal-theme-reference`) |
| `selectMany` | 1/46 | 1 | Not verified — genuinely new item type in an earlier round |
| `starRating` | 1/46 | 1 | Not verified — genuinely new item type in an earlier round (`universal-theme-reference`) |

`concurrent-manager` (the 46th app) contributed real instances of 15
already-known item types (`textField`, `hidden`, `numberField`,
`selectList`, `datePicker`, `textarea`, `switch`, `displayOnly`,
`radioGroup`, `popupLov`, `checkboxGroup`, `richTextEditor`,
`markdownEditor`, `password`, `checkbox`) but **zero genuinely new item
types** — checked specifically, including this app's own custom item
plugin (`shared-components/plugins/item/advancedSlider`), which turned
out to be defined but never actually placed on any page item in this
export, so it contributes no `plugin/*` instance either. See
`examples/verified-apps/concurrent-manager/RESULTS.md`.

Note on item-type completeness: the official APEXlang EBNF types
`pageItem`'s `type` property as an open `<string-like-value>` ("type:
SUPPORTED UI") with no enumerated list — this project's item-type
inventory is real-data-driven by design, not a checklist against a fixed
grammar enum. New item type strings surfacing with each new app is
expected behavior, not a parser gap, and doesn't contradict ADR-004
(grammar silent, real data fills the gap — real data wins).

## Dynamic Actions

Unlike regions/items, Dynamic Actions aren't one-per-page-per-slot the
same way — this tracks total count per app instead of an app-diversity
ratio. Typed as of this round (`ApexPage.dynamicActions`) — see
docs/grammar-assumptions.md and the Tier 1 entry in
docs/ecosystem-roadmap.md for the full grammar and what's verified vs.
not.

| App | Dynamic Actions |
|---|---|
| `strategic-planner` | 380 |
| `opportunities` | 199 |
| `customers` | 163 |
| `poll` | 96 |
| `workflow-approvals` | 77 |
| `team-calendar` | 71 |
| `sample-calendar` | 55 |
| `sample-charts` | 48 |
| `concurrent-manager` | 46 |
| `universal-theme-reference` | 43 |
| `sample-master-detail` | 41 |
| `qask` | 30 |
| `sample-dynamic-actions` | 24 |
| `sample-application-search` | 23 |
| `brookstrut` | 20 |
| `sample-maps` | 19 |
| `cloud-apps-rest-explorer` | 16 |
| `sample-rest-services` | 15 |
| `apextogo` | 14 |
| `sample-data-loading` | 13 |
| `interactive-grids` | 11 |
| `json-duality-views` | 10 |
| `sample-reporting` | 10 |
| `sample-email-authentication` | 9 |
| `sample-vector-search` | 8 |
| `sample-trees` | 5 |
| `image-support-rte` | 3 |
| `sample-collections` | 3 |
| `apex-pwa-reference` | 3 |
| `sample-cards` | 2 |
| `XLIFF-TRANSLATE` | 2 |
| `driving-with-apex` | 1 |
| `employee-management` | 1 |
| `menu-popup-with-action` | 1 |
| `salary-management-agent` | 1 |
| `test-button-show-as-disabled-261` | 1 |
| `sample-file-upload-download` | 1 |
| `ai-procurement-agents` | 1 |
| `CSP-REPORT` | 0 |
| `draw-polygon-on-map` | 0 |
| `get-table-info-by-apex-db-dictionary` | 0 |
| `sample-terminal-emulator` | 0 |
| `world-diner` | 0 |
| `sample-document-generator` | 0 |
| `cymbal-coffee-ops` | 0 |
| `apex-plsql-dynamic-content-home` | 0 |
| **Total** | **1466** |

Verification status: metadata only (trigger, condition, nested actions
all typed and diffable). Zero live ground truth on runtime triggering —
no known way to fire a named Dynamic Action from `@apx/testkit` yet, and
typed metadata doesn't change that (see docs/ecosystem-roadmap.md
"Dynamic Action triggering").

## Branches

`branch (...)` — page-processing redirect rules. Typed as of the Seventh
round (`ApexPage.branches`) — see docs/grammar-assumptions.md's
2026-07-27 entry and docs/ecosystem-roadmap.md's "Seventh round
(2026-07-27)" for the full grammar, the confirmed EBNF-vs-real-data
discrepancy on `target`'s shape, and why there is deliberately no runtime
component (parser-only, per ADR-002's precedent).

| App | Branches |
|---|---|
| `poll` | 40 |
| `customers` | 33 |
| `qask` | 33 |
| `strategic-planner` | 30 |
| `opportunities` | 27 |
| `team-calendar` | 25 |
| `brookstrut` | 18 |
| `sample-vector-search` | 13 |
| `sample-collections` | 9 |
| `sample-dynamic-actions` | 9 |
| `concurrent-manager` | 9 |
| `sample-master-detail` | 8 |
| `sample-trees` | 7 |
| `universal-theme-reference` | 7 |
| `apextogo` | 6 |
| `sample-rest-services` | 6 |
| `sample-data-loading` | 5 |
| `sample-email-authentication` | 5 |
| `sample-file-upload-download` | 5 |
| `sample-calendar` | 4 |
| `sample-workflow-approvals` | 4 |
| `sample-application-search` | 3 |
| `json-duality-views` | 3 |
| `sample-reporting` | 3 |
| `sample-interactive-grids` | 2 |
| `sample-charts` | 2 |
| `sample-maps` | 1 |
| **Total (27/46 apps)** | **317** |

Verification status: typed metadata only, no runtime component by design
— the only externally observable effect (which page/URL is landed on) is
already assertable today via `@apx/testkit`'s `page.url()` with zero
branch-specific code.

## Validations

`validation <id> (...)` — server-side field/page validation rules. Typed
as of the Seventh round (`ApexPage.validations`) — see
docs/grammar-assumptions.md's 2026-07-27 entry. NOT the same construct as
`ApexItem.required` (a different, already-typed `validation {
valueRequired }` group that lives directly on an item).

| App | Validations |
|---|---|
| `opportunities` | 57 |
| `strategic-planner` | 50 |
| `customers` | 48 |
| `team-calendar` | 35 |
| `poll` | 31 |
| `qask` | 25 |
| `sample-workflow-approvals` | 19 |
| `sample-vector-search` | 15 |
| `concurrent-manager` | 14 |
| `sample-interactive-grids` | 13 |
| `sample-master-detail` | 9 |
| `sample-data-loading` | 7 |
| `sample-email-authentication` | 6 |
| `brookstrut` | 4 |
| `sample-rest-services` | 2 |
| `sample-trees` | 2 |
| `sample-calendar` | 1 |
| `sample-collections` | 1 |
| `sample-file-upload-download` | 1 |
| **Total (19/46 apps)** | **340** |

Verification status: typed metadata (`ApexPage.validations`) AND a real,
live-verified runtime component, as of 2026-08-01 — resolves the prior
"deferred pending live-verification check" note. Confirmed live against
Sample Interactive Grids page 31 ("Validation") that Interactive Grid
validation failures split into TWO real mechanisms, both now covered:
page-level SQL `validation()` (`comm-limit`, `hire-date-in-past`) goes
through the existing `apex.message`/`#APEX_ERROR_MESSAGE` wrapper
(`expectError()` in `packages/testkit/src/components/messages.ts`, zero
new code needed), while column-level `valueRequired` is a genuinely
different CLIENT-SIDE check (`apex.message.alert()`, a modal, not the
page banner) now covered by new `expectAlert()`/`dismissAlert()`
helpers in the same file. See docs/ecosystem-roadmap.md's Seventh round
"Resolution (2026-08-01)" subsection and
docs/quirks/26.1.json's `interactive-grid-validation-mechanism-split`
entry for full evidence. Live spec:
`spike/tests/interactive-grid-validation-demo.spec.ts`.

## Processes

`process <id> (...)` — page-processing PL/SQL or built-in DML rules. Typed
as of the "Continuation" pass (`ApexPage.processes`) — see
docs/grammar-assumptions.md's 2026-07-29 entry and
docs/ecosystem-roadmap.md's "Continuation (same pass): the remaining 15
unmodeled types" for the full grammar, the confirmed EBNF gap on the
undocumented `target {}` group, and why there is deliberately no runtime
component (same ADR-002 precedent as `branch`).

| App | Processes |
|---|---|
| `strategic-planner` | 341 |
| `opportunities` | 231 |
| `customers` | 211 |
| `poll` | 113 |
| `team-calendar` | 95 |
| `sample-workflow-approvals` | 77 |
| `sample-master-detail` | 67 |
| `concurrent-manager` | 61 |
| `qask` | 59 |
| `brookstrut` | 36 |
| `sample-interactive-grids` | 31 |
| `sample-application-search` | 28 |
| `sample-rest-services` | 28 |
| `sample-dynamic-actions` | 27 |
| `sample-vector-search` | 27 |
| `sample-collections` | 25 |
| `sample-data-loading` | 22 |
| `json-duality-views` | 21 |
| `sample-calendar` | 19 |
| `sample-email-authentication` | 19 |
| `sample-trees` | 19 |
| `cloud-apps-rest-explorer` | 18 |
| `apextogo` | 17 |
| `sample-file-upload-download` | 14 |
| `XLIFF-TRANSLATE` | 13 |
| `sample-reporting` | 12 |
| `image-support-rte` | 9 |
| `sample-cards` | 8 |
| `sample-document-generator` | 8 |
| `employee-management` | 7 |
| `sample-charts` | 6 |
| `CSP-REPORT` | 5 |
| `get-table-info-by-apex-db-dictionary` | 5 |
| `menu-popup-with-action` | 5 |
| `sample-terminal-emulator` | 5 |
| `test-button-show-as-disabled-261` | 5 |
| `sample-maps` | 5 |
| `universal-theme-reference` | 5 |
| `draw-polygon-on-map` | 4 |
| `driving-with-apex` | 4 |
| `salary-management-agent` | 4 |
| `world-diner` | 4 |
| `cymbal-coffee-ops` | 4 |
| `ai-procurement-agents` | 4 |
| `apex-plsql-dynamic-content-home` | 4 |
| **Total (45/46 apps)** | **1732** |

Verification status: typed metadata only, no runtime component by design
— the only externally observable effect (resulting page state after a DML
process, or a post-process redirect) is already assertable today via
existing `@apx/testkit` mechanisms with zero process-specific code.

## Computations

`computation <id> (...)` — item-value-setting rules (static value, SQL
query, PL/SQL function body, or expression). Typed as of the
"Continuation" pass (`ApexPage.computations`) — see
docs/grammar-assumptions.md's 2026-07-29 entry. NOT the same construct as
`computation-b` (a report/IG computed-column production nested inside a
region's `savedReport` child — out of scope, see `ApexComputation`'s doc
comment for the real contamination this distinction was cross-checked
against before these counts were recorded).

| App | Computations |
|---|---|
| `strategic-planner` | 165 |
| `customers` | 29 |
| `poll` | 29 |
| `qask` | 29 |
| `opportunities` | 28 |
| `team-calendar` | 21 |
| `sample-charts` | 17 |
| `sample-workflow-approvals` | 15 |
| `brookstrut` | 10 |
| `sample-master-detail` | 7 |
| `sample-data-loading` | 7 |
| `sample-email-authentication` | 4 |
| `apextogo` | 3 |
| `cloud-apps-rest-explorer` | 3 |
| `sample-vector-search` | 2 |
| `json-duality-views` | 1 |
| `sample-document-generator` | 1 |
| `sample-rest-services` | 1 |
| `sample-trees` | 1 |
| **Total (19/46 apps)** | **373** |

Verification status: typed metadata only, no runtime component by design
— same reasoning as `process`/`branch`.

## Report columns (`ApexRegion.columns`)

`column <id> (...)` — classicReport/Interactive Report/Interactive Grid
column definitions (label/heading, format, sort, link target), lexically
nested inside a region. Typed as of the "Continuation" pass
(`ApexRegion.columns`) — see docs/grammar-assumptions.md's 2026-07-29
entry for the confirmed EBNF discrepancy on `columnName` never being a
real body property (the identifier slot always carries it instead) and
the `link.target` nested-object shape (same class of finding as
`branch.target`). Deliberately NOT the chart-internal `axis`/`series`/
`column` styling trio already rejected in an earlier round — a different,
unrelated EBNF production, checked side by side to keep the two distinct.

| App | Columns |
|---|---|
| `strategic-planner` | 3152 |
| `opportunities` | 1374 |
| `customers` | 977 |
| `concurrent-manager` | 650 |
| `sample-interactive-grids` | 484 |
| `poll` | 450 |
| `universal-theme-reference` | 352 |
| `sample-master-detail` | 344 |
| `brookstrut` | 336 |
| `sample-reporting` | 312 |
| `sample-data-loading` | 291 |
| `team-calendar` | 282 |
| `qask` | 254 |
| `sample-workflow-approvals` | 250 |
| `sample-rest-services` | 171 |
| `sample-dynamic-actions` | 127 |
| `sample-maps` | 90 |
| `json-duality-views` | 89 |
| `ai-procurement-agents` | 86 |
| `sample-email-authentication` | 74 |
| `sample-file-upload-download` | 66 |
| `cloud-apps-rest-explorer` | 61 |
| `apex-pwa-reference` | 56 |
| `sample-calendar` | 52 |
| `apextogo` | 51 |
| `sample-charts` | 48 |
| `sample-collections` | 40 |
| `menu-popup-with-action` | 32 |
| `image-support-rte` | 27 |
| `XLIFF-TRANSLATE` | 26 |
| `sample-trees` | 20 |
| `sample-vector-search` | 14 |
| `CSP-REPORT` | 14 |
| `employee-management` | 10 |
| `salary-management-agent` | 8 |
| `world-diner` | 4 |
| `sample-application-search` | 3 |
| `sample-cards` | 3 |
| `sample-document-generator` | 3 |
| **Total (39/46 apps)** | **10683** |

Verification status: typed metadata AND a real runtime component, as of
the Eighth round (2026-08-01) live-discovery pass —
`packages/testkit/src/components/report-column.ts`. Confirmed live against
both `classicReport` (`item-detail-full`) and `interactiveReport`
(`browse-interactive-report`) regions in UX Pattern Catalog:
`reportColumnHeader()`/`expectReportColumnHeadersPresent()` (accessible
`columnheader` role, works for both region types) and
`classicReportColumnById()` (classicReport ONLY — the column's DOM id
equals the `.apx` identifier verbatim, a column-level extension of
ADR-003's region-level `htmlDomId` finding; `interactiveReport`'s column
DOM id is a confirmed-undiscoverable internal numeric id, the same
"layer 3" class of finding as region ids without `htmlDomId`). Sort-state
assertions (`aria-sort`) for Interactive Report columns live in
`interactive-report.ts` — see that component's own coverage entry. See
docs/quirks/26.1.json (`classic-report-column-id-verbatim`,
`interactive-report-column-id-internal`) for full evidence.

## Region actions (`ApexRegion.actions`)

`action <id> (...)` — a stand-alone row-level action/link nested directly
inside a Cards/List-family region. Typed as of the "Continuation" pass
(`ApexRegion.actions`, deliberately named `ApexRegionAction`) — see
docs/grammar-assumptions.md's 2026-07-29 entry for the confirmed
distinction from the Dynamic-Action `action` (`ApexDAAction`, unaffected
by this pass) and the confirmed-common `type`/`position` omission
(implicit default, not asserted with full certainty).

| App | Region actions |
|---|---|
| `strategic-planner` | 111 |
| `sample-workflow-approvals` | 20 |
| `apextogo` | 14 |
| `sample-cards` | 14 |
| `universal-theme-reference` | 10 |
| `brookstrut` | 7 |
| `sample-rest-services` | 5 |
| `sample-document-generator` | 3 |
| `sample-maps` | 2 |
| `qask` | 2 |
| `sample-application-search` | 1 |
| `json-duality-views` | 1 |
| `sample-reporting` | 1 |
| `cloud-apps-rest-explorer` | 1 |
| **Total (14/46 apps)** | **192** |

Verification status: typed metadata AND a real, but deliberately
RESTRAINED, runtime component, as of the Eighth round (2026-08-01)
live-discovery pass — `packages/testkit/src/components/region-action.ts`.
Confirmed live against a Cards region (`faceted-search-cards`) and a List
region (`faceted-search-content-row`) in UX Pattern Catalog:
`regionActionLocator()`/`expectRegionActionPresent()` cover PRESENCE only
(the Cards `action-d` direct-link/button rendering; confirmed NOT unique
per region — the same label repeats once per record, with no confirmed
way to scope to a specific record). Click-through EFFECTS are explicitly
NOT asserted — confirmed a dead end on this app (every tested action, both
Cards and List, is a non-functional placeholder: no navigation, no
network activity). List's `action-e` variant renders behind a "Row
Actions" menu, a confirmed-different two-step DOM contract, deliberately
not wrapped in this pass. The Dynamic-Action `action` variant,
`ApexDAAction`, is unaffected and unrelated — see its own entry above. See
docs/quirks/26.1.json `region-action-cards-not-unique-inert`.

## Item LOV references (`ApexItem.lovName`)

A named-LOV *reference* on an item (`lov { type: sharedComponent, lov:
@name }`), gated to `selectList`/`radioGroup`/`popupLov` per Product
Architect's explicit narrow-scope decision (Seventh round). NOT the LOV
*definition* itself (`shared-components/lovs.apx`'s actual list of
values) — that remains out of `loadExport()`'s scope entirely.

| App | Gated-type shared-LOV references |
|---|---|
| `customers` | 158 |
| `opportunities` | 140 |
| `poll` | 80 |
| `sample-master-detail` | 60 |
| `team-calendar` | 54 |
| `sample-dynamic-actions` | 40 |
| `strategic-planner` | 38 |
| `brookstrut` | 28 |
| `concurrent-manager` | 24 |
| `sample-calendar` | 20 |
| `sample-trees` | 16 |
| `qask` | 12 |
| `sample-workflow-approvals` | 10 |
| `sample-reporting` | 8 |
| `sample-data-loading` | 6 |
| `sample-cards` | 4 |
| `sample-collections` | 4 |
| `employee-management` | 4 |
| `sample-email-authentication` | 4 |
| `sample-rest-services` | 3 |
| `sample-maps` | 2 |
| `universal-theme-reference` | 2 |
| `cloud-apps-rest-explorer` | 1 |
| **Total (23/46 apps)** | **718** |

Verification status: typed metadata only. Real data confirms the
identical `lov { type: sharedComponent, lov: @name }` shape is also
common on `checkboxGroup`/`selectOne`/`displayOnly`/`shuttle`/
`textFieldWithAutocomplete` items across this corpus — deliberately left
ungated (stays in `raw`), not because those types lack the data.
Runtime PopupLOV support is unchanged by this — still zero live ground
truth for the open/search/select widget flow (`unsupported.ts`).

## Reading this table

- **High app-count + verified**: the safe, load-bearing parts of this
  toolkit (`hidden`, `textField`, `textarea`, `numberField`, generic
  region methods). Confidence here is earned, not assumed.
- **High app-count + not verified** (`classicReport`, `list`,
  `breadcrumb`, `regionDisplaySelector`, `selectList`'s richer
  interactions, `dynamicContent`, `plSqlDynamicContent` — the latter two
  newly promoted out of the long-tail this round): common in the wild,
  genuinely worth closing next — common doesn't mean easy, but it does
  mean a live-verification pass here pays off across the most real apps.
- **Low app-count, whether verified or not** (`tree`, `listView`,
  `search`, `reflowReport`, `columnToggleReport`, `helpText`,
  `appTemplateComponent/contentRowSimple`, the one-off item types): rare
  enough in this project's corpus that building anything beyond what's
  already there would be speculative regardless of effort spent. `tree`
  moved from "assumed not a real pattern" to "confirmed real, still rare"
  this round — a correction, not just a count bump.
- **Verified-but-partial** (`chart`, `password`): the honest middle
  ground — real capability confirmed, but not the full story. Treat
  these as "safe for what's documented," not "fully covered."
- **Typed-but-unverified** (Dynamic Actions, Calendar's `calendarSettings`,
  Chart's `chartSettings`): real, structured metadata with zero runtime
  capability behind it yet. Don't conflate "the parser understands this"
  with "the testkit can act on this."

This table is a snapshot from a specific set of 46 exports, not a live
report — re-run the script above after adding new exports, or after any
new live verification pass, to keep it current. **Correction to a stale
note that used to live here**: an earlier version of this file flagged
`strategic-planner` as having 8 real parser warnings ("quoted
substitution-token property keys", `docs/grammar-assumptions.md`) and
being "NOT a clean zero-warnings parse." That was true when first found,
but the underlying regex was fixed in the same pass (the parser's
`PROPERTY` regex now accepts a quoted-string key, per
`docs/grammar-assumptions.md`) — `strategic-planner` has parsed with
**zero warnings**, same as every other app in the corpus, in every
verification pass since, including this one. Corrected in place here
rather than left to silently imply a still-open gap that no longer
exists.
