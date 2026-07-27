# Component coverage matrix

Number of real apps was never the right metric on its own — app count
proves the parser handles real-world export variety, but says nothing
about whether any *specific* component has enough diversity behind it, or
whether it's been verified live at all. This tracks both: how many of the
45 real, statically-parsed exports contain each region/item type, and
separately, whether that type has ever been checked against a running
instance. (13 from Oracle's own sample gallery + 11 independently-authored
apps from `ujnak/APEXlang-exports` (MIT) + 18 more from `github.com/
oracle/apex`'s `26.1` branch (UPL-1.0) + 3 more independent apps
(Apache-2.0/MIT) — see `.ai/knowledge/verification.md`.)

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

(The 45 real exports used to produce this table are not committed to this
repo — see docs/license-check.md on redistribution rights. Re-run against
your own exports to reproduce or extend it.)

## Region types

| Type | Apps | Total | Live verification |
|---|---|---|---|
| `staticContent` | 45/45 | 2810 | N/A — not a widget region |
| `breadcrumb` | 30/45 | 794 | N/A — not a widget region |
| `classicReport` | 34/45 | 487 | Not verified — no dedicated component |
| `interactiveReport` | 28/45 | 361 | **Verified** — generic `ApexRegion` (refresh, getSessionState, getCurrentRecordId, getRecordValues, getSelectedValues, focus, getViewName); search/sort/pagination confirmed private (`_`-prefixed); `expectRegionsResolve()` also confirmed live (ADR-003 htmlDomId-resolved where set) |
| `list` | 29/45 | 192 | Not verified — no dedicated component |
| `chart` | 13/45 | 145 | **Verified** — `ApexChartRegion` (`getOption`/`setOption`, confirmed live on 3 chart types); generic `ApexRegion.refresh()` also confirmed. Static config typed: `ApexRegion.chartSettings.type` + `ApexRegion.htmlDomId`. Corrects an earlier wrong claim that `apex.region(id).widget()` returns `null` for charts — it does not (see `docs/quirks/26.1.json` `chart-region-widget-returns-null`). Also confirmed live: declared type ≠ runtime type in at least one case (`donut` reports as `pie` — `chart-declared-type-not-runtime-type`) |
| `regionDisplaySelector` | 15/45 | 139 | Not verified |
| `form` | 13/45 | 107 | N/A — items within forms verified individually via `item.ts` |
| `dynamicContent` | 10/45 | 102 | Not verified, no dedicated component. Promoted from the long-tail catch-all row to its own line this round — no longer a rare type (10/45 apps, 102 instances) |
| `themeTemplateComponent/contentRow` | 9/45 | 93 | Not verified — see the `themeTemplateComponent/*` aggregate note below the table |
| `interactiveGrid` | 10/45 | 72 | **Verified** — `ApexInteractiveGridRegion` (getActions, getViews, getCurrentView, getCurrentViewId, getSelectedRecords); auto-generated `getCurrentViewId()` check when `htmlDomId` is set |
| `cards` | 11/45 | 57 | **Verified** — `ApexCardsRegion` (pagination, selection); `getRecords`/`getModel` confirmed broken |
| `plugin/componentInstructions` | 1/45 | 53 | Not verified — see the `plugin/*` aggregate note below the table |
| `plSqlDynamicContent` | 11/45 | 52 | Not verified, no dedicated component. Also promoted to its own line this round (11/45 apps, 52 instances) |
| `plugin/sourceDisplay` | 8/45 | 49 | Not verified — `plugin/*` aggregate |
| `facetedSearch` | 9/45 | 46 | **Verified** — `ApexFacetsRegion` (facet counts, apply/clear) |
| `plugin/previewTemplateOptions` | 1/45 | 43 | Not verified — `plugin/*` aggregate |
| `calendar` | 10/45 | 41 | Typed-but-unverified — `ApexRegion.calendarSettings` is now typed (parser-only), but the `Calendar` runtime stub remains unbuilt: zero live ground truth |
| `search` | 3/45 | 28 | Not verified — AI-powered search results region (gated on `CURRENT_AI_PROVIDER`), no dedicated component |
| `map` | 6/45 | 18 | Not verified — `MapRegion` stub, zero live ground truth. `htmlDomId` confirmed set on 11/18 `map` regions this round (`sample-maps`), the richest static confirmation of this mechanism on `map` yet (previously a single instance, `ujnak/draw-polygon-on-map`) |
| `listView` | 9/45 | 14 | Not verified — no dedicated component. Real ground truth grew sharply this round (was 1/24, total 1; now 9/45, total 14) |
| `tree` | 4/45 | 4 | **Corrected this round** — previously documented as "partially explored... standard `t_TreeNav` navigation widget reused as a login picker, not a distinct content pattern." Three genuine CONTENT tree regions found this batch: `sample-trees` (Oracle's own dedicated Tree sample app, region `task-tree`), `universal-theme-reference` (region `demo-2` on the dedicated `p01901-tree.apx` showcase page), `cloud-apps-rest-explorer` (region `business-objects-tree`, a real REST-endpoint tree browser). All three have `htmlDomId` set (`task_tree`, `Demo1`, `bo-tree`). Tree IS a real, distinct content pattern — the `TreeRegion` stub in `unsupported.ts` still has zero LIVE ground truth (static-only), but the "not a distinct pattern" framing was wrong and is corrected here, not silently dropped |
| `reflowReport` | 1/45 | 3 | Not verified — genuinely new region type this round (`universal-theme-reference`, `p01710-reflow-report.apx`/`p01711-...-mobile-examples.apx`), not part of any previously-known catch-all bucket |
| `columnToggleReport` | 1/45 | 3 | Not verified — genuinely new region type this round (`universal-theme-reference`, `p01720-column-toggle-report.apx`/`p01721-...-mobile-examples.apx`), not part of any previously-known catch-all bucket |
| `smartFilters` | 5/45 | 10 | Not verified |
| `workflowDiagram` | 3/45 | 4 | Not verified |
| `helpText` | 1/45 | 1 | Not verified — genuinely new region type this round (`universal-theme-reference`, `p01903-help-text.apx`) |
| `appTemplateComponent/contentRowSimple` | 1/45 | 2 | Not verified — genuinely new region-type PREFIX this round (`strategic-planner`). Distinct from the existing `themeTemplateComponent/*` prefix — first confirmed instance of an `appTemplateComponent/*` namespace anywhere in this project's corpus |
| all remaining `plugin/*` subtypes (`translatedMessage`, `regionSourceCode`, `badgeList`, `tagCloud`, `html5BarChart`, `contentValidator`, `markdownRegion`, `authorizationAdministration`, `aclWarning`, `miniCalendar`, `aclStatus`, `timelineAndStatusList`, `jetLegend`, `legacyOracleHtml5MapsRegion`, `completeness`, `validateContent`, `sampleAppsFooter`) | 1–11/45 each | 1–27 | Not verified, no dedicated component for any of them. Many more distinct `plugin/*` subtypes surfaced this round than in the 24-app corpus (chiefly from `universal-theme-reference`, `customers`, `strategic-planner`) — all still fall under the generic `plugin/*` unmodeled bucket, not a new category of gap |
| all remaining `themeTemplateComponent/*` subtypes (`comments`, `flexboxContainer`, `metricCard`, `avatar`, `mediaList`, `timeline`) | 1–4/45 each | 1–13 | Not verified, no dedicated component for any of them |

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

## Item types

| Type | Apps | Total | Live verification |
|---|---|---|---|
| `hidden` | 34/45 | 1281 | **Verified** — `apex.item()` round-trip |
| `textField` | 45/45 | 625 | **Verified** |
| `selectList` | 29/45 | 437 | **Verified** — basic get/set only; richer label/value/option-list interaction not verified |
| `displayOnly` | 22/45 | 246 | Not verified |
| `textarea` | 24/45 | 203 | **Verified** |
| `switch` | 15/45 | 134 | Not verified — `Switch` stub |
| `datePicker` | 20/45 | 113 | **Verified** — basic get/set only; calendar-widget interaction (`date.select("2026-04-10")`-style) not verified |
| `radioGroup` | 15/45 | 108 | Not verified — `RadioGroup` stub |
| `numberField` | 20/45 | 104 | **Verified** |
| `checkboxGroup` | 15/45 | 69 | Not verified |
| `password` | 40/45 | 47 | Partially — `login()`'s `.fill()` works against it in practice, but not verified via the generic `ApexItem`/`apex.item()` round-trip the way the other types are |
| `popupLov` | 9/45 | 47 | Not verified — `PopupLov` stub |
| `checkbox` | 25/45 | 39 | Not verified, not stubbed either — likely tractable, just never exercised live |
| `fileUpload` | 12/45 | 39 | Not verified — `FileBrowse` stub |
| `selectOne` | 4/45 | 37 | Not verified — new type as of the previous round, real ground truth grew this batch (was 1/24, now 4/45) |
| `richTextEditor` | 3/45 | 26 | Not verified — `RichText` stub |
| `displayImage` | 5/45 | 17 | Not verified |
| `combobox` | 2/45 | 10 | Not verified — genuinely new item type this round (`universal-theme-reference`, `strategic-planner`) |
| `imageUpload` | 4/45 | 7 | Not verified |
| `markdownEditor` | 2/45 | 5 | Not verified |
| `shuttle` | 4/45 | 4 | Not verified — `Shuttle` stub |
| `stopAndStartGridLayout` | 2/45 | 3 | Not verified — genuinely new item type this round; a layout pseudo-item (Universal Theme grid row start/stop marker inside a `form` region), not a data-bearing field. First confirmed in `customers` (`pageItem P7_SS ( type: stopAndStartGridLayout )`), also in `team-calendar` |
| `colorPicker` | 1/45 | 2 | Not verified — genuinely new item type this round (`universal-theme-reference`) |
| `percentGraph` | 1/45 | 2 | Not verified — genuinely new item type this round (`universal-theme-reference`) |
| `textFieldWithAutocomplete` | 2/45 | 2 | Not verified — genuinely new item type this round |
| `datePickerJquery` | 1/45 | 1 | Not verified |
| `plugin/slider` | 1/45 | 1 | Not verified |
| `displayMap` | 1/45 | 1 | Not verified — genuinely new item type this round (`sample-maps`) |
| `listManager` | 1/45 | 1 | Not verified — genuinely new item type this round |
| `qrCode` | 1/45 | 1 | Not verified — genuinely new item type this round (`universal-theme-reference`) |
| `selectMany` | 1/45 | 1 | Not verified — genuinely new item type this round |
| `starRating` | 1/45 | 1 | Not verified — genuinely new item type this round (`universal-theme-reference`) |

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
| **Total** | **1420** |

Verification status: metadata only (trigger, condition, nested actions
all typed and diffable). Zero live ground truth on runtime triggering —
no known way to fire a named Dynamic Action from `@apx/testkit` yet, and
typed metadata doesn't change that (see docs/ecosystem-roadmap.md
"Dynamic Action triggering").

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

This table is a snapshot from a specific set of 45 exports, not a live
report — re-run the script above after adding new exports, or after any
new live verification pass, to keep it current. **Known gap in this
snapshot**: `strategic-planner` (one of the 45) has 8 real parser
warnings (`docs/grammar-assumptions.md`, "quoted substitution-token
property keys" finding) — its region/item counts above are still
accurate (the malformed lines are isolated to two `link.target.items`
blocks and don't affect region/item projection), but this is the first
app in the corpus that is NOT a clean zero-warnings parse. See
`docs/grammar-assumptions.md`'s "Still open" section.
