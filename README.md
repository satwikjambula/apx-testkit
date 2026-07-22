# apx-testkit (working name — see docs/license-check.md before renaming/publishing)

Generate a maintainable Playwright regression suite directly from an Oracle
APEX 26.1+ application's APEXlang (.apx) export.

**Status: pre-alpha / M2.** The parser is PROVISIONAL: it implements a
grammar inferred from Oracle's published documentation excerpts, corrected
against one real export (UX Pattern Catalog). Nothing is trustworthy beyond
that single app until it has been validated against a second, independent
export — see docs/grammar-assumptions.md for the ledger of assumptions that
must be checked first, and docs/license-check.md for the naming/licensing
gate before any public release.

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
- `packages/generator` (@apx/testgen) — deterministic CLI: export in, page
  objects + smoke specs out. Same input, byte-identical output. Generated
  specs import all runtime-verified assertions from `@apx/testkit` rather
  than duplicating them.
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
    node packages/generator/dist/cli.js <export-dir> --out spike/tests-generated
    cd spike && npm install && npm test

Against the UX Pattern Catalog export this emits 18 deterministic specs
(byte-identical across runs), asserting only runtime-VERIFIED contracts —
implemented once in `@apx/testkit`, never duplicated per file: alias-derived
URL loads with 2xx, clean console, normalized-title match, every declared
pageItem present (incl. hidden), and an apex.item round-trip per page.
Region/button assertions are TODO pending the DOM-convention discovery
report. Pages without `authentication: public` are emitted as
`test.describe.skip()` until a real login page exists to verify `auth.ts`
against.

Last live run against the UX Pattern Catalog instance: 39/43 generated tests
passed; all 4 failures were on the drawer/modal page (p420), which does not
load via a plain friendly-URL GET — a known, already-documented gap, not a
regression. `spike/tests/p410-testkit-primitives.spec.ts` is the M2 exit
criterion: a hand-written spec using only `@apx/testkit` primitives, passing
live against the same app.

## Open-sourcing status

Pre-launch gates (docs/license-check.md, CONTRIBUTING.md): confirm naming vs
Oracle trademarks, publish the community validation post, and commit to the
per-release maintenance cadence — or label the launch "experimental".
