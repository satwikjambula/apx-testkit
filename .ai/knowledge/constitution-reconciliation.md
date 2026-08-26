# Constitution reconciliation (2026-08-15)

The maintainer delivered a 65-section project constitution ("Controlled
Intent-Based Programming" framing aside — that document is unrelated to
this project; the actual text reconciled here is apx-testkit's own
65-section operating philosophy). This file is the section-by-section
audit: what's already true in this codebase and just needs citing, what's
half-built, what's genuinely new and safe to adopt as a guardrail now, and
what's a new scope proposal that needs its own product/architecture
decision before anyone treats it as settled.

**Methodology**: every claim below was checked against real files in this
repo (`packages/*/src`, `.ai/ADR/`, `docs/`), not inferred from the
constitution's own text. Where the constitution's example code doesn't
match this project's real API, the real API is what's cited.

This is a governance record, in the same spirit as
`docs/ecosystem-roadmap.md`'s dated rounds and
`.ai/proposals/functional-scenario-authoring.md` — a durable answer to
"was this considered, and what happened," not a file meant to be read
top-to-bottom by someone just trying to make a change (see `CLAUDE.md`,
`DESIGN_GUARDRAILS.md`, `.ai/AGENT.md` for that).

## A. Already fully real — just needed citing, nothing to build

| §§ | Claim | Where it already lives |
|---|---|---|
| 1, 42 | Deterministic test loop, LLM never authors assertions | `CLAUDE.md` Invariant 4; `packages/mcp/src/server.ts`'s own doc comment ("the agent DISPATCHES generation; it never authors assertions — determinism is the product") |
| 2, 17 | Oracle is source of truth; evidence preference order (live > real export > EBNF > docs prose/memory) | ADR-002, ADR-004 |
| 5 | Lossless-per-consumed-source parser, not "globally lossless" | ADR-001; `ComponentNode`/`raw` bags in `packages/parser/src/ast.ts` |
| 7, 10 | Component identifier ≠ page number; stable semantic identity already exists | `ApexPage { id: number; alias: string | null }` (`packages/parser/src/ast.ts:49-51`) — `id` is the numeric page number, `alias` the developer-facing identifier, never conflated. `ApexRegion.identifier`/`ApexItem.identifier`/`ApexButton.identifier` are separate stable fields, same file. |
| 8, 9 | staticId/DOM-id/runtime-id terminology; region ID is not guessed | ADR-003 in full; `.ai/knowledge/oracle-apex.md` "Region identity" section; `ApexRegion.htmlDomId` doc comment |
| 11, 12 | Button identity + coverage must use semantic identity, never label text | `DESIGN_GUARDRAILS.md`'s existing "Store evidence or references... as display text" bullet (already states the exact `pageId: 20, buttonIdentifier: APPROVE` example the constitution gives); shipped concretely in `ButtonCoverageIdentity` (`packages/testkit/src/fixtures/coverage.ts`) and commit `0753b7b` ("explicit button ambiguity handling + semantic coverage identity") |
| 13 | Flow Map edge IDs are not durable identifiers | `DESIGN_GUARDRAILS.md`'s existing "Persistently reference a Flow Map edge by its generated `id`" bullet — near word-for-word match already in place |
| 14 | Generic runtime-method escape hatch is dangerous | **Resolved — see §E below.** The raw dispatcher is package-internal; public APIs expose named, evidence-backed operations only. |
| 15 | `ApexRegion` stays generic; component-specific methods on subclasses only | `.ai/knowledge/runtime.md` "Components" section — `ApexCardsRegion`/`ApexFacetsRegion`/`ApexInteractiveGridRegion`/`ApexChartRegion` all extend `ApexRegion`, none of IG/Chart's widget-factory methods leak onto the base class |
| 16 | Evidence-level taxonomy (VERIFIED/DOCUMENTED/OBSERVED/UNVERIFIED/UNSUPPORTED) | `docs/verification/26.1.json`'s `status` field, exact same five-way split, already documented in `docs/verification/README.md` "The evidence-level taxonomy" |
| 27 | Locator strategy should be evidence-ordered | `button.ts`'s accessible-role/label-first approach (documented as deliberate, not a guess, in `.ai/knowledge/runtime.md`); ADR-003's layered region-resolution order. Not previously stated as one general rule — see §C. |
| 28 | No arbitrary `waitForTimeout` | Already followed with exactly one documented, deliberate exception: `packages/testkit/src/fixtures/lifecycle.ts`'s own doc comment explains precisely why the one `page.waitForTimeout(1000)` in generated "clean console" specs (`packages/generator/src/lib.ts:306`) stays — "no single 'nothing more will ever happen' event to wait for instead." This is the constitution's own fallback case ("if there is no universal readiness event: collect evidence continuously, assert at the end") already implemented, not a violation. |
| 31 | Role-aware testing must be evidence-driven, never inferred from names | No role/authorization modeling exists yet at all (see §B) — the *principle* is consistent with this project's whole ethos and needs no new adoption; there's simply nothing built yet to check it against. |
| 32–37 | Functional scenario testing needs an approval boundary; FACT/INFERENCE/ASSUMPTION; frozen scenario IDs; Flow Map ≠ business intent | **Already reviewed in more depth than this constitution's text.** `.ai/proposals/functional-scenario-authoring.md` (full RFC, Deferred) plus `docs/ecosystem-roadmap.md`'s Sixteenth-round review already cover all of this, generalized into four standing `DESIGN_GUARDRAILS.md` rules (stable-identity references, semantic identifiers over display text, machine-enforced approval hash, immutable ids assigned once). Nothing in §§32-37 changes that verdict — see §D on ADR-005. |
| 39, 40 | No `@apx/model` package; package boundaries follow real consumers | `CLAUDE.md` "Architecture: the AST is the canonical semantic model" section — same reasoning, already written, cites the exact "three real consumers, zero duplication" test the constitution describes |
| 41 | Determinism (byte-identical output) | `CLAUDE.md` Invariant 1; `.ai/knowledge/architecture.md` "Determinism as a product property"; `.ai/knowledge/generator.md`'s golden-fixture correctness gate (`test/golden/`, added after the constitution's own self-consistency-is-not-correctness point) |
| 48, 49 | Real fixtures for semantic/runtime correctness, synthetic for parser edge cases | `.ai/knowledge/verification.md` — 46-app real corpus, explicit synthetic-vs-real split already documented |
| 50, 51 | Specialized agent roles; sequential review pipeline | **Exceeded, not just matched** — see §C for the explicit mapping. |
| 55 | Fail explicitly, never silently guess | The organizing principle behind ADR-002/003/004 collectively; not previously stated as its own citable line — see §C. |
| 63, 64 | Product positioning: deterministic verification layer, not "AI writes your tests" | `README.md`'s existing framing; `.ai/AGENT.md`'s "Not currently a standing agent" section explicitly rejecting an "Analysis Engineer" role for the same reason |

## B. Partially real — the gap, specifically

| §§ | What's built | What's missing |
|---|---|---|
| 3, 4 | Manifest/version awareness is now enforced by `loadApexlangExport()`: `.apex/apexlang.json` is parsed into `ApexlangManifest`, unsupported versions fail by default, and warn-mode diagnostics survive into `parseApp()`. | Later APEX releases remain unsupported until separately verified; this is an explicit gate, not an inferred compatibility claim. |
| 21–26 | `ApexApplication.runtime`, `ApexPage.pageMode`, `pageAccessProtection`, `authentication`, and `isPublic` are typed first-class metadata. All four protection values are classified explicitly, missing/unknown protection fails closed, `noUrlAccess` does not recommend link navigation, Friendly URLs disabled cause generation/URL construction to fail, and modal dialogs reject direct navigation. | Custom authentication-form discovery remains configurable rather than inferred; `login()` retains its documented default-field convention and fails loudly when it does not apply. |
| 30 | Some shared-component-adjacent data already flows through `raw`/`unmodeled` (never dropped, per ADR-001) | No typed `sharedComponents` structure exists (auth schemes, LOVs, lists, plugins as first-class fields). LOV handling is narrow and deliberate — `ApexItem.lovName` only, full LOV *definition* resolution explicitly out of scope (`.ai/knowledge/verification.md`, "Seventh round" note) |
| 6 | Fenced/multiline values, references, unquoted scalars, quoted-string keys (a real bug found and fixed against `strategic-planner`) are all real, tested capabilities — see `.ai/knowledge/parser.md`/`.ai/knowledge/verification.md`'s `oracle/apex` corpus notes | Not independently re-verified in this pass beyond citing existing evidence; no new gap found, listed here only because §6 makes several specific claims not individually re-checked line-by-line this session. |

## C. Newly adopted as standing guardrails (added to `DESIGN_GUARDRAILS.md` this pass)

These are genuine refinements this project already lives by in practice but had never stated as one citable rule — safe to formalize because they describe existing behavior, not new scope:

- **§55 (fail explicitly, never guess)** — stated as its own top-level line; it was previously only the implicit synthesis of ADR-002/003/004 read together.
- **§27 (locator strategy evidence order)** — generalized from `button.ts`'s and ADR-003's specific instances into a standing rule for any future locator-producing code.
- **§28 (no arbitrary `waitForTimeout`, with the one documented exception staying documented)** — codifies what `lifecycle.ts`'s doc comment already argues, as an enforceable-by-review rule rather than a comment only one file carries.
- **§29 (test names must match their assertions)** — new as a stated rule; not previously violated as far as this pass found (`page-object.ts`'s generated test names are already assertion-accurate), but worth stating so it isn't lost as the generator grows.
- **§33/§43 (FACT/INFERENCE/ASSUMPTION tagging for any future evidence-mixing artifact)** — generalizes a pattern this project already uses twice (`flow.ts`'s `FLOW_MECHANISM_EVIDENCE` confidence tiers; the verification registry's `status`/`confidence` fields) into a standing rule for whatever's built next.

See `DESIGN_GUARDRAILS.md` for the actual enforceable bullets.

### §50/§51 — role mapping (not a new adoption, a correction)

The constitution's five generic roles (Product Architect, Software
Architect, Oracle APEX Engineer, Test Automation Engineer, Software
Engineer) and its six-step sequential review are **already exceeded**,
not just matched, by this project's real eight-agent roster
(`.ai/AGENT.md`): "Software Engineer" is split into Compiler/Parser
Engineer and Runtime & Test Automation Engineer (the two packages have
genuinely different risk profiles — lossless parsing vs. live-verified
runtime dispatch); QA/Verification Engineer exists as a *separate* veto
from Test Automation Engineer specifically because "is this flaky" and
"has this actually been verified against a real instance" are different
questions; Documentation & DX Engineer and Release Engineer exist as
explicit final gates the constitution's five-role version doesn't name.
`.ai/AGENT.md`'s own "How a feature typically flows" pipeline and
`.ai/prompts/multi-agent-review.md`'s parallel-review mode already cover
§51's sequential-review requirement, including the "any single objection
blocks it" property §51 implies but doesn't state as explicitly.
`.ai/AGENT.md` gets a short pointer to this section rather than a
duplicate `.ai/agents.md` file — see the parent task report for why no
new file was created.

## D. Flagged as separate proposals — NOT adopted as settled

These require their own product/architecture review before any code
changes. Nothing below has been built, scheduled, or approved by this
pass — flagging them here is explicitly not the same as adopting them.

- **§18, §46 — SQLcl as an external validation oracle** (`apx validate`
  invoking Oracle SQLcl, mutation testing against SQLcl's own validator).
  Real potential value (an actual Oracle-side oracle instead of this
  project's own EBNF/live-instance evidence), but a genuinely new
  capability: a new external dependency (SQLcl availability in CI/dev
  environments), a new package or CLI surface, and a new evidence
  category this project's ADR-004 doesn't currently name. Needs a
  Product Architect pass ("is there real user pain this solves that
  live-verification + EBNF cross-checking doesn't already cover?") and a
  Software Architect pass (does this become a fifth workspace, or a
  flag on an existing CLI?) before anyone builds toward it.
- **§19, §20 — Oracle Skills / SQLcl MCP ecosystem integration.** The
  *positioning* ("APX TestKit complements Oracle Skills, doesn't
  duplicate them") is already this project's stance (`README.md`,
  `.ai/AGENT.md`'s Analysis-Engineer rejection uses the identical logic).
  But no actual integration work — detecting Oracle Skills, coordinating
  with a SQLcl MCP server, any cross-tool handshake — exists or is
  scheduled. Positioning ≠ integration; don't conflate the two.
- **§37 — Oracle APEX Blueprints as an intent source.** **CORRECTED
  (2026-08-22): no longer speculative — Oracle shipped this in APEX 26.1.**
  The prior "purely speculative" framing was wrong even at the time this
  file was written (2026-08-15) — Oracle's own spec-driven-development doc
  (docs.oracle.com, `creating-an-app-using-spec-driven-development.html`,
  published 2026-07-28) describes a real, importable Markdown blueprint
  format, generated from a functional specification + database schema
  metadata + a real published system prompt
  (`github.com/oracle/apex/tree/26.1/blueprints`, confirmed live: `README.md`,
  `QUICKSTART.md`, `examples/`, `prompt/`). This was missed in the original
  reconciliation pass, not a claim Oracle changed since. Still an open
  product/architecture question whether or how apx-testkit should consume
  blueprint-stage intent — see the newly flagged `apx-onboard` orchestrator
  proposal (routed to Product Architect, 2026-08-22) for the concrete
  version of that question now on the table.
- **§38 — APEX 26.1 AI Agent/Tool verification surface.** Confirmed by
  direct search: **zero** references to AI agents/tools anywhere in
  `packages/parser/src/ast.ts` or `docs/ecosystem-roadmap.md` (the only
  hits for "AI agent" in the whole repo are about *this project's own*
  agents driving a browser, unrelated). This is a genuinely unstarted
  capability, not a partially-built one. Needs Oracle APEX Architect
  verification (does Oracle even expose enough at the APEXlang/export
  level to model this statically?) before Compiler/Parser Engineer work
  starts, per the standard pipeline in `.ai/AGENT.md`.
- **§44 — "Oracle Evidence Registry" as a directory tree
  (`oracle/{apis/,components/,runtime/,grammar/,versions/}`).** This
  project already built the equivalent capability, in a different and
  arguably better shape: `docs/verification/26.1.json` (a single
  structured JSON file with a documented schema) plus
  `docs/verification/README.md`. Don't build a parallel directory-tree
  registry — if the registry's shape genuinely needs to change (e.g.
  splitting by category), that's a redesign of the existing registry,
  not a new system alongside it. Flagged so nobody reads §44 literally
  and starts a `oracle/apis/` directory next to the JSON file that
  already does this job.
- **§60 — `npm run verify` as one canonical command — IMPLEMENTED.** It
  runs build, workspace and `spike/` typechecks, all workspace tests, lint,
  registry validation, support-matrix drift detection, and packed-package
  contract checks.
  Live-instance/corpus checks remain separately gated because those inputs
  are intentionally not committed or universally available in CI.
- **`apx-onboard` orchestrator + `onboard_generated_apex_app` MCP tool
  (proposed 2026-08-22, not §-numbered — post-dates the original 65-section
  constitution).** A new CLI command chaining manifest validation → parse/
  inspect → optional SQLcl `apex validate` → diff → flow map → docs →
  Playwright generation → one onboarding report, positioned as the
  deterministic acceptance gate after Oracle's AI-assisted app generation
  (APEX Assistant / spec-driven-development blueprints, per the now-real
  §37 finding above) rather than a second LLM inside apx-testkit. Real
  verified technical grounding (all cited Oracle/SQLcl behavior confirmed
  against raw docs this pass — see this proposal's own PR/commit for the
  fetch evidence), and the stated boundaries (no APEXlang writer, no
  blueprint-to-test generation, no AI-response-text comparison in runtime
  tests, credentials stay external) are consistent with this project's
  existing philosophy, not a departure from it. Still: this is a NEW CLI
  surface, a NEW MCP tool, and — via the optional SQLcl step — the exact
  external-dependency question §18/§46 above already flagged as needing
  its own review before being built, not silently adopted. Routed to
  Product Architect (is this worth building now vs. a documented "not yet"
  like the SQLcl item above) and, if it proceeds, Software Architect (does
  a single new command really need no new workspace, or does chaining six
  existing subsystems' outputs into one report cross that line) — same
  review pattern this project has applied to every prior proposal of this
  shape (Functional Scenario Authoring, SQLcl validation). Not built in
  this pass.

## E. Corrected factual claims found during this pass

**§14's arbitrary region-method escape hatch is now closed.** The raw
dispatcher remains package-internal and is no longer exported from
`@apx/testkit`. Public classes expose named, evidence-backed methods only:
`ApexRegion` contains the cross-region `refresh()` contract,
`ApexDataRegion` contains the shared record/session surface, and
`ApexInteractiveReportRegion` adds IR-only `getViewName()`. Lifecycle
dispatch is likewise limited to named `refreshRegionAndWait()` and
`fetchFacetCountsAndWait()` operations; consumers cannot supply an
arbitrary method string.

**`CLAUDE.md`'s own "Outstanding debts" list had drifted stale relative
to this repo's own recent commits** — item 1 (region/button DOM
convention) had been kept up to date through "UPDATE 2," but nothing in
that file reflected checksum-navigation skip handling, `modalDialog`
unroutable-page handling, button-ambiguity semantic coverage identity,
or the golden-fixture correctness gate — all of which are real, shipped,
and already documented in `.ai/knowledge/generator.md`/`.ai/knowledge/runtime.md`
but not cross-referenced from the root file most sessions actually read
first. Corrected in this pass — see `CLAUDE.md`'s updated "Recently
resolved" note.

## §62 — corrected P0/P1/P2 status (as of this pass, `feature/verification-registry` branch, not yet on `main`)

| Item | Constitution's status | Actual status |
|---|---|---|
| P0.1 Correct quoted scalar parsing | implied outstanding | **Done.** JSON-style escaped strings, token-aware quoted arrays, escaped quoted identifiers/keys, and comments have regression coverage; see ADR-004 and parser tests. |
| P0.2 Separate component identifier from page number | implied outstanding | **Done.** `ApexPage.id`/`alias` distinct since this project's earliest AST design (§A above). |
| P0.3 Stop exposing arbitrary `callRegionMethod` | implied outstanding | **Done.** Package-internal dispatcher only; named public APIs. See §E. |
| P0.4 Correct staticId vs. DOM ID terminology | implied outstanding | **Done.** ADR-003, `ApexRegion.htmlDomId`. |
| P0.5 Consume/verify APEXlang manifest/version | implied outstanding | **Done.** Full parser-owned loader, typed manifest, 26.1 gate, propagated warnings. |
| P0.6 Remove misleading "APEX 26.1+" claims | implied outstanding | **Behavior was already correct; wording wasn't.** Per-app version confirmation (`mmdVersion 26.1.0+3102` checked by hand before any corpus addition, `.ai/knowledge/verification.md`) already follows the strict "verified, not assumed" discipline — this was a copy-consistency gap, not a behavioral one. A full repo grep found "26.1+" wording in six governance/reference files, not just the two most visible ones: `CLAUDE.md`, `AGENTS.md`, `DESIGN_GUARDRAILS.md`, `.ai/ADR/002-no-undocumented-oracle-apis.md`, `.ai/ADR/004-verification-precedes-implementation.md`, `.ai/knowledge/verification.md`, `.ai/knowledge/runtime.md`. **Fixed in this pass** in all of those. Deliberately **not** swept in `README.md`, `docs/validation-post.md`, `docs/tutorial.md` — those are user-facing/marketing copy, Documentation & DX Engineer's domain, and changing scope-commitment language there is a documentation decision (does the project want to formally commit to 26.1-only, or leave room to say "not yet verified on later releases" without ruling them out?) rather than a mechanical terminology fix. Flagged for that agent, not silently changed here. |
| P1.7 Model Friendly URLs | implied outstanding | **Done.** Typed application runtime metadata; false/missing values fail explicitly. |
| P1.8 Model page access protection | implied outstanding | **Done.** Typed four-value field; missing/unknown values fail closed. |
| P1.9 Model page mode | implied outstanding | **Done.** Typed field; modal direct navigation rejected. |
| P1.10 Improve authentication modeling | implied outstanding | **Partially done.** Page authentication is typed and consumed; custom login-form discovery remains configurable and evidence-gated. |
| P1.11 Fix button label-based coverage identity | implied outstanding | **Done** (commit `0753b7b`). See §A. |
| P1.12 Separate generic region APIs from component-specific | implied outstanding | **Done, and was already the design from the start** — `.ai/knowledge/runtime.md`. |
| P1.13 Introduce Oracle SQLcl validation | implied outstanding | **Not started — correctly flagged as needing its own proposal**, see §D. |
| P1.14 Oracle grammar evidence/versioning | implied outstanding | **Substantially done in spirit**, differently shaped — `docs/verification/26.1.json` plus per-EBNF-production citations in `ast.ts` doc comments cover most of what §44/§45 ask for; see §D's note on not duplicating it. |
| P1.15 Improve shared-component modeling | implied outstanding | **Still outstanding, confirmed.** See §B. |
| P2.16 Remove arbitrary `waitForTimeout` | implied outstanding | **Effectively done** — one documented, justified exception remains; see §A. |
| P2.17 Page-object class collision detection | not otherwise discussed | Not verified this pass either way — out of scope of the sections this constitution's list otherwise maps to; no new finding. |
| P2.18 Parser mutation tests | implied outstanding | Not verified this pass — `Sawalhah/apexlang-view` cross-checking (`.ai/knowledge/verification.md`) is a related but different practice (comparative, not mutation-based). No new finding either way. |
| P2.19 Locator evidence metadata | implied outstanding | **Substantially done** — `docs/verification/26.1.json`'s `runtimeStrategy`/`evidenceSource`/`confidence` fields cover most of this; §C's new general rule (evidence-ordered locators) formalizes the rest. |
| P2.20 AI Agent/tool verification | implied outstanding | **Confirmed genuinely unstarted.** See §D. |
| P2.21 Prepare for Oracle Blueprint intent metadata | implied outstanding | **Genuinely unstarted, but NOT speculative** — corrected 2026-08-22, Oracle shipped Blueprints in 26.1. See §D's `apx-onboard` entry. |
| P2.22 Improve Oracle Skills integration | implied outstanding | **Confirmed genuinely unstarted**, positioning-only today. See §D. |

Separately, three real pieces of work not named in the constitution's
own P0-P2 list at all: checksum-protected-page navigation skipping
(`assessNavigationSafety`), `modalDialog` unroutable-page skipping, and
the `test/golden/` correctness gate. Along with MCP tool expansion
(`apx-flow`/`apx-diff`/`apx-coverage`/`apx-docs` as MCP tools, PR #18),
login success-detection hardening (PR #17), this reconciliation itself
(PR #19), and the doc-drift/CI-dashboard/checkbox-verification PRs
(#14/#15/#16) — all six merged to `main` same-day as this pass. None of
this needed rediscovery — it's recorded here so this reconciliation pass
doesn't itself become another source of a stale "still pending" claim.
