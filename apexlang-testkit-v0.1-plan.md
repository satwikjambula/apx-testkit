# APEXlang Test Toolkit — v0.1 Working Document

**Status:** Draft for validation. Nothing below is committed until the two blocking checks in §1 pass.
**Target platform:** Oracle APEX 26.1 and above only. No backports.
**One-line pitch:** Generate a maintainable Playwright regression suite directly from an APEX application's own `.apx` source files.

---

## 1. Blocking pre-work (do these before any code)

These are cheap and either one can kill or reshape the project. Do them in week zero.

**1.1 — License check on the APEXlang spec.** Oracle documents the grammar (APEXlang Language Reference + APEXlang Atlas) but states it is not open-source. Read the Language Reference's legal/usage preamble and the Oracle Technology Network license terms it falls under, and confirm nothing restricts building an independent parser from the published documentation. Expected outcome: fine (documented-spec implementation is standard practice), but verify. If restrictive language exists, the fallback is a parser built only from observed export output (clean-room from artifacts, not docs) — slower and riskier, and worth knowing before naming the repo.

**1.2 — Ground-truth export.** Get a 26.1 instance (apex.oracle.com workspace or local 26.1 + ORDS in a container), install the Sample Database Application, export it as APEXlang, and read every file. All grammar assumptions in §4 are inferred from Oracle blog posts and docs excerpts — they must be corrected against a real export before the AST is finalized. Keep this export in the repo as the primary parser test fixture (check redistribution rights first; if unclear, keep it local-only and commit a hand-built minimal fixture app instead).

**1.3 — Demand validation (parallel, not blocking).** One post: APEX forums + r/orclapex + the comment thread of Dimitri Gielis's "AI era" setup post. Describe exactly this scope. The goal is not encouragement — it's finding the second and third user, and hearing which generated tests they'd actually run in CI.

---

## 2. What this is and is not

**Is:** two npm packages. (1) A standalone, read-only APEXlang parser that turns a `.apx` export into a typed JSON AST. (2) A Playwright toolkit that consumes that AST to generate page objects and smoke tests, plus hand-written fixtures for the parts that can't be generated (auth, session, console-error capture).

**Is not, in v0.1:** a linter (collides with APEX Advisor and Oracle's SQLcl validation roadmap), a `.apx` writer/emitter (SQLcl owns import; a writer invites round-trip corruption bugs), a full-grammar parser (themes, templates, report-column minutiae are out), Interactive Grid deep interaction (hardest DOM in APEX; v0.2 at earliest), anything for pre-26.1 apps, and not an AI test generator (determinism is the selling point — the generator's output for a given `.apx` input must be byte-identical every run).

**Why the parser ships separately:** it's the piece with network effects. Every future APEXlang tool (doc generators, migration tools, other people's linters) needs one, and Oracle's own parser is currently locked inside SQL Developer for VS Code language services, not published as a library. Known risk: if Oracle ever publishes theirs as a library, the parser package is obsolete — the testkit is the durable half. Structure the work so the testkit never depends on parser internals, only on the AST JSON contract (§5), so the parser is swappable.

---

## 3. Repository structure

Monorepo, pnpm workspaces, TypeScript throughout. Playwright is TS-native and the APEX audience overlaps heavily with VS Code users; a PL/SQL implementation was considered and rejected because the test runner, CI ecosystem, and Playwright itself all live in Node.

```
apexlang-testkit/                      (working name — see §9)
├── packages/
│   ├── parser/                        # @<scope>/apexlang-parser
│   │   ├── src/
│   │   │   ├── lexer.ts               # tokenizer: identifiers, strings, numbers,
│   │   │   │                          #   ( ) { } : , @refs, comments, heredoc-style
│   │   │   │                          #   embedded SQL/PLSQL/JS blocks
│   │   │   ├── parser.ts              # recursive descent -> AST
│   │   │   ├── ast.ts                 # typed AST node definitions (see §5)
│   │   │   ├── resolver.ts            # resolves @references across files
│   │   │   ├── package-reader.ts      # reads the exported zip / folder layout
│   │   │   └── errors.ts              # positioned parse errors (file:line:col)
│   │   ├── test/
│   │   │   └── fixtures/              # minimal hand-built .apx samples per construct
│   │   └── package.json
│   ├── testkit/                       # @<scope>/apex-playwright
│   │   ├── src/
│   │   │   ├── fixtures/
│   │   │   │   ├── auth.ts            # APEX login (credentials + session cookie reuse)
│   │   │   │   ├── session.ts         # workspace/app/session URL handling
│   │   │   │   └── console-guard.ts   # fail test on JS console errors (allowlist)
│   │   │   ├── components/
│   │   │   │   ├── item.ts            # wraps apex.item() — get/set/validate
│   │   │   │   ├── region.ts          # wraps apex.region() — refresh, wait-for-load
│   │   │   │   ├── button.ts
│   │   │   │   └── ir.ts              # Interactive Report basics: search, wait
│   │   │   └── index.ts
│   │   └── package.json
│   └── generator/                     # @<scope>/apex-testgen (CLI)
│       ├── src/
│       │   ├── cli.ts                 # apex-testgen ./my-app-export --out ./tests
│       │   ├── page-object.ts         # AST page -> PageObject class emit
│       │   ├── smoke.ts               # AST page -> smoke spec emit
│       │   └── templates/             # generated-file templates (string, not JSX)
│       └── package.json
├── examples/
│   └── sample-db-app/                 # generated output for the Sample Database App,
│                                      #   committed so people can read it without running anything
├── docs/
│   ├── ast-spec.md                    # the JSON AST contract — the real API surface
│   ├── support-matrix.md              # which APEX versions each release is verified against
│   └── limitations.md                 # honest list, incl. "use n8n if you can" ethos: here,
│                                      #   "these page types are not covered"
├── .github/workflows/ci.yml           # lint, unit tests, e2e against a 26.1 container
└── ARCHITECTURE.md
```

Design rule that keeps the treadmill survivable: **generated code imports from the testkit; it never contains raw selectors.** When an APEX release changes the DOM, you patch `components/*.ts` once and every generated suite inherits the fix without regeneration. Generated files are disposable; the testkit is the maintained surface.

---

## 4. Grammar assumptions to verify against the real export (from §1.2)

Recorded here so they get checked off, not silently trusted. Inferred so far: components are typed blocks with the identifier after the type (`page 3 ( ... )`, `region employee ( ... )`); properties are `name: value` pairs, with nested property groups in braces (`source { location: localDatabase tableName: EMP }`); `@`-prefixed values reference another component's identifier, with the compiler enforcing identifier uniqueness per scope (app / page / parent); page files follow `p<page-number>-<page-alias>.apx`; shared components live in their own files (e.g. `shared-components/lists.apx` containing list blocks with entries); native SQL/CSS/JS/images ship as ordinary sibling files at proper paths, so long code bodies may live outside `.apx` files or embedded — **which of the two, and how embedding is delimited, is the single most important thing to confirm**, because it decides the lexer design. Also unverified: string quoting/escaping rules, comment syntax, whether property order is significant, casing rules (VS Code quick-fixes mention invalid casing, implying case-sensitivity in places), and exactly which attributes carry the stable Static ID / domId per component type.

---

## 5. AST design (the contract everything depends on)

Read-only, JSON-serializable, versioned. The generator, and any third-party tool, consumes this — not parser internals. Keep it deliberately close to the Page Designer mental model rather than inventing abstractions.

```ts
// ast.ts — v0.1 subset. Every node keeps `loc` (file, line, col) and `raw`
// (unrecognized properties as an untyped bag) so partial parsing never lies
// by omission: what we didn't understand is still visible downstream.

interface ApexApp {
  astVersion: string;          // contract version, semver, independent of pkg version
  apexVersion: string | null;  // as declared in the export, if present
  alias: string;
  name: string;
  pages: ApexPage[];
  authentication: Ref | null;
  sourceFiles: string[];       // every file consumed, for cache invalidation
}

interface ApexPage {
  id: number;                  // page number
  alias: string;
  name: string;
  title: string | null;
  authorization: Ref | null;   // page-level auth scheme, if any
  regions: ApexRegion[];
  items: ApexItem[];           // page-level items incl. hidden
  buttons: ApexButton[];
  dynamicActions: ApexDynamicAction[];
  processes: ApexProcess[];    // names/points only in v0.1 — enough to know
  validations: ApexValidation[];//   a submit exists; not enough to test logic
  loc: Loc; raw: RawBag;
}

interface ApexRegion {
  identifier: string;          // the stable static ID -> DOM id
  name: string;
  type: string;                // 'form' | 'interactiveReport' | 'interactiveGrid' | ...
                               //   kept as string, with a known-types enum alongside,
                               //   so unknown region types parse instead of failing
  source: { location: string; tableName?: string; sql?: string } | null;
  parentRegion: Ref | null;
  items: ApexItem[];
  buttons: ApexButton[];
  loc: Loc; raw: RawBag;
}

interface ApexItem {
  identifier: string;          // e.g. P3_EMPNO
  type: string;                // textField, hidden, selectList, popupLov, ...
  label: string | null;
  required: boolean;
  sourceColumn: string | null;
  lov: Ref | null;
  loc: Loc; raw: RawBag;
}

interface ApexButton {
  identifier: string;
  label: string;
  action: string;              // submit, redirect, definedByDA, ...
  loc: Loc; raw: RawBag;
}

interface ApexDynamicAction {
  identifier: string;
  event: string;               // change, click, pageLoad, ...
  triggeredBy: Ref | null;     // item/region/button reference
  loc: Loc; raw: RawBag;       // action details deferred past v0.1
}

type Ref = { ref: string; resolved: boolean };
```

Two deliberate choices worth defending in the README: `raw` bags make the parser honest about partial coverage (a generator can warn "this page uses 3 constructs I don't understand" instead of silently generating an incomplete suite); and `type` as open string + known-enum means a new APEX release with a new region type degrades gracefully instead of throwing.

---

## 6. What the generator emits in v0.1

Per page: one page object class (navigation by page alias, one typed accessor per item and button, region wait-helpers) and one smoke spec asserting: the page loads for an authenticated user; no JS console errors (with a documented allowlist mechanism); every region with an identifier is present in the DOM; for each form region, that required items reject empty submit (fires APEX validation) — this last one only where the page has a submit button and required items, detected from the AST. Explicitly not generated: data-dependent assertions (the generator cannot know your data), multi-page workflows, IG cell editing. The docs must say this plainly: **generated smoke tests are a regression floor, not a test strategy.** Their job is to catch "the AI agent's page edit broke rendering/validation" the same day it happens.

Determinism requirement: same `.apx` input ⇒ identical output bytes (stable ordering, no timestamps). This is what makes regenerated suites diffable in PRs, which is the whole workflow story: app change → `.apx` diff → regenerated test diff → both reviewed together.

---

## 7. Milestones

**M0 — Ground truth (week 1).** §1.1 license check done and recorded in the repo. §1.2 export obtained; §4 assumptions corrected; AST spec v0 frozen. Forum/Reddit validation post published. Exit: written go/no-go note. If the post gets zero engagement in two weeks, that is information — proceed only with reduced ambition (personal tooling first, promotion later), not denial.

**M1 — Parser (weeks 2–4).** Lexer + recursive-descent parser covering app file, page files, and the shared components the page subset references (LOVs, auth scheme names). Positioned errors. `raw`-bag capture for everything else. Exit: parses the Sample Database Application export with zero errors and ≥90% of page-level properties landing in typed fields rather than `raw`; published to npm as 0.1.0 with the AST spec doc.

**M2 — Testkit fixtures (weeks 4–6, overlaps M1).** Auth fixture (credential login + storageState reuse so suites don't log in per test), console-error guard, `item`/`region`/`button` wrappers built on `apex.item()` / `apex.region()` / documented DOM ids — not raw CSS paths — per the treadmill rule in §3. Exit: a hand-written Playwright spec against the Sample DB App passes in CI using only testkit primitives.

**M3 — Generator (weeks 6–8).** CLI: export folder in, page objects + smoke specs out, deterministic. Exit: generated suite for the Sample DB App passes green against a clean 26.1 container in GitHub Actions, and the run is reproducible by a stranger from the README in under 15 minutes. That 15-minute number is the real acceptance test for the whole project.

**M4 — Release + second user (weeks 8–10).** Tag v0.1, `examples/` committed, support-matrix doc stating "verified against 26.1 only," limitations doc, and — the actual milestone — at least one person who is not you running it against an app that is not the sample app, with their breakage reports filed as issues. No v0.2 planning until this exists.

---

## 8. Risk register (carried forward from the analysis, so it doesn't get forgotten)

**Oracle publishes their parser as a library** — probability moderate (it exists inside VS Code language services today), impact kills the parser package, not the testkit. Mitigation: AST-contract isolation (§2) so the parser is swappable; treat parser fame as a bonus, not the plan.

**APEXlang format churn** — certainty, not risk; the format is two months old and is the centerpiece of Oracle's AI strategy. Mitigation: `raw` bags + open string types degrade gracefully; per-APEX-version support matrix; budget one maintenance cycle per APEX release (2/yr) as a standing cost. If you are not willing to pay that cost for 3+ years, do not publish — an abandoned testing tool is worse for the community than none.

**APEX DOM churn breaking the testkit** — same cadence. Mitigation: apex.* JS APIs and documented domIds only; the `regionStaticId → regionDomId` rename in 26.1 is the case study for why raw selectors are banned in generated code.

**Small initial market (26.1+ only)** — accepted deliberately. Consequence to internalize: adoption success in year one looks like dozens of users, not thousands. Judge the project against that bar.

**AI QA agents leapfrog** — the counter-positioning must be in the README from day one: deterministic, metadata-derived, CI-stable, zero LLM calls in the test loop, diffable regeneration. If that argument stops being true or persuasive, that is the signal to sunset.

**Single-maintainer death** — the standard OSS killer. Mitigations that cost little: boring conventional code over clever code, CONTRIBUTING.md from v0.1, and the parser/testkit split itself (someone can adopt one half).

---

## 9. Open decisions (deliberately not made yet)

Naming — avoid "apexlang" in the org/package name until the §1.1 license check confirms Oracle trademark posture; a descriptive fallback (`apx-parser`, `apex-testgen`) is safe. License — MIT vs Apache-2.0 (Apache's patent grant is marginally safer given the proprietary-spec context; decide at M0). Whether `generator` folds into `testkit` as a CLI subcommand (fewer packages, simpler) or stays separate (cleaner dependency story) — decide when M2 shows how much they share.
