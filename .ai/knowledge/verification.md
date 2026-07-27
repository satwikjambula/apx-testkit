# Verification

The discipline behind ADR-004, and the concrete mechanics of it.

## Three evidence sources, none authoritative alone

1. **Live browser verification** — a real, running Oracle APEX 26.1+
   instance, driven directly (`apex.region()`, `apex.jQuery`,
   `page.evaluate`), never assumed from documentation.
2. **Real export parsing** — actual `.apx` export data from real Oracle
   sample apps, parsed and inspected directly (`node -e` scripts against
   `@apx/parser`'s built output, or the parser's own test fixtures).
3. **The official APEXlang EBNF grammar** —
   `docs.oracle.com/en/database/oracle/apex/26.1/apxln/apexlang.ebnf`,
   fetched via `curl` to a raw file, **never** through an AI-summarizing
   fetch tool (a summarized fetch once hallucinated a `@{component-id}`
   syntax that doesn't exist in the real grammar — see ADR-004).
4. **`Sawalhah/apexlang-view`'s independent parser** (`src/parser.js`) —
   a separately-authored parser for the same format, validated by its
   author against ~1,263 real exports (roughly 90x this project's local
   corpus). Reference only via GitHub — **never** a dependency, **never**
   imported. A divergence from this project's own parser is real signal
   worth investigating, given the corpus-size gap. See
   `.ai/checklists/parser-change.md` for the check step.

When sources disagree, or one is silent where another has a clear answer,
**real data (1 or 2) wins over the grammar (3) or the reference parser
(4)** — the EBNF is authoritative but not necessarily complete (confirmed:
`calendarSettings` properties are entirely absent from the 11,700+ line
grammar despite being real and live-verified), and apexlang-view is a
useful cross-check, not ground truth on its own. The discrepancy gets
documented, not silently resolved by picking a side.

## Real Oracle apps this project has access to

The primary ground-truth app is **UX Pattern Catalog**. Beyond that, 13
more real Oracle sample gallery apps have been parsed (kept **local only,
never committed** — see below for why): `apextogo`, `brookstrut`,
`image-support-rte`, `interactive-grids` (aka "Sample Interactive
Grids"), `sample-application-search`, `sample-calendar`, `sample-cards`,
`sample-charts`, `sample-collections`, `sample-dynamic-actions`,
`sample-master-detail`, `sample-vector-search`, `workflow-approvals`.
Live (running, not just exported) access has so far only been available
for Sample Interactive Grids and Sample Charts — the rest are
static-ground-truth only until a running instance becomes available.

**These exports/zips must never be committed to the repository** — treat
them the same as credentials: useful locally, kept out of git.

## Non-Oracle real apps: `ujnak/APEXlang-exports`

11 more real, independently-authored small apps beyond the Oracle
gallery pool, cloned locally from
[`github.com/ujnak/APEXlang-exports`](https://github.com/ujnak/APEXlang-exports)
(**MIT licensed**, confirmed via the repo's own LICENSE file — cleaner
redistribution status than Oracle's own samples, which still have an
open question per `docs/license-check.md`; still kept local-only, same
as the rest of the corpus, not because of licensing uncertainty this
time but for consistency): `CSP-REPORT`, `XLIFF-TRANSLATE`,
`draw-polygon-on-map`, `driving-with-apex`, `employee-management`,
`get-table-info-by-apex-db-dictionary`, `menu-popup-with-action`,
`salary-management-agent`, `sample-terminal-emulator`,
`test-button-show-as-disabled-261`, `world-diner`. Confirmed genuine
APEXlang 26.1 format (`mmdVersion 26.1.0+3102`, matching the rest of the
corpus) before adding. Static-ground-truth only, no live access found.
Small apps (2-6 pages each) but a genuinely independent, non-Oracle-
gallery data point — parsed with zero warnings, no new region/component
types, determinism confirmed on all 11. Notable finding: `htmlDomId`
confirmed on two region types not previously checked for it (`map`,
`classicReport`), extending ADR-003's "universal mechanism" finding
further. Also confirmed the parser handles non-ASCII/Unicode region
identifiers correctly (a real Japanese region name in
`menu-popup-with-action`).

Two more apps from the same research pass were found in genuine 26.1
APEXlang format but are **not** in the local corpus — both have **no
license at all** (`maniltns/ojas-apex-varient`, `ShayneJaya/customer-
portal`), which needs the author's explicit permission before any use,
even local-only, per the same discipline as Oracle's own redistribution
question.

## `docs/quirks/26.1.json` — the runtime evidence ledger

One entry per finding: `id`, `component`, `issue`, `evidence`
(reproducible, literal — actual calls and actual return values, not
paraphrased), `reproducedAgainst` (the real app/page/region),
`workaround`, `status`, `rootCauseDiagnosed`. Corrections happen in
place — see `chart-region-widget-returns-null` for the pattern: the
`issue`/`evidence`/`workaround` fields get rewritten to state the correct
finding, prefixed with what the entry used to (wrongly) claim, not
deleted and replaced.

## `docs/grammar-assumptions.md` — the parser evidence ledger

Same idea, for parser/grammar claims: what was checked, against which
EBNF production(s), against which real export data, what was found. Has
a "Still open" section for questions without an answer yet.

## `spike/` — hand-written live verification specs

Real Playwright specs run by hand against real running apps (not part of
generated output). Every spec requiring credentials is gated on
`APX_LOGIN_TEST_USERNAME`/`APX_LOGIN_TEST_PASSWORD`, skips cleanly if
either is unset, and **never hardcodes a credential**.

## Regression sweep (run before anything is "done")

- `npm run build --workspaces` — all four packages, zero errors.
- `npm test --if-present` — full vitest suite.
- `cd spike && npx tsc --noEmit` — spike typechecks against the built
  `@apx/testkit` types.
- Regenerate `packages/generator/test/fixtures/reference-fixtures` and
  diff against committed `examples/employee-page` — must be
  byte-identical.
- Parse every real local export through `@apx/parser` — must be zero
  warnings across all of them.
