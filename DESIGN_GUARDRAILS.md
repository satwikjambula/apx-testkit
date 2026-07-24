# Design Guardrails

Architectural standards, not coding standards. Read this before touching
any code in this repository — human or AI. The full reasoning behind each
line lives in `.ai/ADR/`; this file is the enforceable summary.

## Never

- **Depend on an Oracle API — documented or internal — without live
  verification** against a real, running APEX 26.1+ instance. A method
  existing in Oracle's docs or minified source is not evidence it works
  the way you expect. See ADR-002.
- **Lose information while parsing.** Every construct the typed AST
  doesn't model yet goes into a `raw` bag — never silently dropped. See
  ADR-001.
- **Trust an AI-summarized fetch of the official APEXlang EBNF.** Always
  `curl` the raw `.ebnf` file directly. A summarized fetch once
  hallucinated a `@{component-id}` syntax that does not exist anywhere in
  the real grammar. See ADR-004.
- **Assume a region's `.apx` identifier is its runtime static id.** Check
  `ApexRegion.htmlDomId` first — it deterministically predicts the
  runtime id when set. See ADR-003.
- **Type a field out of `raw` into the semantic AST without wiring it
  into `apx-diff`'s field-by-field diffing in the same change.** This gap
  has already happened twice (`calendarSettings`, then
  `chartSettings`/`htmlDomId`) — don't make it a third time.
- **Retry a method name Oracle has already confirmed invalid** ("no such
  method" errors — e.g. `getProperty`/`getOption` on `ojChart`,
  `model`/`view`/`getRegion` on `interactiveGrid`) without new evidence
  changing the picture.
- **Claim something is "confirmed" or "verified" from documentation prose
  or memory alone.** See ADR-004 — it requires live evidence or a real
  data + EBNF cross-check, not one or the other, not neither.
- **Check the EBNF narrowly** — grep for the property names you already
  assume matter. Check the full relevant production(s) for whatever
  component is being touched. A narrow check once missed a real bug
  (`region.source.sql` reading the wrong raw key) that a full-production
  check caught.
- **Generate code from DOM heuristics when verified metadata or a
  documented API already exists.** Guessed selectors are exactly what
  `packages/testkit`'s "treadmill rule" exists to prevent (see
  `.ai/knowledge/runtime.md`).

## Always

- **Preserve raw metadata for every unmodeled construct** — the typed AST
  is additive, never destructive.
- **Cross-check the full relevant EBNF production(s)** for any parser
  change, fetched via `curl` from
  `docs.oracle.com/en/database/oracle/apex/26.1/apxln/apexlang.ebnf` —
  every time, not as a spot-check limited to what's freshest in context.
- **Record verification provenance** in `docs/quirks/26.1.json` (runtime)
  or `docs/grammar-assumptions.md` (parser) — component, issue, evidence,
  `reproducedAgainst`, workaround, status, `rootCauseDiagnosed`.
- **Update documentation together, not piecemeal**, whenever a
  component's status changes: `docs/ecosystem-roadmap.md`,
  `docs/component-coverage-matrix.md`, `README.md`'s capability matrix,
  and `docs/tutorial.md`. Missing one of these has been a repeated real
  gap in this project's own history.
- **Add regression tests for every new typed field or runtime capability**
  before considering the work done — parser fields get `vitest` unit
  tests; runtime capabilities get a live `spike/tests/*.spec.ts` spec
  gated on `APX_LOGIN_TEST_USERNAME`/`APX_LOGIN_TEST_PASSWORD`.
- **Correct a wrong prior claim in place, visibly**, the moment new
  evidence contradicts it — annotate it as corrected with the new
  evidence, never silently delete or quietly rewrite it.
- **Run the full verification pass before calling anything done**: build
  all workspaces, run the full test suite, typecheck `spike/`, confirm
  byte-identical regeneration against `examples/employee-page`, and
  confirm zero parser warnings across every real `.apx` export available.

## Where the rest of this lives

- `.ai/AGENT.md` — entry point for any AI session working in this repo.
- `.ai/ADR/` — the four decisions this file summarizes, with full context.
- `.ai/knowledge/` — what each package actually does today.
- `.ai/checklists/` — step-by-step procedures for common changes.
- `.claude/agents/` — eight role-scoped subagents, organized by decision
  authority (Product Architect, Software Architect, Oracle APEX
  Architect, Compiler/Parser Engineer, Runtime & Test Automation
  Engineer, QA/Verification Engineer, Documentation & DX Engineer,
  Release Engineer), each reading a subset of the above relevant to
  their domain.
