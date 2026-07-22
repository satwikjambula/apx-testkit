# apx-testkit

`apx-*` naming (not "apexlang"/"apex") is a permanent, compliance-driven
choice per Oracle's trademark guidelines, not a placeholder — see
docs/license-check.md.

Generate a maintainable Playwright regression suite directly from an Oracle
APEX 26.1+ application's APEXlang (.apx) export.

**Status: pre-alpha / M3 (engineering-complete; M3's live-CI and M4's
external-adopter exit criteria are open — see below).** The parser is PROVISIONAL: it implements a
grammar inferred from Oracle's published documentation excerpts, corrected
against one real export (UX Pattern Catalog). Nothing is trustworthy beyond
that single app until it has been validated against a second, independent
export — see docs/grammar-assumptions.md for the ledger of assumptions that
must be checked first. The naming/licensing question (docs/license-check.md)
is resolved: no restriction found on independent APEXlang parsers, and
`apx-*` naming stays permanently per Oracle's trademark guidelines.

Packages:
- `packages/parser` (@apx/parser) — .apx -> typed JSON AST. Read-only, no
  emitter by design; unrecognized constructs are preserved in `raw` bags and
  reported as warnings, never silently dropped.
- `packages/testkit` (@apx/testkit) — Playwright fixtures + component helpers
  built on apex.item()/apex.region() and documented domIds only. Generated
  code imports these primitives and never contains raw selectors, so an APEX
  DOM change is fixed once here, not in every generated suite. `item.ts` is
  fully verified; `region.ts`/`button.ts` are intentionally partial pending
  the region/button DOM-convention discovery report; `auth.ts` is unverified
  against a real login page (no ground-truth app has one yet).
- `packages/generator` (@apx/testgen) — deterministic CLI: export in, a
  typed `.page.ts` PageObject (item accessors, button click methods) plus a
  `.spec.ts` smoke spec per page, both built on `@apx/testkit`. Same input,
  byte-identical output — verified against a committed synthetic fixture
  (`packages/generator/test/fixtures/mini-export`) in CI's determinism gate.
- `packages/mcp` (@apx/mcp) — MCP stdio server exposing the generator to
  agentic editors (Cursor, Claude Code, etc.); see docs/editor-integration.md.

Scope commitments: APEX 26.1+ only. No linter (APEX Advisor / SQLcl own
validation). No .apx writer (SQLcl owns import). No LLM calls in the test
loop — determinism is the point.

Run the current tests: `npm install && npm run test --workspaces`
(the parser's integration test and the full spike suite both need a real
APEX export/instance and skip cleanly without one).

See `apexlang-testkit-v0.1-plan.md` (project plan) for milestones and the
risk register.

## Multi-page generation (working today)

    npm install   # once, at repo root — @apx/testkit is a real runtime
                   # dependency of generated/hand-written specs, not just a
                   # type-checking convenience
    node packages/generator/dist/cli.js <export-dir> --out <tests-dir>
    cd spike && npm install && npm test

For each page this emits two deterministic, byte-identical-across-runs
files: a `.page.ts` PageObject (typed `ApexItem` accessors per pageItem,
`clickXxx()` methods per labeled button, `goto()`/`url()`) and a `.spec.ts`
smoke spec that exercises it — never talking to `@apx/testkit` directly for
navigation/items, so the two files can't drift apart. Assertions are limited
to runtime-VERIFIED contracts: alias-derived URL loads with 2xx, clean
console, normalized-title match, every declared pageItem present (incl.
hidden), and an apex.item round-trip per page. Region/button *assertions*
are still TODO pending the DOM-convention discovery report (button *click
methods* already work today via an accessible-role/label locator instead of
a guessed selector). Pages without `authentication: public` are emitted as
`test.describe.skip()` until a real login page exists to verify `auth.ts`
against.

**`spike/tests-generated/` is currently stale** relative to this — those 18
files were generated under the pre-page-object template (M2-era) and still
pass, but don't demonstrate the current output shape. Regenerating them for
real needs the actual UX Pattern Catalog export, which isn't committed and
wasn't available in the environment this was built in; whoever has it can
run the command above with `--out spike/tests-generated`. In the meantime,
the new generator's determinism and exact output shape are verified against
a committed synthetic fixture (`packages/generator/test/fixtures/mini-export`,
see CI's "Determinism gate" step), and the PageObject pattern itself is
proven live in `spike/tests/p410-page-object-demo.spec.ts` (hand-written,
mirrors the generator's class shape, passes against the real running app).

Last live runs against the UX Pattern Catalog instance: the (stale-template)
generated suite passed 39/43 — all 4 failures on the drawer/modal page
(p420), which doesn't load via a plain friendly-URL GET, a known documented
gap, not a regression. `spike/tests/p410-testkit-primitives.spec.ts` (M2
exit criterion — hand-written, testkit primitives only) and
`p410-page-object-demo.spec.ts` (M3 — hand-written, PageObject pattern) both
pass 100% live against the same app.

## Open-sourcing status

Pre-launch gates (docs/license-check.md, CONTRIBUTING.md, docs/support-matrix.md,
docs/limitations.md): naming/trademark review is done (keep `apx-*`
permanently); LICENSE is the full Apache-2.0 text. Still open, and outside
what engineering work can produce: publish the community validation post
(docs/validation-post.md, drafted) and find a second user who isn't the
maintainer — see the plan doc's M4 status note.
