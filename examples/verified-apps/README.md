# Verified apps — real Oracle sample-app results

Generated `@apx/testgen` output (page objects + smoke specs) and results
summaries for 13 real Oracle APEX 26.1+ sample applications this project
has used to verify `@apx/parser` and `@apx/testkit` against a genuinely
wide variety of real, structurally different apps.

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

**The raw `.apx` export data is deliberately NOT included.** Redistribution
terms for Oracle's actual sample *applications* — their real page content,
demo data, and business logic — have not been resolved, unlike the
APEXlang *format* itself (`docs/license-check.md` cleared writing an
independent parser for the documented grammar; Oracle explicitly invites
that). Committing only this project's own generated output — structural
metadata (page/region/item ids, labels, region types) transformed by an
independent tool, not a copy of Oracle's export — avoids that open
question entirely. See `.ai/knowledge/verification.md` and
`docs/grammar-assumptions.md`'s "Fixture policy" for the full reasoning.

## Apps

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

Every app parses with **zero warnings** and regenerates **byte-identical**
output every time — see each app's `RESULTS.md` for the full breakdown.

## A real bug this exercise surfaced

Running live coverage against `interactive-grids` and `sample-charts`
(the two apps with real running instances) found that `apx-coverage`
under-reports coverage for any region where the runtime static id differs
from the `.apx` export identifier (`ApexRegion.htmlDomId` / ADR-003 —
Chart and Interactive Grid regions specifically). The touch log correctly
records the runtime id; the coverage cross-reference doesn't yet resolve
through `htmlDomId` to match it back to the export identifier. Both
apps' `RESULTS.md` report this honestly (0% shown, with the reason why)
rather than omitting the coverage section or fabricating a clean result.
This is tracked as a follow-up for `runtime-test-automation-engineer`
(`/runtime`), not fixed in this pass.

## Regenerating this yourself

```bash
node packages/generator/dist/cli.js <your-export-dir> --out examples/verified-apps/<app-name>/generated
node packages/generator/dist/diff-cli.js <your-export-dir> <your-export-dir>   # self-diff, proves determinism
```
