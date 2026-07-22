# apx-testkit (working name — see docs/license-check.md before renaming/publishing)

Generate a maintainable Playwright regression suite directly from an Oracle
APEX 26.1+ application's APEXlang (.apx) export.

**Status: pre-alpha / M0.** The parser here is PROVISIONAL: it implements a
grammar inferred from Oracle's published documentation excerpts and a
hand-written fixture. Nothing is trustworthy until it has been validated
against a real APEXlang export — see docs/grammar-assumptions.md for the
ledger of assumptions that must be checked first, and docs/license-check.md
for the naming/licensing gate before any public release.

Packages:
- `packages/parser` (@apx/parser) — .apx -> typed JSON AST. Read-only, no
  emitter by design; unrecognized constructs are preserved in `raw` bags and
  reported as warnings, never silently dropped.
- `packages/testkit` (planned, M2) — Playwright fixtures + component helpers
  built on apex.item()/apex.region() and documented domIds only. Generated
  code imports these primitives and never contains raw selectors, so an APEX
  DOM change is fixed once here, not in every generated suite.
- `packages/generator` (planned, M3) — deterministic CLI: export in, page
  objects + smoke specs out. Same input, byte-identical output.

Scope commitments: APEX 26.1+ only. No linter (APEX Advisor / SQLcl own
validation). No .apx writer (SQLcl owns import). No LLM calls in the test
loop — determinism is the point.

Run the current tests: `cd packages/parser && npm install && npm test`

See `apexlang-testkit-v0.1-plan.md` (project plan) for milestones and the
risk register.

## Multi-page generation (working today)

    node packages/generator/dist/cli.js <export-dir> --out spike/tests-generated
    cd spike && npm test

Against the UX Pattern Catalog export this emits 18 deterministic specs
(byte-identical across runs), asserting only runtime-VERIFIED contracts:
alias-derived URL loads with 2xx, clean console, normalized-title match,
every declared pageItem present (incl. hidden), and an apex.item round-trip
per page. Region/button assertions are TODO pending the DOM-convention
discovery report. Pages without `authentication: public` are emitted as
skipped until the login fixture (M2) exists.

## Open-sourcing status

Pre-launch gates (docs/license-check.md, CONTRIBUTING.md): confirm naming vs
Oracle trademarks, publish the community validation post, and commit to the
per-release maintenance cadence — or label the launch "experimental".
