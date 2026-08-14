# Proposal: Functional Scenario Authoring (Functional QA Agent)

**Status: Deferred.** Not built, not scheduled. This file is the
preserved design — read `docs/ecosystem-roadmap.md`'s Sixteenth round
(2026-08-14) for the full review that produced this disposition
(Product Architect's product verdict, Software Architect's architecture
verdict, and the "Final disposition" closeout). This file exists so the
design has one durable home instead of being reconstructed from roadmap
prose if it's ever revisited — the roadmap entry links here rather than
duplicating this content.

**Reason:** Insufficient evidence of user demand.
**Architecture:** Viable with corrections (see "Corrected architecture"
below — all corrections required, not optional, before implementation).
**Revisit trigger:** A real external user identifies functional scenario
authoring as a material testing bottleneck, ideally after Flow Map has
seen real-world adoption.

---

## 1. What this proposes

apx-testkit turns a typed AST into deterministic Playwright tests that
verify pages still render/validate correctly — explicitly *not*
business-logic test authorship (README: "This doesn't replace test
authorship for business logic — it replaces 'does the page still
render/validate correctly' as a repetitive hand-written chore"). This
RFC proposed a new, clearly-separate authoring aid that sits adjacent to
that pipeline: an LLM-backed agent that drafts human-reviewable
*functional test scenarios* — scenario descriptions a QA lead or business
analyst would otherwise hand-write — grounded in the typed AST and Flow
Map, for a human to review, correct, and approve before anything becomes
a versioned artifact.

The core architectural boundary, which both reviews found sound in
concept: the LLM never sits in the CI/test-execution path. It drafts.
A human approves. Only the approved, frozen form ever becomes a
versioned, diffable artifact that a deterministic generator can consume.
This mirrors the treadmill rule (generated code never contains
hand-authored logic) and `packages/mcp/src/server.ts`'s own principle —
"the agent DISPATCHES generation; it never authors assertions —
determinism is the product" — applied one layer up, to scenario
authorship instead of test generation.

## 2. Agent mandate

A new role, tentatively "Functional QA Agent" (not the existing
QA/Verification Engineer, whose mandate is verifying this project's own
claims against real Oracle instances — a different job). Scope, if ever
built:

- Reads the typed AST and `flow-map.json` (or regenerates Flow Map
  fresh) for a target application.
- Drafts scenario descriptions in the scenario-spec format below,
  classifying every claim as FACT, INFERENCE, or ASSUMPTION (§4).
- Never writes to a tracked path. Draft output is ephemeral CLI/local
  output only — never committed to git (Product Architect Q4: two runs
  can legitimately produce different-but-both-valid output for the same
  evidence, which is exactly the argument against committing drafts;
  this project's identity is diffable, reproducible artifacts).
- Is never a build/test/CI dependency. No `npm test`/`npm run build`
  step may import or invoke it — the same way live-Oracle verification
  is structurally kept outside CI (`.ai/knowledge/architecture.md`:
  "There is no CI running against a live Oracle instance").
- Stops at drafting. It does not approve its own output, does not write
  the approval block (§5), and does not touch the generator.

## 3. Scope: seven proposed categories, v1 cut down to two

The original RFC proposed seven scenario categories: Business Modules,
User Journeys, Functional, CRUD, Negative, Authorization, Navigation,
and Smoke. Both reviews found this over-scoped relative to what the AST
and Flow Map can actually ground today:

- **Navigation and Smoke** are genuinely FACT-gradeable off Flow Map +
  the typed AST today — page-to-page navigation, branches, region
  actions, report/IR/IG column targets, button targets are all real,
  resolvable data.
- **CRUD, Negative, Business Module grouping, Authorization** are not.
  There is no dependency graph, no CRUD-detection pass (explicitly
  deferred, Ninth round), and "Business Module" is a semantic/product
  concept the AST has never carried. For these, the FACT/INFERENCE/
  ASSUMPTION split would land mostly in ASSUMPTION — a tell that the
  evidence bar isn't met yet for that part of the scope, even though it
  is for the navigation slice.

**If this is ever built, v1 scope is Navigation and Smoke categories
only, sourced from Flow Map + the existing typed AST, role-neutral
unless a real `authorization_scheme` backs a role.** Drop the other four
categories until a dependency graph and/or CRUD-detection foundation
exists — building them now means generating mostly-ASSUMPTION content
dressed in a scheme that implies more rigor than the underlying data
supports.

## 4. FACT / INFERENCE / ASSUMPTION discipline

Every claim in a drafted scenario must be tagged with its evidence tier,
reusing this project's own evidence-tiering discipline (ADR-004: a claim
is FACT only with real citations) and the pattern `flow.ts`'s own
`FlowEdgeMechanism`/`FLOW_MECHANISM_EVIDENCE` already established:

- **FACT** — directly readable from the typed AST or Flow Map, with a
  literal, resolvable citation (not prose). E.g. "button `APPROVE` on
  page 20 navigates to page 25" backed by a real Flow Map edge.
- **INFERENCE** — a reasonable derivation from FACT-tier data that isn't
  itself directly stated (e.g. "this button appears to submit an
  approval workflow" inferred from button identifier + target page
  region composition).
- **ASSUMPTION** — anything the agent cannot ground in AST/Flow Map data
  at all; must be visibly labeled as such, never presented with the
  same confidence as FACT.

Every FACT/INFERENCE/ASSUMPTION-classified field in the schema (§5)
carries a literal, AST-resolvable `evidence` array — not prose.

## 5. Scenario spec format — corrected architecture

This section incorporates all corrections from Software Architect's
review (`docs/ecosystem-roadmap.md`, Sixteenth round, "Software Architect
confirmation"), organized around the four generalized standing rules now
in `DESIGN_GUARDRAILS.md` plus the remaining implementation-specific
points. None of these are optional refinements — per that review, this
should not proceed past the design stage without all of them.

### 5a. Where it lives — no new package

Not inside `packages/*` — there is no consuming module yet, and putting
a type there ahead of a real consumer is the same "org-chart-before-the-
org" antipattern `.ai/AGENT.md` already named for the original Analysis
Engineer rejection. Home, if built: `docs/`, alongside this project's
other cross-package convention artifacts that already live outside
`packages/*` (`docs/quirks/26.1.json`, `docs/grammar-assumptions.md`,
`docs/component-coverage-matrix.md`) — e.g. `docs/scenario-spec.md` for
the schema and versioning rules, with example fixtures under
`examples/`. This matches the Fifth/Thirteenth-round precedent: extract
to a package only once there are three or more real consumers, not from
zero.

### 5b. Versioned, deterministic schema

A top-level `scenarioSpecVersion` field (same pattern `flow-map.json`'s
own `flowMapVersion` already established). Additive-only evolution
within a major version, reusing ADR-001's rule for the typed AST
verbatim: new optional fields fine, no field renamed or removed without
a version bump.

### 5c. Semantic identifiers, never display text (DESIGN_GUARDRAILS)

The RFC's original example schema used human-readable display strings
as evidence (`button: "Approve"`), not resolvable identifiers. A
deterministic generator turning a display label into a Playwright
locator without a canonical identifier means either guessing via
name-matching (exactly what DESIGN_GUARDRAILS forbids: "Generate code
from DOM heuristics when verified metadata or a documented API already
exists") or silently reopening non-determinism at the exact seam meant
to keep it out. **Required correction, the single most load-bearing one
in the whole design:** an approved scenario spec must carry resolved AST
identifiers (page `id`/alias, button/region `identifier`) alongside any
human-readable evidence, never display strings alone. This is the
general "semantic identifiers over presentation strings" rule now in
`DESIGN_GUARDRAILS.md`, applied to this artifact specifically.

### 5d. Reference Flow Map by stable AST identity, never by edge id (DESIGN_GUARDRAILS)

`flow.ts`'s `edgeId()` (`packages/generator/src/flow.ts`) is
ordinal-based — an index into a page's `branches`/`actions`/`columns`/
`buttons` array — so reordering any construct on a page shifts other
edges' ids even when nothing relevant to a given scenario changed. An
approved scenario citing that opaque id would go stale silently on an
unrelated edit. Required: cite the same stable, typed AST fields
`flow.ts` itself reads (page `id`/`alias`, button/region `identifier`),
never the edge's own generated `id`. `flow-map.json` remains a
convenient read for authoring, never the identity source.

### 5e. Machine-enforced approval, not a documented convention (DESIGN_GUARDRAILS)

A file-location convention (drafts never written to a tracked path) is a
necessary first layer but not sufficient by itself — this project's own
history (the `calendarSettings`/`UNTRACKABLE_REGION_TYPES` drift
documented in ADR-001 and `.ai/knowledge/generator.md`) is direct
evidence that a "should stay in sync" rule without an enforced check
drifts here specifically, not hypothetically. Required: a required
`approval` block in the schema (`approvedBy`, `approvedAt`, `specHash` —
a hash of the canonical byte form of everything above the approval
block). Enforcement flow, exact and non-negotiable: the generator
entrypoint reads the artifact → checks approved status → recomputes
`specHash` and checks it matches → generates only on success, hard
failure (not a warning) if the hash doesn't match or the approval block
is absent — the same "throw a specific, named error rather than
silently constructing something wrong" discipline ADR-003 already
applies to unresolvable region ids.

### 5f. Immutable ids, assigned once (DESIGN_GUARDRAILS)

Assign scenario ids once at authoring/approval time and freeze them
inside the file (`id: PR-001` is the right instinct) — never derive or
regenerate from AST/flow-map state, since nothing in this project's
current AST or `flow-map.json` output is a stable, human-legible
identity source across regenerations (`flow.ts`'s own edge ids are
ordinal-based, per §5d). Treat `id` + file path as the durable identity,
the same way a `.apx` export's own identity is assigned externally, not
derived in-band.

### 5g. Byte-identical guarantee downstream of an approved scenario

Treat the approved file exactly as an additional generator input
alongside the typed AST, under the identical contract
`.ai/knowledge/generator.md` already states for everything else: same
inputs, byte-identical output, verified by regenerating twice and
diffing. Concretely: parse YAML into a canonical in-memory form (not
dependent on file whitespace/comment placement); never let generation
read anything but resolved-identifier fields; keep
`packages/mcp/src/server.ts`'s existing "do not hand-edit generated
files, regenerate instead" rule; extend the release checklist's
reference-fixture regeneration check to cover one approved-scenario
fixture, matching how `flow.ts`/`docs.ts` were folded into that same
check when they shipped.

### 5h. Existence check on generation is not deferrable

Full proactive staleness-flagging (an `apx-diff`-style check surfacing
which approved scenarios a given AST change affects) is a legitimate
"not yet" for v1 — it fails this project's own forcing-consumer test the
same way Product Architect's evidence bar applies project-wide. **But
one thing is not deferrable:** the generator must hard-fail, not
silently skip, if a cited identifier no longer resolves against the
current AST. This is a cheap existence check, not a semantic-staleness
detector — without it, a renamed page could make a stale-but-"approved"
scenario silently generate an empty or wrong-target test while remaining
technically byte-identical and deterministic, defeating the safety
premise the entire design rests on. This one check belongs in v1 if
there ever is one.

## 6. Package boundary and ADR question — answered now, for the record

**No new package.** Confirmed by both the original RFC and Software
Architect's review, matching the Fifth/Thirteenth-round precedent
exactly (extract to a package only once there are three or more real
consumers). Phase-1 scope here is functionally smaller than `flow.ts`
was at the Thirteenth round, and that precedent applies with even less
force when zero consumers exist yet.

**A new ADR — ADR-005 — would be warranted the moment this is actually
built, not today.** This is categorically different from ADR-001 through
004, none of which govern admitting non-deterministic, externally-
authored content into an otherwise fully deterministic pipeline. It
deserves the same permanent, citable status ADR-004 gives "verification
precedes implementation," rather than living only in this file and a
roadmap paragraph. Logged now so it isn't rediscovered as a gap later.

## 7. What would unpark this

Restated from the roadmap closeout, verbatim in spirit: a real user —
QA lead, business analyst, or test engineer, using apx-testkit against a
live app — reporting that hand-writing functional scenarios from the
typed AST/Flow Map is a specific, named bottleneck, not a hypothetical
persona. Secondary supporting evidence: Flow Map itself getting real
usage from at least one project for real navigation documentation,
establishing the underlying data is trusted before any non-deterministic
authoring layer is built on top of it.

If/when that happens: v1 is Navigation + Smoke only (§3), schema and
approval mechanism exactly as corrected in §5, no new package until
three real consumers exist, and ADR-005 written at that point, not
before.
