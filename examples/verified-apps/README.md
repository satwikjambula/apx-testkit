# Verified apps — real APEX 26.1 app results

Generated `@apx/testgen` output (page objects + smoke specs) and results
summaries for 46 real APEX 26.1 applications this project has used to
verify `@apx/parser` and `@apx/testkit` against a genuinely wide variety of
real, structurally different apps: the original 13 Oracle sample-gallery
apps, 32 more added in a later corpus-expansion pass — 11 independent
apps from `ujnak/APEXlang-exports` (MIT), 18 apps from Oracle's own
`github.com/oracle/apex` 26.1 branch (UPL-1.0), and 3 further independent
apps (Apache-2.0/MIT) — plus 1 more app added after that, `concurrent-
manager`, authored by this project's own user (no licensing question of
any kind — see its own section below). See `.ai/knowledge/verification.md`
for the full provenance and license-check history of every app in this
directory.

## What's here, and what's deliberately NOT here

Each app's folder contains:
- `generated/` — the actual `.page.ts`/`.spec.ts` files `@apx/testgen`
  produced from that app's real export (this project's own derived tool
  output).
- `RESULTS.md` — a results summary: parse stats (pages/regions/items/
  buttons/dynamic actions), region-type diversity, determinism
  confirmation (`apx-diff` self-diff), and live-verification status.
- For the two apps with a live running instance available
  (`interactive-grids`, `sample-charts`): a real `coverage-report.txt`
  (`apx-coverage` output) and `self-diff-report.txt`
  (`apx-diff` output), copied verbatim.

**The raw `.apx` export data is deliberately NOT included, for any app in
this directory.** For the original 13 Oracle sample-gallery apps, this is
because redistribution terms for Oracle's actual sample *applications* —
their real page content, demo data, and business logic — have not been
resolved, unlike the APEXlang *format* itself (`docs/license-check.md`
cleared writing an independent parser for the documented grammar; Oracle
explicitly invites that). For the 32 apps added later (11 `ujnak`, MIT; 18
`oracle/apex` 26.1-branch, UPL-1.0; 3 further independent, Apache-2.0/MIT),
the license question is already fully resolved for every one of them —
raw exports are still kept out of this directory **for consistency with
the rest of this corpus's handling**, not because of any remaining
licensing question for those 32 specifically. `concurrent-manager` (added
after those 32) takes this one step further: there is no licensing
question at all, not even a resolved one, since it's this project's own
user's app — its raw export is withheld purely for consistency with every
other entry here, the cleanest case in the whole directory. Either way,
committing only this project's own generated output — structural metadata
(page/region/item ids, labels, region types) transformed by an
independent tool, not a copy of any app's export — avoids the question
entirely. See `.ai/knowledge/verification.md` and
`docs/grammar-assumptions.md`'s "Fixture policy" for the full reasoning.

## Apps

### Original 13 — Oracle sample-app gallery (licensing not fully resolved; kept local-only for that reason)

| App | Pages | Regions | Live-verified |
|---|---|---|---|
| `apextogo` | 18 | 54 | No |
| `brookstrut` | 48 | 134 | No |
| `image-support-rte` | 7 | 12 | No |
| `interactive-grids` (Sample Interactive Grids) | 49 | 155 | **Yes** |
| `sample-application-search` | 31 | 114 | No |
| `sample-calendar` | 37 | 126 | No |
| `sample-cards` | 25 | 82 | No |
| `sample-charts` | 49 | 293 | **Yes** |
| `sample-collections` | 14 | 56 | No |
| `sample-dynamic-actions` | 27 | 102 | No |
| `sample-master-detail` | 34 | 114 | No |
| `sample-vector-search` | 27 | 125 | No |
| `workflow-approvals` | 34 | 155 | No |

### `ujnak/APEXlang-exports` — 11 apps (MIT)

| App | Pages | Regions | Live-verified |
|---|---|---|---|
| `CSP-REPORT` | 3 | 3 | No |
| `XLIFF-TRANSLATE` | 6 | 10 | No |
| `draw-polygon-on-map` | 3 | 4 | No |
| `driving-with-apex` | 3 | 4 | No |
| `employee-management` | 3 | 5 | No |
| `get-table-info-by-apex-db-dictionary` | 3 | 2 | No |
| `menu-popup-with-action` | 6 | 12 | No |
| `salary-management-agent` | 3 | 5 | No |
| `sample-terminal-emulator` | 3 | 3 | No |
| `test-button-show-as-disabled-261` | 3 | 2 | No |
| `world-diner` | 3 | 3 | No |

### `oracle/apex` 26.1 branch — 18 apps (UPL-1.0)

| App | Pages | Regions | Live-verified |
|---|---|---|---|
| `apex-pwa-reference` | 16 | 260 | No |
| `json-duality-views` | 12 | 39 | No |
| `sample-data-loading` | 18 | 93 | No |
| `sample-document-generator` (inner export dir `sample-docgen`) | 4 | 15 | No |
| `sample-email-authentication` (inner export dir `ema`) | 16 | 42 | No |
| `sample-file-upload-download` | 13 | 56 | No |
| `sample-maps` | 17 | 61 | No |
| `sample-reporting` | 42 | 210 | No |
| `sample-rest-services` | 37 | 125 | No |
| `sample-trees` | 11 | 35 | No |
| `universal-theme-reference` (inner export dir `ut`) | 122 | 987 | No |
| `customers` | 127 | 375 | No |
| `opportunities` | 153 | 427 | No |
| `poll` | 83 | 300 | No |
| `qask` | 42 | 135 | No |
| `strategic-planner` | 262 | 912 | No |
| `team-calendar` | 51 | 176 | No |
| `cloud-apps-rest-explorer` | 5 | 22 | No |

### Independent apps beyond `ujnak`/`oracle-apex` — 3 apps

| App | Pages | Regions | Live-verified |
|---|---|---|---|
| `cymbal-coffee-ops` (`cofin/oracledb-vertexai-demo`, Apache-2.0) | 9 | 18 | No |
| `ai-procurement-agents` (`denioflavio/ai-procurement-agents`, MIT) | 11 | 15 | No |
| `plsql-dynamic-content-home` (`denioflavio/apex-plsql-dynamic-content-home`, MIT) | 5 | 4 | No |

### `concurrent-manager` — 1 app (no licensing question — the user's own app)

| App | Pages | Regions | Live-verified |
|---|---|---|---|
| `concurrent-manager` (this project's own user's app) | 56 | 159 | No |

Unlike every other entry in this file, this app has **zero licensing
question of any kind** — it's authored by this project's own user, not a
third-party sample or independently-authored repo. No new region/item/
unmodeled-component types surfaced (see `RESULTS.md` for the full
diversity check, including the app's own custom item plugin, which was
checked but turned out to be unused on any page). ADR-003 (`htmlDomId`)
holds, confirmed on 4 already-known region types, nothing contradicted.

Every app parses with **zero warnings** and regenerates **byte-identical**
output every time — see each app's `RESULTS.md` for the full breakdown.

## A real bug this exercise surfaced

Running live coverage against `interactive-grids` and `sample-charts`
(the two apps with real running instances) found that `apx-coverage`
under-reports coverage for any region where the runtime region id differs
from the `.apx` export identifier (`ApexRegion.htmlDomId` / ADR-003 —
Chart and Interactive Grid regions specifically). The touch log correctly
records the runtime id; the coverage cross-reference doesn't yet resolve
through `htmlDomId` to match it back to the export identifier. Both
apps' `RESULTS.md` report this honestly (0% shown, with the reason why)
rather than omitting the coverage section or fabricating a clean result.
The coverage matcher now resolves both candidates and records successful
runtime touches with page scope. The committed reports remain historical
captures of the original live runs; they are not rewritten without a new
run against those instances.

## Regenerating this yourself

```bash
node packages/generator/dist/cli.js <your-export-dir> --out examples/verified-apps/<app-name>/generated
node packages/generator/dist/diff-cli.js <your-export-dir> <your-export-dir>   # self-diff, proves determinism
```
