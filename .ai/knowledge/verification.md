# Verification

The discipline behind ADR-004, and the concrete mechanics of it.

## Three evidence sources, none authoritative alone

1. **Live browser verification** — a real, running Oracle APEX 26.1
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

## `github.com/oracle/apex` (26.1 branch) — 18 apps, UPL-1.0

18 more real apps, sparse-checked out from Oracle's own
`github.com/oracle/apex` repository, `26.1` branch: 11 from `sample-apps/`
(`apex-pwa-reference`, `json-duality-views`, `sample-data-loading`,
`sample-document-generator` (inner app dir `sample-docgen`),
`sample-email-authentication` (inner app dir `ema`),
`sample-file-upload-download`, `sample-maps`, `sample-reporting`,
`sample-rest-services`, `sample-trees`, `universal-theme-reference`
(inner app dir `ut`)), 6 from `starter-apps/` (`customers`,
`opportunities`, `poll`, `qask`, `strategic-planner`, `team-calendar`),
and 1 from `utility-apps/` (`cloud-apps-rest-explorer`). Confirmed
genuine APEXlang 26.1 format (`mmdVersion 26.1.0+3102`, every one of the
18 `.apex/apexlang.json` manifests checked individually) before adding.
**Licensed UPL-1.0** (Universal Permissive License) — confirmed directly
from the repository's own root `LICENSE.txt` (not inferred, not taken on
a summary: `curl`/checkout and read directly). Kept local-only, same as
the rest of the corpus, for consistency with the project's established
handling — see the explicit note below on what this resolves for the
existing 13-app pool.

These are large, rich apps — `strategic-planner` alone is 262 pages, 912
regions, 380 dynamic actions (see `docs/component-coverage-matrix.md`) —
and surfaced genuinely new signal, unlike the small (2-6 page) apps in
the previous `ujnak` batch:

- **Zero-warnings parse: 18/18 clean, including `strategic-planner`.**
  It initially surfaced 8 real parser warnings — NOT a clean corpus
  addition on first pass, and not silently smoothed over. Eight
  `link.target.items` blocks (across `pages/p00003-project-details.apx`
  and `pages/p00094-initiative.apx`) use a quoted string as a property
  KEY, where the quoted string itself contains embedded `#substitution#`
  tokens (e.g. `"P#EDIT_PAGE#_ID": #DOCUMENT_ID#`) — a real, reproducible
  construct the parser's `PROPERTY` regex (which required a bare
  identifier-style key) did not recognize. Filed to `/parser` and fixed:
  the regex now accepts a quoted-string key alternative, unquoted via the
  existing `unquoteIdentifier()` helper. See `docs/grammar-assumptions.md`
  for the full evidence, EBNF cross-check (the EBNF types `link.target` as
  an opaque `<value>`, silent on this internal object-literal shape
  entirely — real data was the only source here, consistent with
  ADR-004), and the regression tests added in `packages/parser/test/`.
- **Genuinely new region types found** (none of these existed in the
  24-app corpus's type list): `reflowReport`, `columnToggleReport`,
  `helpText` (all `universal-theme-reference`, a dedicated Universal
  Theme showcase app — expected to surface UI patterns nothing else
  would), and a brand new type-name PREFIX, `appTemplateComponent/*`
  (`strategic-planner`, distinct from the already-known
  `themeTemplateComponent/*` prefix). Also a large expansion of known
  `plugin/*` and `themeTemplateComponent/*` subtypes (see
  `docs/component-coverage-matrix.md` for the full list) — these fall
  under already-known catch-all buckets, not new categories.
- **Genuinely new item types found**: `combobox`, `colorPicker`,
  `percentGraph`, `textFieldWithAutocomplete`, `displayMap`,
  `listManager`, `qrCode`, `selectMany`, `starRating`,
  `stopAndStartGridLayout` (the last one a layout pseudo-item, not a
  data-bearing field — confirmed via `pageItem P7_SS ( type:
  stopAndStartGridLayout )` in `customers`). The official EBNF types
  `pageItem.type` as an open string with no enumerated list, so new
  item-type strings surfacing here is expected, real-data-driven
  behavior, not a grammar violation.
- **`tree` region type CORRECTED, not just extended**: the 24-app
  corpus's one `tree` instance was previously documented as "the standard
  `t_TreeNav` navigation widget reused as a login picker, not a distinct
  content pattern." This batch found THREE genuine CONTENT tree regions —
  `sample-trees` (Oracle's own dedicated Tree sample app, region
  `task-tree`), `universal-theme-reference` (region `demo-2` on its
  dedicated Tree showcase page), and `cloud-apps-rest-explorer` (region
  `business-objects-tree`, a real REST-endpoint browser). Tree IS a real,
  distinct content pattern — corrected in place in
  `docs/component-coverage-matrix.md`, not silently dropped. The
  `TreeRegion` runtime stub still has zero LIVE ground truth (all three
  new instances are static-only).
- **`htmlDomId` (ADR-003) confirmed on 22 more region types** never
  checked for it before, across this batch alone — see
  `docs/component-coverage-matrix.md` for the full list and
  `docs/quirks/26.1.json`'s `region-id-not-static-id` entry (updated in
  place). All static-only confirmation (no live instance available for
  any of these 18 apps) — nothing here contradicts ADR-003's "universal
  mechanism" finding; it substantially strengthens it.
- Determinism confirmed (generate twice, byte-identical; `apx-diff`
  self-diff, zero reported changes) on the four largest/most complex apps
  as specifically required: `strategic-planner` (261 generated files),
  `opportunities` (152), `customers` (126), plus the independent
  `cymbal-coffee-ops` (8) — see the independent-apps section below.

**Separate, deliberate note — does NOT change anything yet**: this
repository being confirmed UPL-1.0-licensed, directly from Oracle, opens
a real question about `docs/license-check.md`'s existing open item for
the **13 local-only Oracle sample gallery apps** (UX Pattern Catalog,
`apextogo`, `brookstrut`, etc.) — those may well be the SAME apps (or
close variants) as ones now confirmed redistributable under UPL-1.0 via
this GitHub source, which would mean they could potentially be committed
to the repo rather than kept local-only. This is flagged here as a
**follow-up decision to make deliberately**, not something resolved
unilaterally in this pass — the 13 apps remain local-only, unchanged,
until that's explicitly decided.

**Resolution (Product Architect, 2026-07-27) — defer bulk action, one narrow exception flagged.**

A quick name-level check of `oracle/apex`'s `26.1` branch
(`sample-apps/` directory listing via the GitHub API) found that **12 of
the 13 local-only apps have an exact or trivially-renamed counterpart
already present**: `ux-pattern-catalog`, `apextogo`,
`brookstrut-sample-app` (↔ `brookstrut`), `image-support-rte`,
`sample-interactive-grids` (↔ `interactive-grids`),
`sample-application-search`, `sample-calendar`, `sample-cards`,
`sample-charts`, `sample-collections`, `sample-dynamic-actions`,
`sample-master-detail`, `sample-vector-search` all appear by name.
`sample-approvals`'s README ("manage changes to employees' salaries and
jobs after getting the approval of an appropriate individual") matches
`workflow-approvals`'s description closely enough to be the same app
under a renamed directory — 13/13 plausible matches, not a handful. So
the *name-level* cross-check this note called for turned out to be
nearly free, not the open-ended fuzzy-matching exercise it could have
been.

That resolves the *mechanical* part of the open question cheaply. It
does not change the recommendation, for reasons that have nothing to do
with matching difficulty:

1. **The "local-only" status of this corpus was never solely a licensing
   gate.** 32 of the 45 real apps in this corpus (the 11 `ujnak` apps —
   MIT — and the 18 `oracle/apex` apps documented just above this note —
   UPL-1.0 — and the 3 independent Apache-2.0/MIT apps) already have
   *fully clean, confirmed* licenses today and are still kept
   local-only, explicitly "for consistency with the project's
   established handling," not because of any remaining legal question.
   Committing the 13 the moment their license clears would break that
   already-deliberate consistency practice for no reason tied to those
   13 specifically — the same argument for keeping the 18 UPL-1.0 apps
   local applies equally to these 13 once their license clears.
2. **No second real-app determinism trigger exists for 12 of the 13.**
   This project's own discipline (ADR-004, the Chart/Calendar precedent,
   the rejected "Analysis Engineer" role) is: build/commit infrastructure
   when a concrete need is blocked on it, not when it merely becomes
   *possible*. Confirming a license is necessary but not sufficient — it
   answers "are we allowed to," not "do we need to right now."
3. **One narrow, real exception**: `docs/limitations.md`'s Generator
   section already names `UX Pattern Catalog` specifically as the reason
   a real capability can't be exercised — "Determinism is proven against
   a hand-written synthetic fixture... not the actual multi-page UX
   Pattern Catalog export — that export isn't committed (redistribution
   rights unchecked)." That is a pre-existing, documented gap this
   session's finding may resolve (the GitHub `ux-pattern-catalog` app,
   622KB zipped, is very likely the same app by name and role as this
   project's own primary ground-truth app). This is the one candidate
   worth pursuing on its own, later, not as part of a 13-app batch.
4. **Repo-size consideration is real, not hypothetical.** A single
   sample app's zip export is ~600KB; several of these 13 (`brookstrut`,
   `interactive-grids`) are known to be substantial multi-page apps in
   the same family as `strategic-planner` (262 pages) from the 18-app
   batch. Committing 13 raw `.apx`/zip exports is a meaningfully
   different repo-size decision than committing hand-written fixtures,
   and shouldn't be taken as a side effect of a licensing question
   getting answered.

**Verdict: defer bulk action on all 13. Do not commit any of them now.**
The 13 stay local-only, unchanged, individually-unresolved on licensing
per `docs/license-check.md` (name-matching a UPL-1.0 GitHub app is
supporting evidence, not the same as re-doing the content-level
per-app check `docs/license-check.md`'s discipline requires before
calling a specific app's license resolved). The one specific,
already-justified follow-up worth doing later, on its own, not as a
13-app batch: if/when someone actually needs the determinism-vs-real-
multi-page-export proof `docs/limitations.md` flags as missing, verify
`oracle/apex`'s `ux-pattern-catalog` is content-level the same app (not
just same name) as this project's local `UX Pattern Catalog`, and only
then decide whether to commit that one export (or a derived fixture) to
close that specific gap. That real need is the trigger — not this
session's license confirmation on its own.

## Independent apps beyond `oracle/apex` and `ujnak` — 3 apps

Three more independent, real apps confirmed in genuine 26.1 APEXlang
format, each individually license-checked directly from its own
`LICENSE` file before adding:

- `cofin/oracledb-vertexai-demo` (app `cymbal-coffee-ops`, at
  `src/apex/cymbal-coffee-ops/`) — **Apache-2.0**, confirmed from the
  repo's own `LICENSE` file header.
- `denioflavio/ai-procurement-agents` (app `ai-procurement-agents`, at
  `application/ai-procurement-agents/`) — **MIT**, confirmed from the
  repo's own `LICENSE` file.
- `denioflavio/apex-plsql-dynamic-content-home` (app
  `plsql-dynamic-content-home`, at
  `application/plsql-dynamic-content-home/`) — **MIT**, confirmed from
  the repo's own `LICENSE` file.

All three confirmed genuine `mmdVersion 26.1.0+3102` before adding.
Parsed with **zero warnings**, all three. No new region/item types beyond
what the 18-app `oracle/apex` batch above already surfaced (these are
small apps — 9, 11, and 5 pages respectively). Determinism confirmed
(generate twice, byte-identical) on `cymbal-coffee-ops` specifically, per
the task's requirement to cover it as one of the four largest/most
complex apps checked. Kept local-only in the scratchpad, same handling as
every other real export in this corpus, despite the permissive licenses —
consistency, not a licensing concern this time (same reasoning already
applied to the `ujnak` batch).

## `concurrent-manager` — 1 app (the user's own app; no licensing question at all)

A 46th app, added after the 45-app corpus above: **Concurrent Manager**,
authored by this project's own user. Confirmed genuine
`mmdVersion 26.1.0+3102` (`.apex/apexlang.json`), 56 pages. This is the
**best-possible-provenance addition in this corpus** — every other app
here (the 13 Oracle gallery apps, the 11 `ujnak` apps, the 18
`oracle/apex` apps, the 3 further independent apps) carries some form of
licensing bookkeeping, resolved or not. This one carries none: it's the
user's own application, so there is no redistribution-rights question to
track in `docs/license-check.md` at all, not even a cleared one. It's
still kept local-only / raw-export-excluded from `examples/verified-apps/`,
same as every other app — purely for consistency with this corpus's
established handling, not because of any licensing concern (the same
distinction already drawn for the `ujnak`/`oracle-apex`/independent
batches, taken one step further here since there's no underlying question
to be consistent *about*).

- **Zero-warnings parse**: confirmed clean, matching the rest of the
  corpus. Total regions: 159 across 56 pages (items: 217, buttons: 67,
  dynamic actions: 46).
- **No genuinely new region, item, or unmodeled-component type.** All 10
  region types (`breadcrumb`, `staticContent`, `interactiveGrid`,
  `interactiveReport`, `classicReport`, `form`, `chart`, `cards`,
  `regionDisplaySelector`, `dynamicContent`), all 15 item types, and all 8
  unmodeled component types (`axis`, `branch`, `column`, `pageGroup`,
  `process`, `savedReport`, `series`, `validation`) were already known
  from the 45-app corpus before this addition. Despite the app having its
  own custom item plugin (`shared-components/plugins/item/advancedSlider`,
  static id `HR.BILOG.MGORICKI.ADVANCED_SLIDER`) and 56 pages — a
  reasonable expectation of new signal going in — this specific plugin
  turned out to be **defined but never placed on any page** (a full grep
  of every `pages/*.apx` file for its static id/name found zero
  references), so it contributes no `plugin/*` item-type instance to this
  app's parse output. This is recorded as a checked-and-negative finding,
  not a skipped one — see `examples/verified-apps/concurrent-manager/RESULTS.md`.
- **ADR-003 (`htmlDomId`) cross-checked specifically against this app, per
  the new-app checklist**: present on 17/159 regions, across 4 region
  types (`staticContent`, `interactiveReport`, `interactiveGrid`,
  `dynamicContent`) — all 4 already confirmed to carry `htmlDomId`
  elsewhere in the corpus. Nothing here contradicts ADR-003's "universal
  mechanism" finding; it's a small additional corroboration on a 46th,
  independently-sourced app, not a new divergence.
- **Live verification**: no running instance available — confirmed
  directly rather than assumed (the export's own `deployments/default.json`
  records only an app id, `20500`, no reachable instance URL). Static
  ground truth only.
- **Determinism confirmed**: generated twice from the same export,
  byte-identical output both times; `apx-diff` self-diff against itself:
  0 added, 0 removed, 0 changed, 55 unchanged (55 page-object/spec pairs
  from 56 pages — the global page, id 0, is excluded from generation by
  design, same as every other app in this corpus).
- **`branch`/`validation`/`lov` scope decision**: this app's heavy,
  concrete use of `branch` (6 pages), `validation` (34 pages), and LOVs
  (11+ pages) prompted a Product Architect scope review — see
  `docs/ecosystem-roadmap.md`, "Seventh round (2026-07-27)". Verdict:
  `branch` and a narrow `lov` reference field are parser-only, build-now
  (`/parser`); `validation`'s typed AST field is build-now too, but its
  runtime component is deferred pending an `/apex` live-verification pass
  against Sample Interactive Grids (already live-accessible) to check
  whether `messages.ts`'s existing `expectError()` already covers
  validation failures. Full LOV *definition* resolution
  (`shared-components/lovs.apx`) stays out of scope — outside
  `loadExport()`'s current file coverage, a bigger architecture change
  than a field addition.

## Corpus size after this addition

46 real apps total: the original 13 Oracle gallery apps + 11 `ujnak`
apps + 18 `oracle/apex` (26.1 branch) apps + 3 independent apps + 1 more
(`concurrent-manager`, the user's own app, no licensing question). All 46
parse with zero warnings (`strategic-planner`'s 8 warnings were a real
parser gap, found and fixed in an earlier pass — see above and
`docs/grammar-assumptions.md`). All 45 pre-existing apps were re-verified
to regenerate byte-identical output in this pass (no drift), alongside the
new app's own determinism check.

## `validation` runtime question — attempted, blocked on login, real partial signal (2026-07-27/28)

The `/apex` pass called for by `docs/ecosystem-roadmap.md`'s Seventh
round ("does a real server-side validation failure already surface
through `messages.ts`'s `expectError()`, zero new code needed") could
not be fully closed. **Stated plainly, per this doc's own discipline
for when live access isn't available**: Sample Interactive Grids and
Sample Charts — the two live apps with actual ground truth for this
question — require login, and this pass had zero credential values
available anywhere in the environment (by design: `APX_LOGIN_TEST_USERNAME`/
`APX_LOGIN_TEST_PASSWORD` are read from env vars at test time only,
never committed, unset here). Independently of that, an AI agent
driving the browser interactively does not enter passwords into login
forms under any circumstance, including a task instruction saying to.
Both are real, not cosmetic, blockers — this is "live access needed,"
the valid answer this project's own ADR-004 discipline explicitly
allows for, not a shortcut taken.

What this pass *did* establish, combining real export data (source 2)
and one live app reachable without login (source 1, UX Pattern
Catalog's public pages):

- Confirmed via the real `sample-interactive-grids` export (not
  paraphrase): page 31 ("Validation") has two genuine page-level
  `validation()` components scoped to the IG's `editableRegion`
  (`comm-limit`, `hire-date-in-past`) plus column-level
  `valueRequired: true` on `ENAME`/`HIREDATE`. The page's own bundled
  help text describes required-column errors as "reported" via a red
  triangle in the column header — in-grid UI language, not page-banner
  language.
- Confirmed live on UX Pattern Catalog's "Data Entry – Simple Form"
  page (the one live app reachable without login): a required-looking
  field that performs a genuine `wwv_flow.accept` POST (3× reproduced)
  but never toggles `#APEX_ERROR_MESSAGE` — this page's required marker
  turned out to be decorative, not a real validation, a real but
  negative/inconclusive finding for the actual question. See
  `docs/quirks/26.1.json`'s `ux-pattern-catalog-required-marker-not-enforced`.
- Working hypothesis, **explicitly not live-confirmed**: Interactive
  Grid validation failures likely route through the grid widget's own
  AJAX-row-save error/validity UI, not the classic `#APEX_ERROR_MESSAGE`
  page banner `messages.ts` wraps — a structurally different code path
  than a classic Form region's full-submit-and-redisplay flow. Even the
  classic-Form case was never actually observed via a genuine
  validation-triggered failure either — `messages.ts`'s own prior live
  verification called `apex.message.showPageSuccess()` directly, not via
  a real failed submission.

**Next step for whoever picks this up with real login access**: open
Sample Interactive Grids page 31 (`VALIDATION`), clear the `ENAME` cell
in the `emp` grid, attempt save, and inspect
`document.getElementById('APEX_ERROR_MESSAGE')` alongside the grid's own
DOM (cell/row error classes) and `read_network_requests`/console to see
which one actually carries the message. Full detail:
`docs/ecosystem-roadmap.md`'s Seventh round follow-up section.

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

## `docs/verification/26.1.json` — the machine-readable verification registry

A structured INDEX over the evidence in `docs/quirks/26.1.json`,
`docs/grammar-assumptions.md`, and the "confirmed live"/EBNF-cross-checked
doc comments in `packages/testkit/src/**`/`packages/parser/src/ast.ts` —
not a new evidence source, and not a replacement for either ledger. Built
so prose docs can eventually be *generated from* evidence instead of
hand-copied into N places (the same fact has drifted between files at
least three times now — the Chart `widget()` claim, twice more found stale
in `docs/grammar-assumptions.md` and `docs/support-matrix.md` during the
registry's own extraction pass, and the button `htmlDomId` "zero buttons"
overclaim in `docs/support-matrix.md`, all corrected in place). One real
consumer is wired: `scripts/generate-support-matrix.mjs` renders
`docs/support-matrix.md`'s table from the registry's `supportMatrixRow`
entries, with `--check` failing on drift. See `docs/verification/README.md`
for the full schema, evidence-level taxonomy (VERIFIED/DOCUMENTED/
OBSERVED/UNVERIFIED/UNSUPPORTED), and how to add/correct an entry.

`node scripts/validate-verification-registry.mjs` and
`node scripts/generate-support-matrix.mjs --check` are now part of the
regression sweep below — run both before considering any change to the
registry, `docs/quirks/26.1.json`, `docs/grammar-assumptions.md`, or
`docs/support-matrix.md` done.

### Relationship to the project constitution's evidence sections

`docs/verification/26.1.json`'s `status` field
(verified/documented/observed/unverified/unsupported) is the same
five-way evidence-level taxonomy the project constitution's §16
describes (VERIFIED/DOCUMENTED/OBSERVED/UNVERIFIED/UNSUPPORTED) — this
is a citation, not a coincidence; the registry was already built against
that exact taxonomy. §17's preferred evidence order (Oracle docs + real
runtime verification + reproducible fixture, over blog posts/memory/LLM
recall) is ADR-002/004, already enforced. §44's proposal for an
`oracle/{apis/,components/,runtime/,grammar/,versions/}` directory tree
and §45's grammar-reproducibility mechanism are **not adopted
separately** — `docs/verification/26.1.json` plus this file's own
per-EBNF-production citation discipline already cover the same ground in
a different, already-built shape (one structured JSON file with a
documented schema, rather than a directory of per-capability files). Do
not start a parallel `oracle/` directory tree; if the registry's shape
genuinely needs to change, that's a redesign of the existing file, not a
second system. §46's SQLcl-as-parser-oracle idea (mutation-testing
APEXlang fixtures against Oracle's own validator) is **not built** and
is flagged as a separate proposal needing its own review — see
`.ai/knowledge/constitution-reconciliation.md` §D — not something this
file's existing three evidence sources (live browser, real export, EBNF)
should be silently expanded to include.

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
- `node scripts/validate-verification-registry.mjs` — the verification
  registry is internally valid (required fields, unique ids, every
  citation resolves to a real file/quirk).
- `node scripts/generate-support-matrix.mjs --check` — `docs/support-matrix.md`
  has not drifted from what the registry would generate.
