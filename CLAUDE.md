# CLAUDE.md — apx-testkit

Deterministic Playwright test generation for Oracle APEX 26.1+ from APEXlang
(.apx) exports. Monorepo, npm workspaces, TypeScript/ESM, Node 22.

## What this is
- `packages/parser` (@apx/parser): .apx -> typed JSON AST. Read-only by
  design; NO emitter (SQLcl owns import). Unknown constructs are preserved in
  `raw` bags and reported as warnings — never silently dropped.
- `packages/generator` (@apx/testgen): `lib.ts` (generate/inspect) + thin
  `cli.ts`. Emits per-page Playwright smoke specs.
- `packages/mcp` (@apx/mcp): MCP stdio server exposing `inspect_apex_export`
  and `generate_apex_tests` for agentic editors.
- `spike/`: runnable Playwright suite against a live public instance
  (UX Pattern Catalog). `spike/tests-generated/` holds generator output.

## Commands
- Install: `npm install` (workspace root — hoists everything)
- Parser tests: `cd packages/parser && npx vitest run`
  (integration test needs `APX_EXPORT_DIR` pointing at a real APEXlang export
  root; it skips cleanly when absent)
- Build: `(cd packages/parser && npx tsc -p tsconfig.json) &&
  (cd packages/generator && npx tsc -p tsconfig.json) &&
  (cd packages/mcp && npx tsc -p tsconfig.json)`
- Generate: `node packages/generator/dist/cli.js <export-dir> --out <dir>`
- Live suite: `cd spike && npm install && npm run setup && npm test`
  (base URL: `APEX_BASE_URL` env or default in `spike/playwright.config.ts`)

## Non-negotiable invariants (do not "improve" these away)
1. DETERMINISM: `generate()` must produce byte-identical output for identical
   input. Verify after any generator change:
   generate twice into two dirs, `diff -r`. No timestamps, no randomness.
2. EVIDENCE OVER ASSUMPTION: the generator emits ONLY assertions whose
   metadata->DOM contract is marked VERIFIED in
   `docs/grammar-assumptions.md` ("Runtime verification" section). Adding an
   assertion type requires adding its verification evidence to the ledger in
   the same change.
3. NO RAW SELECTORS in generated code — only documented apex.* JS APIs and
   verified DOM contracts. DOM churn gets fixed once in shared primitives.
4. NO LLM IN THE TEST LOOP. Agents dispatch generation; they never author
   assertions. This is the product's differentiation — protect it.
5. NEVER COMMIT Oracle-authored exports (redistribution unchecked). Local
   ground truth lives outside the repo; integration tests use APX_EXPORT_DIR.
6. Generated files are DO-NOT-EDIT; regenerate and review the diff alongside
   the .apx diff.

## Verified runtime facts (live 26.1 instance)
- Friendly URL = lowercased page alias; `authentication: public` serves 200
  with no redirect.
- pageItem identifiers map to DOM node ids VERBATIM (all tested item types,
  incl. hidden); `apex.item(id)` setValue/getValue round-trips.
- Page titles differ from .apx by invisible chars: compare only after NFKC
  normalize + dash-fold + whitespace-collapse. Never raw equality.
- Playwright footgun: `page.goto('/x')` with a baseURL containing a path
  RESETS to host root. Always build absolute URLs (see `pageUrl()` helpers).

## Outstanding debts (highest value first — ask the user for these)
1. REGION/BUTTON DOM convention: the spike's `REGION DISCOVERY` and
   `BUTTON DISCOVERY` console blocks from the user's last green run were
   never captured. Without them, region/button assertions stay TODO in every
   generated spec. Get that output (rerun `spike` and read the two JSON
   blocks), then: record the convention in the ledger, add testkit
   primitives, extend the generator.
2. Full 18-spec run results against the live instance (expect failures on
   drawer/modal p420 and faceted/IG pages — each failure is a new ledger
   entry, not a bug to silence).
3. `required` item flag canonical property: unknown (no required item in the
   ground-truth app). Build a form with a required item, export, confirm.
4. OSS launch gates: read APEXlang Language Reference legal front-matter
   (naming: keep neutral `apx-*` until cleared; see docs/license-check.md),
   publish docs/validation-post.md, replace LICENSE stub with full
   Apache-2.0 text, state maintenance cadence honestly in README.
5. M2 login fixture (all ground-truth pages were public — auth path has zero
   real-world validation).
6. Typed projection backlog = `unmodeled` list the generator prints
   (facet, dynamicAction, process, column, savedReport, series, ...).
7. MCP SDK pinned ^1.0.0; re-verify API surface against latest SDK docs
   before npm publish.

## Key docs
- docs/grammar-assumptions.md — THE ledger (verified vs open). Treat as the
  contract; update it in the same PR as any behavior change.
- docs/editor-integration.md — CLI / MCP / agent-rules usage.
- docs/license-check.md, docs/validation-post.md, CONTRIBUTING.md,
  apexlang-testkit-v0.1-plan.md (original plan + risk register).

## Style
- Boring, conventional TypeScript over clever. Strict mode. ESM (`.js`
  specifiers in imports). Keep parser subset-honest: prefer `raw`-bag capture
  + warning over speculative typed fields.
