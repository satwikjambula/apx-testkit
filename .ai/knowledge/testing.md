# Testing strategy (project-wide, not one package)

The other `.ai/knowledge/*.md` files are package-scoped. This one isn't —
it's the layering and philosophy that spans `packages/parser`,
`packages/testkit`, and `packages/generator` test suites together, plus
what "done" means for a change that touches more than one of them. See
`.ai/knowledge/constitution-reconciliation.md` §A/§D for how this maps to
the project constitution's own testing sections (§§47, 56-61).

## Five layers, not one test suite

1. **Parser tests** (`packages/parser/test/`) — syntax, AST shape, quoted
   values, references, nesting, unknown-property preservation, identifier
   parsing. Run against synthetic fixtures for edge cases and the real
   `.apx` corpus for correctness (see "Real vs. synthetic fixtures"
   below).
2. **Semantic tests** — page metadata, navigation safety
   (`assessNavigationSafety`), region identity resolution (ADR-003),
   component relationships. Live in `packages/generator/test/` and
   `packages/testkit/test/` depending on which package owns the logic
   being checked.
3. **Generator tests** (`packages/generator/test/`) — deterministic
   output (double-generate diff), locator strategy, URLs, authentication
   gating, page-mode/access-protection skip logic, `test/golden/`'s
   correctness gate (see `.ai/knowledge/generator.md` — self-consistency
   is not correctness; golden fixtures check the output is actually
   *right*, not just stable).
4. **Runtime tests** — actual APEX behavior: lifecycle events, region
   APIs, DOM discoverability, authentication. These are NOT vitest unit
   tests — they're hand-written Playwright specs in `spike/`, run against
   a real running instance by hand, because there is no CI running
   against a live Oracle instance (see `.ai/knowledge/architecture.md`
   "Where verification lives"). A runtime claim is not "tested" until
   it's been run this way at least once and recorded in
   `docs/quirks/26.1.json`.
5. **Oracle validation tests** — SQLcl accepting valid fixtures / rejecting
   invalid mutations, as an external oracle independent of this project's
   own parser and EBNF cross-checking. **Not built.** This is
   `.ai/knowledge/constitution-reconciliation.md` §D's flagged SQLcl
   proposal (constitution §§18, 46) — a real, well-motivated idea, but a
   new capability needing its own product/architecture review, not
   something to bolt onto the existing four layers as a side effect of
   any single feature change.

## Real vs. synthetic fixtures

- **Synthetic fixtures** (hand-written `.apx` snippets) are for parser
  edge cases, malformed input, minimal regression tests, and grammar
  boundaries — cases a real export is unlikely to exercise on demand.
  They prove parser *correctness*, never Oracle *runtime* behavior — a
  synthetic fixture parsing correctly says nothing about what
  `apex.region()` actually does with it live.
- **Real fixtures** (the 46-app corpus, `.ai/knowledge/verification.md`)
  are for everything semantic/runtime. Never invent a new showcase app
  before checking whether the existing corpus already covers the
  capability in question — `.ai/knowledge/verification.md`'s own history
  is mostly "did the existing corpus already have this," not "build a
  new app."
- `test/golden/` (`packages/generator/`) fixtures are a third, deliberate
  category: hand-written but modeling *real corpus structure*, never
  copied from an actual Oracle export (redistribution rights — see
  `examples/verified-apps/README.md`). They exist specifically to catch
  a reproducibly-wrong template change that a determinism-only check
  would miss.

## Generated-test philosophy

Generated tests are meant to be **boring**: explicit, deterministic,
debuggable, evidence-backed. No clever generated code, no "smart"
selector inference at generation time — page objects, explicit
assertions, stable selectors sourced from `@apx/testkit`, deterministic
waits (see `DESIGN_GUARDRAILS.md`'s `waitForTimeout` rule), and error
messages a QA engineer with no Claude/Codex access could act on
unassisted. This is not a style preference — it's what makes
`apx-diff` meaningful as a regression signal (`.ai/knowledge/architecture.md`)
and what keeps the "treadmill rule" (generated code and hand-written specs
share `@apx/testkit`, never duplicate logic) actually enforceable.

## Functional scenario philosophy — deferred, not abandoned

The constitution's scenario-authoring sections (§§32, 57-59: actor,
preconditions, action, expected result, evidence, priority; FACT vs.
INFERENCE trustworthiness by category) describe a real, coherent design.
It is **not built** and not scheduled — see
`.ai/proposals/functional-scenario-authoring.md` for the full corrected
architecture and `docs/ecosystem-roadmap.md`'s Sixteenth round for why
it's Deferred rather than Rejected. Don't re-derive this design from the
constitution's prose; the existing RFC is more detailed and has already
been through Product Architect + Software Architect review.

## Before calling anything "done" (Definition of Done)

TypeScript compiling is necessary, never sufficient. A change is done
when, in addition to the relevant layer(s) above:

- Oracle semantics are verified where the change touches Oracle behavior
  (ADR-002/004) — a `docs/quirks/26.1.json` or `docs/grammar-assumptions.md`
  entry, not just a passing test.
- Deterministic output is preserved — regenerate twice, diff, and (for
  generator changes) confirm `test/golden/` still matches.
- No unverified runtime API is exposed on any newly-public surface (see
  `.ai/knowledge/constitution-reconciliation.md` §E for a case where this
  slipped through: `callRegionMethod` is a real, currently-public escape
  hatch that was never individually reviewed against this exact
  standard).
- No silent guessing was introduced — see `DESIGN_GUARDRAILS.md`'s
  "fail loudly" rule.
- Documentation is updated together, not piecemeal (`DESIGN_GUARDRAILS.md`
  "Always" list already states which files move together).

The concrete, runnable version of this list — what commands to actually
run — is `.ai/checklists/release.md` and the "Regression sweep" section
of `.ai/knowledge/verification.md`. This file is the reasoning; those are
the checklist.
