# Verification registry

## Why this exists

This project's verification facts have historically lived scattered across
`README.md`'s capability matrix, `docs/limitations.md`,
`docs/support-matrix.md`, `docs/component-coverage-matrix.md`,
`docs/ecosystem-roadmap.md`'s many dated rounds, `docs/grammar-assumptions.md`,
`docs/quirks/26.1.json`, and `.ai/knowledge/*.md`. The same underlying fact
(e.g. "does `apex.region(id).widget()` return `null` for Chart regions?")
has drifted between those files more than once in this project's history —
found and corrected in place twice already (see `docs/quirks/26.1.json`
`chart-region-widget-returns-null`, and the wide-reaching `parseArray()`
bug ADR-004 cites). The verification-registry extraction pass that produced
this file found the SAME Chart claim still stale in `docs/grammar-assumptions.md`
and `docs/support-matrix.md` (both fixed in place as part of this pass) —
direct proof scattering the same fact across N hand-maintained files is a
real, live, recurring failure mode in this project, not a hypothetical one.

`docs/verification/26.1.json` is a single, structured, machine-readable
index of verification facts already established elsewhere in this repo. It
does not replace `docs/quirks/26.1.json` or `docs/grammar-assumptions.md` —
those remain the primary evidence ledgers this project's evidence discipline
(ADR-004) requires, and every registry entry's `citation` field points back
at one of them (or at the source file's own doc comment) as the actual
evidence. The registry is an *index over* that evidence, structured so a
script can query it, cross-check it, and — as of this pass — generate at
least one prose doc from it, instead of a human hand-copying the same fact
into N places and one of them silently going stale.

**This file is not a new evidence source.** Nothing may be marked
`"status": "verified"` here that isn't already backed by real evidence at
the cited location, per this project's own ADR-004 discipline. Adding a
registry entry is an act of indexing/structuring existing evidence, never
an act of asserting new verification.

## Schema

Each entry in `docs/verification/26.1.json`'s `entries` array:

| Field | Type | Meaning |
|---|---|---|
| `id` | string | Unique slug. |
| `component` | string | The component/field/capability being described. |
| `capability` | string | The specific capability/method/property this entry is about. |
| `status` | `"verified" \| "documented" \| "observed" \| "unverified" \| "unsupported"` | Evidence-level taxonomy (see below) — NOT whether the capability works. |
| `outcome` | `"works" \| "broken" \| "partial" \| "not-applicable" \| "n/a"` | Whether the verified/observed capability actually functions correctly. A capability can be `"verified"` + `"broken"` at the same time (e.g. Cards' `getRecords()` — confirmed, twice, to throw). |
| `apexVersion` | string | APEX version this entry applies to (this file is scoped to `26.1`; a future `27.0.json` etc. would be a new file, never a version bump in place). |
| `applications` | string[] | The real app(s) this was checked against. `[]` when not applicable (e.g. a pure EBNF-only claim). |
| `runs` | number \| null | Number of independent times this was reproduced, when known. `null` when not tracked/not applicable. |
| `confidence` | `"high" \| "medium" \| "low" \| "n/a"` | This project's own confidence tier, mirroring the tiers already used in `packages/generator/src/flow.ts`'s `FLOW_MECHANISM_EVIDENCE`. |
| `publicApi` | boolean \| null | Whether this is a documented/public Oracle API vs. an internal one reached via the widget-factory pattern. `null` when not meaningful (e.g. a parser field). |
| `runtimeStrategy` | `"widget-factory" \| "direct-method" \| "ui-locator" \| "dom-locator" \| "parser-only" \| "n/a"` | How the capability is actually dispatched/reached at runtime. |
| `evidenceSource` | `"live-browser" \| "real-export" \| "ebnf" \| "live-browser+real-export" \| "real-export+ebnf" \| "live-browser+ebnf" \| "live-browser+real-export+ebnf" \| "none"` | Which of ADR-004's evidence sources back this claim — a `"verified"` status requires at least one of `live-browser`, `real-export`, or `real-export+ebnf` per ADR-004 (EBNF alone is never sufficient for a parser claim; see `parser-button-target-redirectotherapp-unwitnessed` for a `"documented"`-not-`"verified"` example of exactly this). |
| `ebnfProduction` | string \| null | The **semantic** EBNF production name (e.g. `"region-advanced-property"`), never a raw line number as the primary reference — a maintainer review explicitly flagged a prior `apexlang.ebnf:2578-2589` line citation as fragile (line numbers shift on every EBNF revision; production names don't). A specific line number, when useful, belongs in `notes` as supplementary detail only. |
| `citation` | string | The primary evidence location — a repo-relative path, optionally with a `#fragment`. Three fragment shapes: `docs/quirks/26.1.json#<quirk-id>` (validated: the id must exist in `quirks.json`'s array), `path/to/file.ts#L<n>-L<n>` (validated: the range must be within the file's actual line count), or a loose markdown-heading-style anchor like `docs/grammar-assumptions.md#Still-open` (validated: the anchor text must appear, case-insensitively, somewhere in the file). |
| `lastVerified` | string (`YYYY-MM-DD`) | When this specific finding was last (re-)confirmed, per the cited source's own dated evidence. |
| `correctedFrom` | string \| null | Set **only** on entries that correct a previously-wrong claim — describes what was wrong and how it was found, following this project's "correct in place, visibly" discipline (ADR-004). Never delete an entry to fix it; add/extend `correctedFrom` instead. |
| `notes` | string | Free-text summary of the finding. Required, non-empty — an entry with no notes is a bare assertion, not evidence. |
| `supportMatrixRow` | object \| null | Present only on the ~14 entries that render as a row in `docs/support-matrix.md`'s generated table — `{ order, component, verifiedAgainst, how }`. See "The one wired consumer" below. |

### The evidence-level taxonomy (`status`)

Per the maintainer's explicit taxonomy this registry was built against:

- **`verified`** — meets ADR-004's bar: live-browser evidence against a
  real running instance (runtime claims), or real parsed export data
  cross-checked against the full relevant EBNF production (parser/grammar
  claims). The large majority of entries in this file.
- **`documented`** — backed by the official EBNF/Oracle documentation only,
  with no independent real-export or live-browser confirmation. A
  hypothesis with textual grounding, not yet a fact by this project's own
  standard. (Example: `parser-comment-syntax-ebnf-only-unwitnessed` — the
  EBNF confirms comment syntax is real, but zero real exports have ever
  contained one.)
- **`observed`** — seen once, in passing, or inferred by naming
  convention/property introspection rather than directly exercised and
  checked. Weaker than `verified` — this project has been burned exactly
  this way before (Chart's `widget()` claim, generalized from one region
  tested once) and now treats "observed once" as its own explicit tier
  rather than silently rounding up to `verified`.
- **`unverified`** — a real, open question with no evidence either way yet.
  Distinct from `unsupported` — this is a gap in what's been checked, not a
  deliberate scope decision.
- **`unsupported`** — a deliberate, explicit "not built" stub (see
  `packages/testkit/src/components/unsupported.ts`), usually because zero
  live ground truth exists for the underlying component at all. Recorded
  here so the registry captures Oracle-does-not-expose-this /
  we-have-not-verified-this-yet gaps as first-class facts, not silent
  absences.

## Provenance of this file

Built via a manual extraction pass (not automated) that walked, in order:
every entry in `docs/quirks/26.1.json` (17 entries — the runtime evidence
ledger); every "confirmed live"/"VERIFIED"/"CORRECTED" doc comment in
`packages/testkit/src/components/*.ts` and the relevant
`packages/testkit/src/fixtures/*.ts` files (auth.ts, session.ts,
navigation.ts, lifecycle.ts); every EBNF-cross-checked field's doc comment
in `packages/parser/src/ast.ts`; and `docs/grammar-assumptions.md`'s
"Verified"/"Runtime verification"/"Still open" sections. This is a
migration/structuring task, not new research — no entry in this file
asserts a verification claim that wasn't already independently established
at its cited location before this pass began.

**Corrections made in place during this extraction pass** (found by
cross-checking a sample of entries against their actual cited source,
rather than transcribing blindly, per this project's own discipline):

1. `docs/support-matrix.md` (Chart row) still claimed
   `apex.region(id).widget()` returns `null` for chart regions — already
   corrected everywhere else (`docs/quirks/26.1.json`, `chart.ts`,
   `docs/component-coverage-matrix.md`, `README.md`) but missed here.
   Fixed in place.
2. `docs/grammar-assumptions.md`'s original dated Chart entry (the
   historical log of the initial, wrong finding) had never had a
   correction note appended, unlike every other place this same claim was
   corrected. Fixed in place — the original entry is left intact as the
   historical record, with a dated correction appended directly beneath
   it, per this project's "correct in place, visibly, never silently
   delete" rule.
3. `docs/support-matrix.md` (`ApexButton.htmlDomId` row) still claimed
   "zero buttons in the entire local corpus ever set `advanced { htmlDomId
   }`" — already corrected in `docs/quirks/26.1.json`'s
   `button-id-not-static-id` entry (a real `parseApp()` sweep found 4/356
   real buttons across 4 apps that DO set it) but missed here. Fixed in
   place.

All three are the exact failure mode this registry exists to prevent going
forward — the same fact, hand-copied into N files, drifting in some of
them. See the parent task's report for the full detail on each.

## The one wired consumer: `docs/support-matrix.md`'s table

`scripts/generate-support-matrix.mjs` renders the `Component | Verified
against | How` table in `docs/support-matrix.md` (between the
`<!-- GENERATED:BEGIN -->` / `<!-- GENERATED:END -->` markers) directly
from the ~14 registry entries carrying a `supportMatrixRow` block —
everything else in that file (the intro paragraph, "What 'verified against
one app' means", "Not supported, by design") stays hand-written, outside
the markers.

```bash
# Regenerate docs/support-matrix.md's table from the registry:
node scripts/generate-support-matrix.mjs

# Verify the committed file has NOT drifted from the registry (fails
# non-zero on drift -- this is the "check" required by the task and is
# meant to run as part of the regression sweep):
node scripts/generate-support-matrix.mjs --check
```

`docs/component-coverage-matrix.md`, `README.md`'s capability matrix, and
`docs/ecosystem-roadmap.md` are **not yet converted** — this registry is
now the intended source of truth for future conversions of those files,
but converting all of them in one pass was deliberately out of scope here
(one real, working, tested generator is the actual deliverable, per the
task's own framing — not a half-converted sweep across every doc file).
Whoever picks up the next doc file should add a `supportMatrixRow`-style
block (or an analogous typed block) to the relevant registry entries and a
sibling `generate-*.mjs` script following the same
begin/end-marker-plus-`--check` pattern established here.

## Validating the registry itself

```bash
node scripts/validate-verification-registry.mjs
```

Checks: every entry has all required fields with valid enum values; every
`id` is unique; every `citation` path resolves to a real file in the repo;
every `docs/quirks/26.1.json#<id>` citation references a quirk that
actually exists (an orphaned citation — pointing at evidence that was
deleted or renamed — is exactly the kind of drift this registry exists to
catch, not just replicate); every `#L<n>-L<n>` line-range citation is
within the cited file's actual current line count; every
`supportMatrixRow.order` value is unique.

This is now part of the regression sweep (`.ai/checklists/release.md`,
`.ai/knowledge/verification.md`) — run it, along with
`node scripts/generate-support-matrix.mjs --check`, before considering any
change to `docs/verification/26.1.json`, `docs/quirks/26.1.json`,
`docs/grammar-assumptions.md`, or `docs/support-matrix.md` done.

## Adding a new entry

1. The underlying evidence must already exist (or be added in the same
   change) at one of the three ADR-004 evidence sources — a
   `docs/quirks/26.1.json` entry, a `docs/grammar-assumptions.md` entry, or
   a "confirmed live"/EBNF-cross-checked doc comment on the actual
   `packages/*/src/**` field or method.
2. Add an entry here citing that location. Do not restate the evidence in
   `notes` as if this file were the source — `notes` is a summary for
   quick scanning, `citation` is where the real evidence lives.
3. Run `node scripts/validate-verification-registry.mjs` before committing.
4. If the entry should appear in `docs/support-matrix.md`, add a
   `supportMatrixRow` block and run
   `node scripts/generate-support-matrix.mjs` to regenerate the doc.

## Correcting a wrong entry

Never delete or silently rewrite an entry that turns out to be wrong. Set
`correctedFrom` to describe what the entry used to (wrongly) claim and how
the correction was found, update `status`/`outcome`/`notes` to the current,
correct finding, and bump `lastVerified`. This mirrors
`docs/quirks/26.1.json`'s own established correction pattern (see
`chart-region-widget-returns-null` there for the canonical example) —
applied here at the registry-index level too.
