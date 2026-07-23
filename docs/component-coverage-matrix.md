# Component coverage matrix

Number of real apps was never the right metric on its own — 14 apps prove
the parser handles real-world export variety, but say nothing about
whether any *specific* component has enough diversity behind it, or
whether it's been verified live at all. This tracks both: how many of the
12 real, statically-parsed exports contain each region/item type, and
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

(The 12 real exports used to produce this table are not committed to this
repo — see docs/limitations.md on redistribution rights. Re-run against
your own exports to reproduce or extend it.)

## Region types

| Type | Apps | Total | Live verification |
|---|---|---|---|
| `staticContent` | 12/12 | 595 | N/A — not a widget region |
| `classicReport` | 12/12 | 55 | Not verified — no dedicated component |
| `breadcrumb` | 11/12 | 261 | N/A — not a widget region |
| `list` | 11/12 | 73 | Not verified — no dedicated component |
| `interactiveReport` | 7/12 | 26 | **Verified** — generic `ApexRegion` (refresh, getSessionState, getCurrentRecordId, getRecordValues, getSelectedValues, focus, getViewName); search/sort/pagination confirmed private (`_`-prefixed) |
| `regionDisplaySelector` | 6/12 | 31 | Not verified |
| `interactiveGrid` | 5/12 | 64 | **Verified** — `ApexInteractiveGridRegion` (getActions, getViews, getCurrentView, getCurrentViewId, getSelectedRecords) |
| `cards` | 5/12 | 40 | **Verified** — `ApexCardsRegion` (pagination, selection); `getRecords`/`getModel` confirmed broken |
| `form` | 5/12 | 27 | N/A — items within forms verified individually via `item.ts` |
| `chart` | 4/12 | 107 | **Partially verified** — generic `ApexRegion.refresh()` only; `apex.region(id).widget()` confirmed to return `null` for charts (real structural difference from IG/Cards/IR) |
| `calendar` | 3/12 | 25 | Not verified — `Calendar` stub, zero live ground truth |
| `facetedSearch` | 3/12 | 7 | **Verified** — `ApexFacetsRegion` (facet counts, apply/clear) |
| `search` | 2/12 | 27 | Not verified — new region type (AI-powered search results, gated on `CURRENT_AI_PROVIDER`), no dedicated component |
| `map` | 2/12 | 3 | Not verified — `MapRegion` stub, zero live ground truth |
| `tree` | 1/12 | 1 | Partially explored — confirmed to be the standard `t_TreeNav` navigation widget reused as a login picker, not a distinct content pattern; `TreeRegion` stub still covers the general case |
| `listView` | 1/12 | 1 | Not verified — new region type, no dedicated component |
| all `plugin/*`, `themeTemplateComponent/*`, `dynamicContent`, `plSqlDynamicContent`, `smartFilters`, `workflowDiagram` | 1–6/12 each | — | Not verified, no dedicated component for any of them |

## Item types

| Type | Apps | Total | Live verification |
|---|---|---|---|
| `hidden` | 12/12 | 196 | **Verified** — `apex.item()` round-trip |
| `textField` | 12/12 | 106 | **Verified** |
| `selectList` | 10/12 | 94 | **Verified** — basic get/set only; richer label/value/option-list interaction not verified |
| `password` | 10/12 | 13 | Partially — `login()`'s `.fill()` works against it in practice, but not verified via the generic `ApexItem`/`apex.item()` round-trip the way the other types are |
| `displayOnly` | 8/12 | 56 | Not verified |
| `textarea` | 8/12 | 36 | **Verified** |
| `numberField` | 8/12 | 20 | **Verified** |
| `datePicker` | 7/12 | 35 | **Verified** — basic get/set only; calendar-widget interaction (`date.select("2026-04-10")`-style) not verified |
| `switch` | 6/12 | 17 | Not verified — `Switch` stub |
| `radioGroup` | 5/12 | 8 | Not verified — `RadioGroup` stub |
| `checkbox` | 4/12 | 11 | Not verified, not stubbed either — likely tractable, just never exercised live |
| `checkboxGroup` | 4/12 | 5 | Not verified |
| `shuttle` | 2/12 | 2 | Not verified — `Shuttle` stub |
| `fileUpload` | 2/12 | 2 | Not verified — `FileBrowse` stub |
| `richTextEditor` | 1/12 | 2 | Not verified — `RichText` stub; first static ground truth for this type came from `image-support-rte` |
| `markdownEditor`, `imageUpload`, `datePickerJquery`, `displayImage`, `selectOne` | 1/12 each | 1–4 | Not verified, no dedicated handling — new types, first seen in this batch |

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

This table is a snapshot from a specific set of 12 exports, not a live
report — re-run the script above after adding new exports, or after any
new live verification pass, to keep it current.
