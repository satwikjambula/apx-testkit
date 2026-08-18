# Design Guardrails

Architectural standards, not coding standards. Read this before touching
any code in this repository — human or AI. The full reasoning behind each
line lives in `.ai/ADR/`; this file is the enforceable summary.

## Never

- **Depend on an Oracle API — documented or internal — without live
  verification** against a real, running APEX 26.1 instance. A method
  existing in Oracle's docs or minified source is not evidence it works
  the way you expect. See ADR-002.
- **Lose information while parsing.** Every construct the typed AST
  doesn't model yet goes into a `raw` bag — never silently dropped. See
  ADR-001.
- **Trust an AI-summarized fetch of the official APEXlang EBNF.** Always
  `curl` the raw `.ebnf` file directly. A summarized fetch once
  hallucinated a `@{component-id}` syntax that does not exist anywhere in
  the real grammar. See ADR-004.
- **Assume a region's APEXlang identifier is its runtime region id.** Check
  `ApexRegion.htmlDomId` first — it deterministically predicts the
  runtime region id when set. The `_jet`/`_ig` suffix belongs to nested
  widget containers, not to `apex.region()` identity. See ADR-003.
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
- **Persistently reference a Flow Map edge by its generated `id`.**
  `edgeId()` (`packages/generator/src/flow.ts`) is traversal/ordinal-based
  — an index into a page's `branches`/`actions`/`columns`/`buttons` array
  — not a stable identifier. Reordering any construct on a page silently
  shifts other edges' ids even when nothing relevant to a given reference
  changed. Anything needing to persistently reference a flow-map edge
  must instead reference stable semantic AST identity (page `id`/`alias`
  plus `buttonIdentifier`/`regionIdentifier`, etc.), never the edge's own
  generated `id`. Surfaced by the Functional Scenario Authoring RFC
  review (`docs/ecosystem-roadmap.md`, Sixteenth round), but the rule is
  general.
- **Store evidence or references in any artifact as display text** — a
  button's visible label, a region's title. Always use semantic
  identifiers the generator can deterministically resolve (e.g.
  `pageId: 20, buttonIdentifier: APPROVE`, never `button: "Approve"`).
  This is the same "semantic identifiers over presentation strings"
  principle this project already lives by everywhere else — the typed
  AST, never scraped DOM text — applied to any future artifact's
  evidence fields too.
- **Guess, default, or silently fall through when evidence is
  insufficient** — an ambiguous component identity, an unrecognized
  APEXlang/manifest version, an unresolved authentication scheme, an
  unverified runtime capability, an invalid scenario approval hash. Fail
  loudly and specifically instead. This is the explicit, general form of
  what ADR-002/003/004 already require in their own specific domains
  (runtime APIs, region resolution, evidence sourcing) — a deterministic
  wrong answer produced by guessing is still wrong, and worse than a
  clear failure because it looks like success. See
  `.ai/knowledge/constitution-reconciliation.md` §C.
- **Use `page.waitForTimeout()` as a synchronization strategy without a
  documented reason no real readiness signal exists.** Prefer a verified
  lifecycle event (`refreshRegionAndWait`/`fetchFacetCountsAndWait`/
  `waitForRegionEvent`, `packages/testkit/src/fixtures/lifecycle.ts`),
  network completion, or an explicit DOM/state assertion. The one
  existing exception — the `page.waitForTimeout(1000)` in generated
  "clean console" specs (`packages/generator/src/lib.ts`) — stays,
  because it's collecting evidence of *late, unpredictable* async
  console errors with no single "nothing more will happen" event to wait
  on instead, and that reasoning is written down at the call site. Any
  new timeout needs the same kind of documented justification, not a
  silent copy-paste.
- **Give a generated or hand-written test a name that claims more than
  it asserts.** A test named "button exists" that only checks a label
  string, or "every item exists in DOM" that only calls `apex.item(id)`,
  is a false claim about coverage. Name it for exactly what it verifies.

## Always

- **Order locator strategies by evidence, not convenience** — a verified
  static/DOM id or a value ADR-003's layered resolution actually
  confirms first, a verified accessible role/name next (see `button.ts`'s
  deliberate accessible-role-first approach), a raw guessed selector
  never. Every locator this project produces should be able to answer
  "why this selector, not another" with a citation, not "it seemed
  right."
- **Tag mixed fact/interpretation content as FACT, INFERENCE, or
  ASSUMPTION** when an artifact or agent output combines something
  directly readable from the AST/a live instance with something derived
  or guessed from it. This project already does this in two places —
  `packages/generator/src/flow.ts`'s `FLOW_MECHANISM_EVIDENCE` confidence
  tiers, and `docs/verification/26.1.json`'s `status`/`confidence`
  fields — apply the same discipline to whatever's built next rather
  than presenting an inference with the same confidence as a fact.
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
- **Machine-enforce human approval on any artifact with non-deterministic
  input** — never rely on a documented convention alone. A required
  `approval` block carrying a content hash (`contentHash: sha256:...`) of
  the canonical byte form of everything the hash covers. The consuming
  generator must: read the artifact → check approved status → recompute
  the hash and check it matches → generate only on success, hard failure
  (not a warning) on a missing approval block or a hash mismatch.
- **Assign ids on any approved/frozen artifact once, at approval time,
  and freeze them** — never re-derive or regenerate an id from the AST or
  other live state, which has no stable identity across regenerations.
  Treat the assigned id plus the artifact's file path as the durable
  identity, the same way a `.apx` export's own identity is assigned
  externally, not derived in-band.

## Persistent artifacts and provenance

Two broader principles the four rules above are instances of — apply
these to any future artifact this project builds, not just the ones that
prompted them:

- **Persistent artifacts must reference stable semantic identifiers,
  never traversal-order identifiers, generated DOM labels, or
  presentation text.**
- **Any artifact that influences deterministic generation must have an
  explicit, machine-verifiable provenance or approval state.**

## Where the rest of this lives

- `.ai/AGENT.md` — entry point for any AI session working in this repo.
- `.ai/ADR/` — the four decisions this file summarizes, with full context.
- `.ai/knowledge/` — what each package actually does today.
- `.ai/knowledge/testing.md` — test layering, fixture strategy, generated-
  test/scenario philosophy, and "definition of done" across the whole
  project (not scoped to one package the way the other `knowledge/` files
  are).
- `.ai/knowledge/constitution-reconciliation.md` — the section-by-section
  audit that produced the newest rules in this file (and, separately, a
  set of explicitly-NOT-adopted scope proposals that still need their own
  product/architecture review — don't treat everything in that source
  document as settled just because it's referenced here).
- `.ai/checklists/` — step-by-step procedures for common changes.
- `.claude/agents/` — eight role-scoped subagents, organized by decision
  authority (Product Architect, Software Architect, Oracle APEX
  Architect, Compiler/Parser Engineer, Runtime & Test Automation
  Engineer, QA/Verification Engineer, Documentation & DX Engineer,
  Release Engineer), each reading a subset of the above relevant to
  their domain.
