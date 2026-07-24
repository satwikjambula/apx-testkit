# Component coverage matrix

Number of real apps was never the right metric on its own — app count
proves the parser handles real-world export variety, but says nothing
about whether any *specific* component has enough diversity behind it, or
whether it's been verified live at all. This tracks both: how many of the
13 real, statically-parsed exports contain each region/item type, and
separately, whether that type has ever been checked against a running
instance.

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

(The 13 real exports used to produce this table are not committed to this
repo — see docs/limitations.md on redistribution rights. Re-run against
your own exports to reproduce or extend it.)

## Region types

| Type | Apps | Total | Live verification |
|---|---|---|---|
| `staticContent` | 13/13 | 650 | N/A — not a widget region |
| `classicReport` | 13/13 | 57 | Not verified — no dedicated component |
| `breadcrumb` | 12/13 | 287 | N/A — not a widget region |
| `list` | 12/13 | 75 | Not verified — no dedicated component |
| `interactiveReport` | 8/13 | 39 | **Verified** — generic `ApexRegion` (refresh, getSessionState, getCurrentRecordId, getRecordValues, getSelectedValues, focus, getViewName); search/sort/pagination confirmed private (`_`-prefixed) |
| `regionDisplaySelector` | 6/13 | 31 | Not verified |
| `interactiveGrid` | 5/13 | 64 | **Verified** — `ApexInteractiveGridRegion` (getActions, getViews, getCurrentView, getCurrentViewId, getSelectedRecords) |
| `cards` | 5/13 | 40 | **Verified** — `ApexCardsRegion` (pagination, selection); `getRecords`/`getModel` confirmed broken |
| `form` | 5/13 | 27 | N/A — items within forms verified individually via `item.ts` |
| `chart` | 4/13 | 107 | **Partially verified** — generic `ApexRegion.refresh()` only; `apex.region(id).widget()` confirmed to return `null` for charts (real structural difference from IG/Cards/IR). Static config now also typed: `ApexRegion.chartSettings.type` (parser-only, does not add runtime capability) |
| `calendar` | 3/13 | 25 | Typed-but-unverified — `ApexRegion.calendarSettings` is now typed (parser-only), but the `Calendar` runtime stub remains unbuilt: zero live ground truth |
| `facetedSearch` | 3/13 | 7 | **Verified** — `ApexFacetsRegion` (facet counts, apply/clear) |
| `search` | 2/13 | 27 | Not verified — new region type (AI-powered search results, gated on `CURRENT_AI_PROVIDER`), no dedicated component |
| `map` | 2/13 | 3 | Not verified — `MapRegion` stub, zero live ground truth |
| `tree` | 1/13 | 1 | Partially explored — confirmed to be the standard `t_TreeNav` navigation widget reused as a login picker, not a distinct content pattern; `TreeRegion` stub still covers the general case |
| `listView` | 1/13 | 1 | Not verified — new region type, no dedicated component |
| all `plugin/*`, `themeTemplateComponent/*`, `dynamicContent`, `plSqlDynamicContent`, `smartFilters`, `workflowDiagram` | 1–7/13 each | — | Not verified, no dedicated component for any of them |

## Item types

| Type | Apps | Total | Live verification |
|---|---|---|---|
| `hidden` | 13/13 | 205 | **Verified** — `apex.item()` round-trip |
| `textField` | 13/13 | 120 | **Verified** |
| `selectList` | 11/13 | 111 | **Verified** — basic get/set only; richer label/value/option-list interaction not verified |
| `password` | 11/13 | 14 | Partially — `login()`'s `.fill()` works against it in practice, but not verified via the generic `ApexItem`/`apex.item()` round-trip the way the other types are |
| `displayOnly` | 9/13 | 63 | Not verified |
| `textarea` | 9/13 | 37 | **Verified** |
| `numberField` | 9/13 | 34 | **Verified** |
| `datePicker` | 8/13 | 42 | **Verified** — basic get/set only; calendar-widget interaction (`date.select("2026-04-10")`-style) not verified |
| `switch` | 6/13 | 17 | Not verified — `Switch` stub |
| `radioGroup` | 5/13 | 8 | Not verified — `RadioGroup` stub |
| `checkboxGroup` | 5/13 | 6 | Not verified |
| `checkbox` | 4/13 | 11 | Not verified, not stubbed either — likely tractable, just never exercised live |
| `shuttle` | 3/13 | 3 | Not verified — `Shuttle` stub |
| `fileUpload` | 2/13 | 2 | Not verified — `FileBrowse` stub |
| `popupLov` | 1/13 | 7 | Not verified — `PopupLov` stub; first static ground truth came from `sample-dynamic-actions` |
| `richTextEditor` | 1/13 | 2 | Not verified — `RichText` stub; first static ground truth came from `image-support-rte` |
| `markdownEditor`, `imageUpload`, `datePickerJquery`, `displayImage`, `plugin/slider`, `selectOne` | 1/13 each | 1–4 | Not verified, no dedicated handling — new types |

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
| **Total** | **329** |

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

This table is a snapshot from a specific set of 13 exports, not a live
report — re-run the script above after adding new exports, or after any
new live verification pass, to keep it current.
