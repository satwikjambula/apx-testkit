# Component coverage matrix

Number of real apps was never the right metric on its own — app count
proves the parser handles real-world export variety, but says nothing
about whether any *specific* component has enough diversity behind it, or
whether it's been verified live at all. This tracks both: how many of the
24 real, statically-parsed exports contain each region/item type, and
separately, whether that type has ever been checked against a running
instance. (13 from Oracle's own sample gallery + 11 independently-authored
apps from `ujnak/APEXlang-exports`, MIT licensed — see
`.ai/knowledge/verification.md`.)

Regenerate the counts with:

```bash
node -e "
const { parseApp } = require('./packages/parser/dist/index.js');
const fs = require('fs'), path = require('path');
function loadExport(dir) {
  const files = {};
  const addIf = (rel) => { try { files[rel] = fs.readFileSync(path.join(dir, rel), 'utf8'); } catch {} };
  addIf('application.apx'); addIf('page-groups.apx');
  for (const f of fs.readdirSync(path.join(dir, 'pages')).sort()) {
    if (f.endsWith('.apx')) files['pages/' + f] = fs.readFileSync(path.join(dir, 'pages', f), 'utf8');
  }
  return files;
}
// apps: any real .apx export directories you have locally
"
```

(The 24 real exports used to produce this table are not committed to this
repo — see docs/limitations.md on redistribution rights. Re-run against
your own exports to reproduce or extend it.)

## Region types

| Type | Apps | Total | Live verification |
|---|---|---|---|
| `staticContent` | 24/24 | 685 | N/A — not a widget region |
| `classicReport` | 16/24 | 63 | Not verified — no dedicated component |
| `breadcrumb` | 14/24 | 290 | N/A — not a widget region |
| `list` | 13/24 | 76 | Not verified — no dedicated component |
| `interactiveReport` | 11/24 | 42 | **Verified** — generic `ApexRegion` (refresh, getSessionState, getCurrentRecordId, getRecordValues, getSelectedValues, focus, getViewName); search/sort/pagination confirmed private (`_`-prefixed); `expectRegionsResolve()` also confirmed live (ADR-003 htmlDomId-resolved where set) |
| `form` | 7/24 | 29 | N/A — items within forms verified individually via `item.ts` |
| `interactiveGrid` | 6/24 | 66 | **Verified** — `ApexInteractiveGridRegion` (getActions, getViews, getCurrentView, getCurrentViewId, getSelectedRecords); auto-generated `getCurrentViewId()` check when `htmlDomId` is set |
| `regionDisplaySelector` | 6/24 | 31 | Not verified |
| `cards` | 5/24 | 40 | **Verified** — `ApexCardsRegion` (pagination, selection); `getRecords`/`getModel` confirmed broken |
| `chart` | 4/24 | 107 | **Verified** — `ApexChartRegion` (`getOption`/`setOption`, confirmed live on 3 chart types); generic `ApexRegion.refresh()` also confirmed. Static config typed: `ApexRegion.chartSettings.type` + `ApexRegion.htmlDomId`. Corrects an earlier wrong claim that `apex.region(id).widget()` returns `null` for charts — it does not (see `docs/quirks/26.1.json` `chart-region-widget-returns-null`). Also confirmed live: declared type ≠ runtime type in at least one case (`donut` reports as `pie` — `chart-declared-type-not-runtime-type`) |
| `calendar` | 3/24 | 25 | Typed-but-unverified — `ApexRegion.calendarSettings` is now typed (parser-only), but the `Calendar` runtime stub remains unbuilt: zero live ground truth |
| `facetedSearch` | 3/24 | 7 | **Verified** — `ApexFacetsRegion` (facet counts, apply/clear) |
| `map` | 3/24 | 4 | Not verified — `MapRegion` stub, zero live ground truth. Notable: `htmlDomId` confirmed set on a `map` region (`draw-polygon-on-map`, first confirmation of `htmlDomId` on this type) |
| `search` | 2/24 | 27 | Not verified — new region type (AI-powered search results, gated on `CURRENT_AI_PROVIDER`), no dedicated component |
| `tree` | 1/24 | 1 | Partially explored — confirmed to be the standard `t_TreeNav` navigation widget reused as a login picker, not a distinct content pattern; `TreeRegion` stub still covers the general case |
| `listView` | 1/24 | 1 | Not verified — new region type, no dedicated component |
| all `plugin/*`, `themeTemplateComponent/*`, `dynamicContent`, `plSqlDynamicContent`, `smartFilters`, `workflowDiagram` | 1–7/24 each | — | Not verified, no dedicated component for any of them |

Also notable: `htmlDomId` confirmed set on `classicReport` regions too
(`menu-popup-with-action`, `salary-management-agent`) — the fourth and
fifth region types confirmed to use this mechanism (after Chart,
Interactive Grid, Interactive Report), further supporting ADR-003's
"universal mechanism, not gated to specific types" finding.

## Item types

| Type | Apps | Total | Live verification |
|---|---|---|---|
| `textField` | 24/24 | 140 | **Verified** |
| `password` | 22/24 | 25 | Partially — `login()`'s `.fill()` works against it in practice, but not verified via the generic `ApexItem`/`apex.item()` round-trip the way the other types are |
| `hidden` | 15/24 | 219 | **Verified** — `apex.item()` round-trip |
| `selectList` | 15/24 | 116 | **Verified** — basic get/set only; richer label/value/option-list interaction not verified |
| `checkbox` | 15/24 | 22 | Not verified, not stubbed either — likely tractable, just never exercised live |
| `textarea` | 11/24 | 40 | **Verified** |
| `displayOnly` | 10/24 | 65 | Not verified |
| `numberField` | 10/24 | 37 | **Verified** |
| `datePicker` | 9/24 | 43 | **Verified** — basic get/set only; calendar-widget interaction (`date.select("2026-04-10")`-style) not verified |
| `switch` | 7/24 | 23 | Not verified — `Switch` stub |
| `radioGroup` | 5/24 | 8 | Not verified — `RadioGroup` stub |
| `checkboxGroup` | 5/24 | 6 | Not verified |
| `fileUpload` | 3/24 | 4 | Not verified — `FileBrowse` stub |
| `shuttle` | 3/24 | 3 | Not verified — `Shuttle` stub |
| `richTextEditor` | 2/24 | 3 | Not verified — `RichText` stub; first static ground truth came from `image-support-rte` |
| `popupLov` | 1/24 | 7 | Not verified — `PopupLov` stub; first static ground truth came from `sample-dynamic-actions` |
| `markdownEditor`, `imageUpload`, `datePickerJquery`, `displayImage`, `plugin/slider`, `selectOne` | 1/24 each | 1–4 | Not verified, no dedicated handling — new types |

## Dynamic Actions

Unlike regions/items, Dynamic Actions aren't one-per-page-per-slot the
same way — this tracks total count per app instead of an app-diversity
ratio. Typed as of this round (`ApexPage.dynamicActions`) — see
docs/grammar-assumptions.md and the Tier 1 entry in
docs/ecosystem-roadmap.md for the full grammar and what's verified vs.
not.

| App | Dynamic Actions |
|---|---|
| `workflow-approvals` | 77 |
| `sample-calendar` | 55 |
| `sample-charts` | 48 |
| `sample-master-detail` | 41 |
| `sample-dynamic-actions` | 24 |
| `sample-application-search` | 23 |
| `brookstrut` | 20 |
| `apextogo` | 14 |
| `interactive-grids` | 11 |
| `sample-vector-search` | 8 |
| `image-support-rte` | 3 |
| `sample-collections` | 3 |
| `sample-cards` | 2 |
| `XLIFF-TRANSLATE` | 2 |
| `driving-with-apex` | 1 |
| `employee-management` | 1 |
| `menu-popup-with-action` | 1 |
| `salary-management-agent` | 1 |
| `test-button-show-as-disabled-261` | 1 |
| `CSP-REPORT` | 0 |
| `draw-polygon-on-map` | 0 |
| `get-table-info-by-apex-db-dictionary` | 0 |
| `sample-terminal-emulator` | 0 |
| `world-diner` | 0 |
| **Total** | **336** |

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
  interactions): common in the wild, genuinely worth closing next —
  common doesn't mean easy, but it does mean a live-verification pass
  here pays off across the most real apps.
- **Low app-count, whether verified or not** (`tree`, `listView`,
  `search`, the one-off item types): rare enough in this project's
  corpus that building anything beyond what's already there would be
  speculative regardless of effort spent.
- **Verified-but-partial** (`chart`, `password`): the honest middle
  ground — real capability confirmed, but not the full story. Treat
  these as "safe for what's documented," not "fully covered."
- **Typed-but-unverified** (Dynamic Actions, Calendar's `calendarSettings`,
  Chart's `chartSettings`): real, structured metadata with zero runtime
  capability behind it yet. Don't conflate "the parser understands this"
  with "the testkit can act on this."

This table is a snapshot from a specific set of 24 exports, not a live
report — re-run the script above after adding new exports, or after any
new live verification pass, to keep it current.
