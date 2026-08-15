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
| 14 | Generic runtime-method escape hatch is dangerous | **Partially wrong as stated — see finding in §E below.** The principle is right; this project has NOT fully followed it. `callRegionMethod` is real and public. |
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
| 3, 4 | `docs/*` prose is careful to say "APEX 26.1 — verified" rather than "26.1+" almost everywhere (see `.ai/knowledge/verification.md`'s per-app `mmdVersion 26.1.0+3102` checks, done by hand for every corpus addition) | No runtime manifest parsing at all. `ApexAppAst.astVersion` (`packages/parser/src/ast.ts:41`) is a hardcoded literal for *this project's own* AST shape, not derived from the export's `.apex/apexlang.json`. There is no `ApexlangManifest { version, mmdVersion, ... }` type, and no code path that reads the manifest, gates on it, or warns on an unrecognized version. Version-awareness is a manual, human discipline today, not an enforced one. See `.ai/knowledge/parser.md`'s new "Manifest and version awareness" section (added this pass) for the concrete gap. |
| 21–26 | Two specific dangerous values ARE read and acted on: `security.pageAccessProtection` (`argumentsMustHaveChecksum` case only, `packages/generator/src/lib.ts:87-92`, `packages/testkit/src/fixtures/navigation.ts`) and `appearance.pageMode` (`modalDialog` case only, `packages/generator/src/lib.ts:98-123`). Both are real, live-verified, and drive real generation/navigation decisions (`assessNavigationSafety`, `isModalDialogUnroutable`). `login()`'s success detection already follows §26 almost exactly — `page.waitForURL`, not a URL-changed-once sample (see `.ai/knowledge/runtime.md`, `auth.ts`'s own doc comment). | No typed AST field exists for any of these — both are read ad hoc as raw strings (`page.raw['security.pageAccessProtection']`), not a proper enum (`unrestricted \| argumentsMustHaveChecksum \| noArgumentsSupported \| noUrlAccess` per §23, or `normal \| modalDialog \| nonModalDialog \| unknown` per §24). Only the one dangerous value in each case is handled; the other enum members are unhandled (not explicitly `unknown`-marked either — they just fall through to the "safe" default). There is **no application-level metadata type at all** — no `ApexApplication { id, alias, name, friendlyUrls, authentication, ... }` anywhere in `ast.ts` (confirmed: `grep` for `interface ApexApp` in `ast.ts` finds only the container `ApexAppAst`, which is the *parsed-export* container, not Oracle "application" metadata). Friendly URLs are **unconditionally assumed** — `apexPageUrl()` (`packages/testkit/src/fixtures/session.ts`) always builds `<lowercased-alias>` with no `friendlyUrls: true|false|unknown` check anywhere; this is the exact anti-pattern §22 warns against, not yet fixed. `login()` defaults to `P101_USERNAME`/`P101_PASSWORD` (`packages/testkit/src/fixtures/auth.ts` `DEFAULTS`) — technically the exact thing §25 says not to do, though it fails loudly with a specific message pointing at the override options and cites its own single-app verification scope, rather than silently assuming success (see `.ai/knowledge/runtime.md`). |
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
- **§37 — Oracle APEX Blueprints as a future intent source.** Purely
  speculative; Oracle hasn't shipped anything this project has evidence
  of yet. No action item, just noted so it isn't "discovered" again as
  if new.
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
- **§60 — `npm run verify` as one canonical command.** The *steps* this
  should run already exist, spelled out by hand in
  `.ai/knowledge/verification.md`'s "Regression sweep" section (build all
  workspaces, full vitest suite, spike typecheck, reference-fixture
  determinism diff, zero-warnings sweep across the real corpus, registry
  validation, support-matrix drift check). Turning that into one script
  is a reasonable idea but needs real design, not a mechanical wrapper:
  does it need `APX_EXPORT_DIR` set to run the full sweep, or does it
  degrade gracefully without a real export available (most CI
  environments won't have one — see `.ai/knowledge/verification.md`'s
  "never committed" corpus policy)? What's the exit-code contract for a
  partial environment? This needs a Runtime & Test Automation Engineer
  + Release Engineer pass, not an inline implementation as a side effect
  of a documentation restructuring task.

## E. Corrected factual claims found during this pass

**§14's `callRegionMethod` claim is accurate, not hypothetical — this is
a real, current, live gap, not a strawman.** The constitution's example
(`callRegionMethod(region, method, args)`) matches this project's real
`callRegionMethod<T>(page: Page, id: string, method: string, args: unknown[])`
(`packages/testkit/src/components/region.ts:121-136`) almost exactly. It
is:
- **Real** — implemented, not a hypothetical the constitution invented.
- **Used internally**, appropriately, as the shared dispatch primitive
  behind `ApexRegion.invoke()`, `ApexCardsRegion`, and
  `ApexFacetsRegion` (all three route through it rather than duplicating
  `page.evaluate()` calls) — this internal use is fine and matches
  ADR-002's own pattern.
- **Also exported as a fully public API** — `packages/testkit/src/index.ts:46`
  re-exports it directly alongside `ApexRegion`. Any consumer can
  `import { callRegionMethod } from '@apx/testkit'` and call
  `apex.region(id).anyUndocumentedMethodName()` with zero verification
  gate, exactly the "undocumentedMethod()/internalMethod()/
  unverifiedMethod()" risk §14 describes.

This is **distinct** from `callRegionMethodAndWaitForEvent`
(`packages/testkit/src/fixtures/lifecycle.ts`), which the constitution
does not describe and which is not the same function — that one pairs a
method call with waiting for a *specific, named, confirmed-real* jQuery
event (`apexafterrefresh`/`apexbeforerefresh`) and is scoped, verified
tooling, not a generic escape hatch. Do not conflate the two when acting
on this finding.

**This is flagged, not fixed, in this pass** (documentation/governance
task, not a code change) — but it's real enough to route to the Software
Architect and Runtime & Test Automation Engineer explicitly: either (a)
remove `callRegionMethod` from `index.ts`'s public exports and keep it
`internal` to `packages/testkit/src/components/*.ts` only, which is a
breaking change for any external consumer currently using it directly,
or (b) keep it public with an explicit doc-comment warning and a
`docs/quirks/26.1.json`-style acknowledgment that it's a deliberate,
named exception to ADR-002 (an escape hatch for cases the wrapper
library hasn't caught up to yet) rather than an oversight. Either is a
legitimate answer; leaving it unexamined is not.

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
| P0.1 Correct quoted scalar parsing | implied outstanding | **Done, long-standing.** Real bug history (`parseArray()` first-element drop, 1550+ occurrences) already found and fixed; see ADR-004. |
| P0.2 Separate component identifier from page number | implied outstanding | **Done.** `ApexPage.id`/`alias` distinct since this project's earliest AST design (§A above). |
| P0.3 Stop exposing arbitrary `callRegionMethod` | implied outstanding | **Confirmed still outstanding — real, not hypothetical.** See §E. |
| P0.4 Correct staticId vs. DOM ID terminology | implied outstanding | **Done.** ADR-003, `ApexRegion.htmlDomId`. |
| P0.5 Consume/verify APEXlang manifest/version | implied outstanding | **Still outstanding, confirmed.** See §B. |
| P0.6 Remove misleading "APEX 26.1+" claims | implied outstanding | **Behavior was already correct; wording wasn't.** Per-app version confirmation (`mmdVersion 26.1.0+3102` checked by hand before any corpus addition, `.ai/knowledge/verification.md`) already follows the strict "verified, not assumed" discipline — this was a copy-consistency gap, not a behavioral one. A full repo grep found "26.1+" wording in six governance/reference files, not just the two most visible ones: `CLAUDE.md`, `AGENTS.md`, `DESIGN_GUARDRAILS.md`, `.ai/ADR/002-no-undocumented-oracle-apis.md`, `.ai/ADR/004-verification-precedes-implementation.md`, `.ai/knowledge/verification.md`, `.ai/knowledge/runtime.md`. **Fixed in this pass** in all of those. Deliberately **not** swept in `README.md`, `docs/validation-post.md`, `docs/tutorial.md` — those are user-facing/marketing copy, Documentation & DX Engineer's domain, and changing scope-commitment language there is a documentation decision (does the project want to formally commit to 26.1-only, or leave room to say "not yet verified on later releases" without ruling them out?) rather than a mechanical terminology fix. Flagged for that agent, not silently changed here. |
| P1.7 Model Friendly URLs | implied outstanding | **Still outstanding, confirmed.** See §B — unconditionally assumed, not modeled. |
| P1.8 Model page access protection | implied outstanding | **Partial, confirmed.** One dangerous enum value handled; no typed field. See §B. |
| P1.9 Model page mode | implied outstanding | **Partial, confirmed.** Same shape as above. |
| P1.10 Improve authentication modeling | implied outstanding | **Still outstanding**, but the one implemented piece (login success detection) is actually *ahead* of the constitution's own ask — see §B. |
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
| P2.21 Prepare for Oracle Blueprint intent metadata | implied outstanding | **Confirmed genuinely unstarted, correctly speculative.** See §D. |
| P2.22 Improve Oracle Skills integration | implied outstanding | **Confirmed genuinely unstarted**, positioning-only today. See §D. |

Separately, three real pieces of work not named in the constitution's
own P0-P2 list at all have shipped or are sitting in open, unmerged PRs
against `main` as of this pass: checksum-protected-page navigation
skipping (`assessNavigationSafety`), `modalDialog` unroutable-page
skipping, and the `test/golden/` correctness gate are merged into this
branch's history; MCP tool expansion (`apx-flow`/`apx-diff`/
`apx-coverage`/`apx-docs` as MCP tools, PR #18) and login
success-detection hardening (PR #17) are complete but still open,
unmerged PRs, not yet on `main`. None of this needed rediscovery — it's
recorded here so this reconciliation pass doesn't itself become another
source of a stale "still pending" claim.
