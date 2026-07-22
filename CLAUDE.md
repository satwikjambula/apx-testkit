# CLAUDE.md — apx-testkit

Deterministic Playwright test generation for Oracle APEX 26.1+ from APEXlang
(.apx) exports. Monorepo, npm workspaces, TypeScript/ESM, Node 22.

## What this is
- `packages/parser` (@apx/parser): .apx -> typed JSON AST. Read-only by
  design; NO emitter (SQLcl owns import). Unknown constructs are preserved in
  `raw` bags and reported as warnings — never silently dropped.
- `packages/testkit` (@apx/testkit): Playwright fixtures + component helpers.
  `item.ts` is the only fully VERIFIED component (apex.item round-trip);
  `region.ts`/`button.ts` are deliberately partial (open DOM convention —
  button routes around it via accessible-role/label locator instead);
  `auth.ts` is a login fixture, implemented but UNVERIFIED against a real
  instance (no ground-truth app has a login page yet). Generated code AND
  hand-written specs both import from here — never duplicate this logic
  locally (see Invariant 3).
- `packages/generator` (@apx/testgen): `lib.ts` (generate/inspect) + thin
  `cli.ts`. Emits per-page Playwright smoke specs that import their
  assertions from `@apx/testkit` — the generated file itself contains no
  helper functions, only per-page glue (pageUrl, item ids, title string).
- `packages/mcp` (@apx/mcp): MCP stdio server exposing `inspect_apex_export`
  and `generate_apex_tests` for agentic editors.
- `spike/`: runnable Playwright suite against a live public instance
  (UX Pattern Catalog). `spike/tests-generated/` holds generator output;
  `spike/tests/p410-testkit-primitives.spec.ts` is the M2 exit-criterion spec
  (hand-written, testkit primitives only). `spike/tests/p410-simple-form.spec.ts`
  is the original DOM-discovery spike — keep it as-is until the region/button
  discovery report lands.

## Commands
- Install: `npm install` (workspace root — hoists everything, REQUIRED before
  `spike` works: `@apx/testkit` is a real runtime dependency of every spec,
  not just a type-checking convenience, and it resolves `@playwright/test`
  from the root-hoisted copy)
- Parser tests: `cd packages/parser && npx vitest run`
  (integration test needs `APX_EXPORT_DIR` pointing at a real APEXlang export
  root; it skips cleanly when absent — the eager `parseApp()` call must stay
  inside `beforeAll`, not the `describe` body, or `skipIf` doesn't actually
  prevent it from throwing)
- Testkit tests: `cd packages/testkit && npx vitest run` (pure helpers only —
  `normalizeTitle`/`apexPageUrl`; everything else needs a live `page`)
- `npm test` (root) runs `test` in every workspace that defines one
  (`--if-present` — generator/mcp have no test script, that's expected)
- Build: `(cd packages/parser && npx tsc -p tsconfig.json) &&
  (cd packages/testkit && npx tsc -p tsconfig.json) &&
  (cd packages/generator && npx tsc -p tsconfig.json) &&
  (cd packages/mcp && npx tsc -p tsconfig.json)`
- Generate: `node packages/generator/dist/cli.js <export-dir> --out <dir>`
- Live suite: `npm install && cd spike && npm install && npm run setup &&
  npm test` (base URL: `APEX_BASE_URL` env or default in
  `spike/playwright.config.ts`). Do NOT add `@playwright/test` back to
  `spike/package.json` — it must resolve the single root-hoisted copy, or
  Playwright throws "Requiring @playwright/test second time".

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
   never captured. `packages/testkit/src/components/region.ts` only exposes
   `probeRegions`/`refreshRegion` via apex.region()'s own widget API — no
   selector guess. `button.ts` sidesteps the open question entirely via an
   accessible-role/label locator (works today, but a static-id convention
   would be more robust once known). Get the discovery output (rerun
   `spike/tests/p410-simple-form.spec.ts` and read the two JSON blocks),
   then: record the convention in the ledger, extend region.ts, wire region
   assertions into the generator.
2. DONE: full generated-suite run against the live instance —
   39/43 passed; the only failures are p00420-data-entry-drawer-form (4
   tests, GET returns 400 — drawer/modal pages don't resolve via plain
   friendly-URL GET). That is the expected, already-documented gap, not new
   information — no ledger entry needed unless the *cause* gets diagnosed.
3. `required` item flag canonical property: unknown (no required item in the
   ground-truth app). Build a form with a required item, export, confirm.
4. OSS launch gates: read APEXlang Language Reference legal front-matter
   (naming: keep neutral `apx-*` until cleared; see docs/license-check.md),
   publish docs/validation-post.md, replace LICENSE stub with full
   Apache-2.0 text, state maintenance cadence honestly in README.
5. M2 login fixture: IMPLEMENTED (`packages/testkit/src/fixtures/auth.ts`)
   but still UNVERIFIED — all ground-truth pages are public, so `login()`'s
   assumptions (P101_USERNAME/P101_PASSWORD, Enter-to-submit) have never run
   against a real APEX login page. Needs an export with a non-public page to
   validate against; until then treat `auth.ts` as best-effort, not a
   verified contract like item.ts.
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
