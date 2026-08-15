# Golden generator fixtures (runtime-review P0 item 5)

Real input/expected pairs covering every generation-time decision
`@apx/testgen` currently makes, run by `../golden.test.ts`. The existing
`examples/employee-page`/`reference-fixtures` determinism check (see
`.ai/checklists/release.md`) only proves the generator is internally
**self-consistent** — same input twice gives the same output. It does not
prove that output is **correct**: a template regression that's
reproducibly wrong on every run would pass that check every single time.
This directory adds the missing correctness gate.

## What each fixture proves

| Fixture | Covers | Real-corpus basis |
|---|---|---|
| `public-page-with-region-items` | A public form page with region-owned items + buttons | A second, independent example alongside the canonical `examples/employee-page` pair, which remains the primary release-gate check |
| `authenticated-page-plain` | A non-public page with NO checksum protection (plain login-gated) | **No real example found** — see "A genuine negative finding" below |
| `modal-dialog-page` | `pageMode: modalDialog`, orthogonal to authentication | Mirrors UX Pattern Catalog's real p00420 structure (`docs/quirks/26.1.json` `drawer-modal-pages-400`) |
| `duplicate-button-labels` | Same-page label collisions get no click method | Mirrors UX Pattern Catalog's real p00120 (5 buttons labeled "View Details") |
| `interactive-report-htmldomid` | ADR-003 `htmlDomId` region resolution, wired + fallback | Mirrors Sample Charts' real `projects`/`projects_report` pair |
| `cards-region` | `type: cards` region resolve-check | Mirrors Sample Cards app patterns |
| `faceted-search-region` | `type: facetedSearch` co-occurring with `cards` | Mirrors UX Pattern Catalog's real p00210 structure |
| `chart-region` | Chart wired (`htmlDomId`) + unwired | Mirrors Sample Charts' real `pie1`-shaped pattern |
| `interactive-grid-region` | IG wired + unwired, combined with navigation-unsafe | Mirrors Sample Interactive Grids' real `basic-editing`→`emp` pair — confirmed the common real case (every real IG-bearing page found this pass also sets checksum protection) |
| `dynamic-actions-page` | Dynamic actions don't affect generated output | Mirrors the exact structure already confirmed parseable in `packages/parser/test/parser.test.ts` (itself reproduced from Oracle's real "Sample Dynamic Actions" app) |
| `branches-page` | Branches don't affect generated output | Mirrors the exact structure already confirmed parseable in `packages/parser/test/parser.test.ts` (itself reproduced from Oracle's real `customers` starter app, `oracle/apex` 26.1 branch, UPL-1.0) |

## Why every `.apx` file here is hand-written, not copied from a real export

`examples/verified-apps/README.md` already establishes this project's
practice: **raw `.apx` export content from the Oracle sample-gallery
corpus is never committed**, only this project's own *derived* generated
output (structural metadata transformed by an independent tool). That's
because redistribution terms for Oracle's actual sample applications —
their real page content, demo data, business logic — are unresolved
(`docs/license-check.md`), unlike the APEXlang *format* itself, which
Oracle explicitly documents and invites independent tooling against.

Every `.apx` file under `fixtures/` here is **written by hand**, modeling
the exact real structural patterns this project has already documented
(field names, real observed values like `projects_report`/`emp`/htmlDomId
strings already recorded in `docs/quirks/26.1.json`, real button-action
enum values confirmed via `docs/quirks/26.1.json` cross-references) — not
copy-pasted from any export file. This is the same approach already used
for `packages/generator/test/fixtures/region-resolution-fixture`,
`navigation-safety-fixture`, `modal-dialog-fixture`, and
`duplicate-button-fixture` (P0 items 1–4 of this same pass).

## A genuine negative finding: no real "plain authenticated" page exists in the accessible corpus

`authenticated-page-plain` is fully synthetic because a real example
could not be found, not merely because a real export wasn't copied in. A
full sweep of every accessible real corpus app this pass (`apextogo`,
`sample-cards`, `concurrent-manager`, `sample-application-search` — 126
real non-global pages total) found **zero** pages that are non-public
AND do not set `security.pageAccessProtection: argumentsMustHaveChecksum`.
Every real non-public page checked also enables checksum protection. This
is recorded here as a genuine, checked-and-negative finding (per this
project's own discipline — see `examples/verified-apps/concurrent-manager`'s
`RESULTS.md` for the precedent of recording a checked-negative finding
explicitly rather than silently skipping it), not an assumption.

## Running

```bash
cd packages/generator
npx vitest run test/golden.test.ts
```

For each fixture: `generate()` twice independently (self-consistency,
matching the existing `reference-fixtures` check), then diff the first
run byte-for-byte against the committed `expected/` directory
(correctness). A committed `vitest.config.ts` at the package root
excludes `test/golden/expected/**` and `test/golden/fixtures/**` from
vitest's own test-file auto-discovery — the generated `.spec.ts` files
under `expected/` are data, not test suites, and would otherwise be
picked up and executed as (broken) vitest tests.

## Updating `expected/` after an intentional template change

1. Regenerate: `node -e "require('./dist/lib.js').generate('test/golden/fixtures/<name>', '/tmp/out')"` (after `npm run build`).
2. Diff `/tmp/out` against `test/golden/expected/<name>` to confirm the
   change is the one you intended, and only that one.
3. Copy the new output over `expected/<name>/`.
4. Explain the change in the commit message — this mirrors
   `.ai/checklists/release.md`'s existing requirement for
   `examples/employee-page`, extended to cover every fixture here.

## Release-gate status

This should become part of `.ai/checklists/release.md`'s regular
verification pass, alongside the existing `reference-fixtures` /
`examples/employee-page` check — see that file's "Regenerate
`packages/generator/test/fixtures/reference-fixtures`" line, now joined
by an equivalent line for this directory.
