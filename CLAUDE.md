# CLAUDE.md — apx-testkit

@AGENTS.md

Deterministic Playwright test generation for Oracle APEX 26.1 from APEXlang
(.apx) exports. Monorepo, npm workspaces, TypeScript/ESM, Node 22. ("26.1",
not "26.1+" — see constitution §3/`.ai/knowledge/constitution-reconciliation.md`:
this project has not verified parser/runtime behavior against any later
release, so it doesn't claim compatibility with one.)

## AI agent governance — read before making any change

The portable constitution, package summary, and evidence discipline are
in `AGENTS.md` (imported above) — shared with every other AI coding tool
this project supports (Cursor, Codex, Antigravity, etc.). This section is
the Claude-Code-specific layer on top of that. Read `.ai/AGENT.md` next —
it covers architecture decisions (`.ai/ADR/`), what each package actually
does (`.ai/knowledge/`), and step-by-step procedures for common changes
(`.ai/checklists/`). Eight role-scoped subagents are defined in
`.claude/agents/`, organized by decision authority (Product Architect,
Software Architect, Oracle APEX Architect, Compiler/Parser Engineer,
Runtime & Test Automation Engineer, QA/Verification Engineer,
Documentation & DX Engineer, Release Engineer) — invoke the one matching
the work at hand rather than working across all of `packages/*` in one
undifferentiated pass. Fastest way in: the `/product`, `/architect`,
`/apex`, `/parser`, `/runtime`, `/qa`, `/docs`, `/release` slash commands
(see `.ai/AGENT.md`
"Invoking these agents" for all three invocation methods and a
path-to-agent quick reference).

A 65-section project constitution was reconciled against this codebase
on 2026-08-15 — see `.ai/knowledge/constitution-reconciliation.md` for
the full section-by-section audit (what's already real, what's partial,
what's newly adopted into `DESIGN_GUARDRAILS.md`, and what's flagged as
a separate scope proposal — SQLcl validation, Oracle Skills/MCP
ecosystem integration, Oracle Blueprints, AI Agent/Tool verification,
and `npm run verify` all need their own product/architecture review
before anyone builds toward them, not silent adoption). That pass also
found `callRegionMethod` (`packages/testkit/src/components/region.ts`,
publicly exported from `index.ts`) is a real, currently-unrestricted
generic runtime-method escape hatch — flagged for Software Architect +
Runtime & Test Automation Engineer review, not yet resolved either way.

## What this is
- `packages/parser` (@apx/parser): .apx -> typed JSON AST. Read-only by
  design; NO emitter (SQLcl owns import). Unknown constructs are preserved in
  `raw` bags and reported as warnings — never silently dropped.
- `packages/testkit` (@apx/testkit): Playwright fixtures + component helpers.
  `item.ts` is the only fully VERIFIED component (apex.item round-trip);
  `region.ts`/`button.ts` are deliberately partial (open DOM convention —
  button routes around it via accessible-role/label locator instead);
  `auth.ts` is a login fixture: field ids (P101_USERNAME/P101_PASSWORD)
  CONFIRMED live against a real second APEX app's login page; submission
  switched to a button click after Enter proved unreliable there (1
  success then 3 consecutive silent non-submissions, live) — that fix is
  NOT yet independently re-verified (spike/tests/auth-login-verify.spec.ts
  is ready for whoever has credentials to run it). Generated code AND
  hand-written specs both import from here — never duplicate this logic
  locally (see Invariant 3).
- `packages/generator` (@apx/testgen): `lib.ts` (generate/inspect) + `page-object.ts`
  (AST page -> typed PageObject class: `ApexItem` accessors, `clickXxx()`
  button methods, `goto()`/`url()`) + thin `cli.ts`. Emits TWO files per
  page: `.page.ts` (the page object) and `.spec.ts` (a smoke spec that
  exercises it — never calls `@apx/testkit` directly for navigation/items,
  only through the page object, so the two can't drift apart). Neither file
  contains helper functions of its own, only per-page glue.
  `spike/tests-generated/` is STALE (pre-page-object template) — the real
  export needed to regenerate it isn't available in this environment; the
  new shape is verified via `packages/generator/test/fixtures/reference-fixtures`
  instead (see CI's determinism gate) and proven live in
  `spike/tests/p410-page-object-demo.spec.ts`.
- `packages/mcp` (@apx/mcp): MCP stdio server exposing `inspect_apex_export`
  and `generate_apex_tests` for agentic editors.
- `spike/`: runnable Playwright suite against a live public instance
  (UX Pattern Catalog). `spike/tests-generated/` holds generator output;
  `spike/tests/p410-testkit-primitives.spec.ts` is the M2 exit-criterion spec
  (hand-written, testkit primitives only). `spike/tests/p410-simple-form.spec.ts`
  is the original DOM-discovery spike — keep it as-is until the region/button
  discovery report lands.

## Architecture: the AST is the canonical semantic model

`packages/parser/src/ast.ts`'s `ApexAppAst`/`ApexPage`/`ApexRegion`/
`ApexItem`/`ApexButton` types ARE this project's canonical semantic
representation — not a placeholder waiting for a formal "Application
Model" layer. Every real consumer already builds directly on it, with no
duplication between them:

```
Oracle Export (.apx)
        |
        v
   @apx/parser  --  parseApp() -> ApexAppAst (astVersion-tagged)
        |
        +--> @apx/testgen: page-object.ts / lib.ts (Playwright generation)
        +--> @apx/testgen: coverage.ts       (touched-vs-declared reporting)
        +--> @apx/testgen: diff.ts           (export-to-export regression)
        +--> (future consumers attach here, reading the same AST)
```

Package boundaries this implies, already true today without a formal
split: `@apx/parser` owns the AST and nothing downstream of it (no
generation, no coverage, no diff logic). `@apx/testgen` consumes the AST
directly via `parseApp()`/`loadExport()` — it does not re-parse or
duplicate parser logic. `@apx/testkit` is runtime-only and has zero
dependency on `@apx/parser` — it never sees a `.apx` file or the AST,
only a live `page` object.

Why not extract a separate `@apx/model` package: the three real consumers
above already share the AST with zero duplication between them. An
extraction today would mostly rename and relocate types that already
serve their purpose — it earns its cost when a genuinely different KIND
of consumer shows up (e.g. one needing a different shape than the
parser's line-oriented projection gives, not just another reader of the
same fields). Until then, treat `ast.ts` as the contract: changes to it
are changes to the public semantic model, not an internal implementation
detail, even though it lives inside `@apx/parser`.

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

Recently resolved, noted here only so this list doesn't read as stale
relative to this repo's own recent commits: checksum-protected-page
navigation now gets an explicit `ui-navigation` skip instead of a
guaranteed-fail bare `goto()` (`assessNavigationSafety`,
`packages/testkit/src/fixtures/navigation.ts`); `modalDialog` pages get
the same explicit-skip treatment (`isModalDialogUnroutable`,
`packages/generator/src/lib.ts`); button-label collisions now resolve to
semantic coverage identity instead of collapsing on label text
(`ButtonCoverageIdentity`, `packages/testkit/src/fixtures/coverage.ts`);
`packages/generator/test/golden/` adds a real correctness gate on top of
the double-generate determinism check (self-consistency alone doesn't
prove the output is right — see `.ai/knowledge/generator.md`); and
`npm ci` plus canonical build/typecheck commands are now used
everywhere. See `.ai/knowledge/constitution-reconciliation.md`'s §62
table for the fuller P0/P1/P2 cross-check.
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
   UPDATE: confirmed concretely for Interactive Grid — the `.apx` export's
   region identifier (`basic-editing`) is NOT the runtime static id
   (`emp`); see docs/quirks/26.1.json `region-id-not-static-id` and
   `packages/testkit/src/components/interactive-grid.ts`. Still open
   whether IR/Cards/Faceted Search (where identifier == runtime id in
   every app checked so far) can also diverge, or whether this is
   IG-specific.
   UPDATE 2: root cause diagnosed. The `.apx` export's `region { advanced {
   htmlDomId: ... } }` property, when present, deterministically predicts
   the runtime id (`<htmlDomId>_jet` for Chart, `<htmlDomId>_ig` for IG) —
   now typed at the parser level as `ApexRegion.htmlDomId`
   (packages/parser/src/ast.ts). When absent (confirmed: 66/97 real chart
   regions in Oracle's "Sample Charts" app), the runtime id is an
   APEX-internal auto-generated numeric id with no corresponding field
   anywhere in the static export — genuinely undiscoverable without live
   access, not a parser gap. See docs/quirks/26.1.json
   `region-id-not-static-id`. Separately, this same investigation found
   and corrected a wrong prior claim that `apex.region(id).widget()`
   returns `null` for Chart regions — see `chart-region-widget-returns-null`
   in the same file and `packages/testkit/src/components/chart.ts`.
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
5. M2 login fixture: PARTIALLY VERIFIED, one real bug found+fixed, one
   earlier diagnosis corrected. Field ids
   (`P101_USERNAME`/`P101_PASSWORD`) confirmed live against a real second
   APEX app's login page ("Sample File Upload and Download") -- exact
   match, no changes needed. The real bug: `login()` checked `page.url()`
   once right after `waitForLoadState('domcontentloaded')` -- a race
   condition. A run that threw "URL unchanged after submit" had its
   failure screenshot show the user ALREADY logged in on the real
   post-login dashboard -- the login had succeeded, the check just ran
   before an async/AJAX-driven redirect landed. The prior theory in this
   file ("Enter unreliable, switch to button click") was very likely the
   wrong diagnosis for the same race -- both submission methods can hit
   it. Fixed by waiting for an actual URL change (`page.waitForURL`, up to
   `timeoutMs`) instead of a single fixed-point check. This fix has NOT
   been independently re-verified live -- credential-based testing was
   intentionally not repeated by Claude (entering passwords into forms is
   not something Claude does itself, even with explicit user
   authorization) -- the user ran it themselves and shared the failing
   output, which is how this bug was actually found.
   `spike/tests/auth-login-verify.spec.ts` (env-var gated,
   `APX_LOGIN_TEST_USERNAME`/`APX_LOGIN_TEST_PASSWORD` -- neither
   hardcoded, so no account info is committed) is ready for whoever has
   credentials to close this out. Until then treat `auth.ts` as
   evidence-informed but not a fully closed verified contract like item.ts.
6. Typed projection backlog = `unmodeled` list the generator prints
   (facet, dynamicAction, process, column, savedReport, series, ...).
7. MCP SDK pinned ^1.0.0; re-verify API surface against latest SDK docs
   before npm publish.

## Official grammar reference — check this EVERY time, not a spot-check

**https://docs.oracle.com/en/database/oracle/apex/26.1/apxln/** is Oracle's
own published APEXlang Language Reference, and
**https://docs.oracle.com/en/database/oracle/apex/26.1/apxln/apexlang.ebnf**
is the complete, formal EBNF grammar behind it (11,700+ lines, every
component). It's the authoritative source for what a property is *called*
and what values it accepts.

**This applies to every parser change, not just new components** —
building a new typed field, extending an existing one, or reviewing an
existing one for a bug all require checking the relevant production(s) in
this file first. A prior pass here checked `dynamicAction`/`calendar`
alone because those happened to be freshest in context, not because
everything else was already covered — that was a real gap, not a
deliberate scope decision, and it took a direct follow-up to catch it. A
later full pass against `page`/`region`/`page-item`/`button` found a real
bug (`region.source.sql` reading the wrong raw key — see
docs/grammar-assumptions.md) that a narrower check would have missed
entirely. Check the specific component(s) actually relevant to what's
being touched — not necessarily all 40+ every time — but check them
completely (every direct property AND every group in that component's
production), not just the properties already assumed to matter.

**Fetch the raw `.ebnf` file directly (`curl`), not through an
AI-summarizing fetch tool.** Confirmed live: an AI-summarized fetch
invented a `@{component-id}` reference form that does not exist anywhere
in the actual grammar (`grep` on the raw file confirms) -- it misread the
EBNF's own meta-notation (`{ X }` meaning "zero or more X") as if it were
literal curly-brace syntax. The real grammar is just
`<reference> ::= "@" { <reference-character> }` -- i.e. `@` followed by
reference characters, no braces. A summarizing tool can hallucinate on
precise, symbol-dense text like a grammar spec even when it's just
paraphrasing, not omitting -- always cross-check anything load-bearing
against the raw text. Don't commit the raw file into this
repo (it's Oracle's own published content, same redistribution caution as
the sample app exports — see docs/limitations.md) — re-fetch it fresh each
time, or keep a local scratch copy for the length of a working session.

**This reference is authoritative but not infallible or complete** — same
discipline as everywhere else in this project. Confirmed example: the
`dynamicAction` grammar (including `when.customEvent` and
`action.name`, both added to the typed AST after checking this file) is
fully and precisely documented. But `ApexRegion.calendarSettings`'s real,
live-verified properties (`displayColumn`, `startDateColumn`, `pkColumn`,
`showTime`, `dragAndDrop`, ...) do NOT appear anywhere in this EBNF file at
all — confirmed by direct search, not a sampling miss. When the official
reference and real, live-parsed export data disagree or one is silent, the
real export data wins; note the discrepancy in docs/grammar-assumptions.md
rather than silently picking one side.

## Key docs
- docs/grammar-assumptions.md — THE ledger (verified vs open). Treat as the
  contract; update it in the same PR as any behavior change.
- docs/editor-integration.md — CLI / MCP / agent-rules usage.
- docs/license-check.md, docs/validation-post.md, docs/support-matrix.md,
  docs/limitations.md, CONTRIBUTING.md.
- docs/quirks/26.1.json — structured index of real bugs found and fixed
  (or found and left open) by live verification, one JSON record per
  quirk with evidence/workaround/status. Documentation, not (yet) wired
  into runtime warnings — see docs/ecosystem-roadmap.md.
- docs/verification/26.1.json + docs/verification/README.md — the
  machine-readable verification registry (evidence-level taxonomy,
  schema, the one wired consumer). Indexes the two ledgers above; does
  not replace either.
- .ai/knowledge/testing.md — test layering, fixture strategy, and
  "definition of done" across all four packages (not one package's own
  `knowledge/` file).
- .ai/knowledge/constitution-reconciliation.md — section-by-section audit
  of the project constitution against this codebase's actual state.

## Style
- Boring, conventional TypeScript over clever. Strict mode. ESM (`.js`
  specifiers in imports). Keep parser subset-honest: prefer `raw`-bag capture
  + warning over speculative typed fields.
