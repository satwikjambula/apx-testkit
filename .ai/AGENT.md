# apx-testkit — AI agent entry point (Claude Code)

Read `../AGENTS.md` first — the portable constitution, package summary,
and evidence discipline, shared with every other AI coding tool this
project supports (Cursor, Codex, Antigravity, etc.). This file adds the
Claude-Code-specific layer on top of that: six role-scoped subagents,
slash-command shortcuts, and dispatch mechanics that have no equivalent
in `AGENTS.md` because they don't port to other tools. Then read
whichever `.ai/knowledge/*.md` files match the work at hand.

## The team

Six role-scoped subagents, defined in `../.claude/agents/`. Path
ownership below is a **convention this project self-polices** — Claude
Code does not sandbox file writes per subagent, so compliance depends on
discipline (consistent with this project's principles-over-automation
culture), not tooling.

| Agent | Owns | Decides |
|---|---|---|
| **Software Architect** | Monorepo structure, package boundaries, ADRs, cross-package API stability | Should this be a new package? Is this a breaking change? Does this violate architecture? |
| **Oracle APEX Architect** | Declarative APEX behavior — pages/regions/items/dynamic actions/UX patterns, what's a real public API vs. an internal | How does this component actually behave? What is the real, documented public surface? |
| **Compiler/Parser Engineer** | `packages/parser` | Is the AST stable and lossless? Can this be generalized? |
| **Runtime & Test Automation Engineer** | `packages/testkit`, `packages/generator`, `packages/mcp` | Is this dispatch path confirmed live? Is generation deterministic? Will this be flaky? |
| **QA/Verification Engineer** | `docs/quirks/26.1.json`, `docs/grammar-assumptions.md`, the real Oracle sample-app corpus, the regression sweep | Has this actually been verified? Against which app? What's the confidence level? Empowered to say **no**. |
| **Documentation & DX Engineer** | `docs/*`, `README.md` capability matrix, `CLAUDE.md`, tutorials, error message wording | Can a user understand this? Is every doc file that describes this component's status in sync? |

## Invoking these agents

Three ways, from most to least automatic. None of them is "it just
always happens" — pick the one that matches how deliberate you want to
be about it.

### 1. Slash-command shortcut (recommended default)

Six commands in `.claude/commands/`, one per agent — the fastest, most
repeatable habit:

| Command | Invokes |
|---|---|
| `/architect <question>` | `software-architect` |
| `/apex <question>` | `oracle-apex-architect` |
| `/parser <task>` | `compiler-parser-engineer` |
| `/runtime <task>` | `runtime-test-automation-engineer` |
| `/qa <claim or change>` | `qa-verification-engineer` |
| `/docs <update>` | `documentation-dx-engineer` |

Each command expands into an explicit instruction telling the current
session to delegate to that subagent via the Task/Agent tool — it's a
deterministic dispatch, not a suggestion Claude might follow.

### 2. Dedicate a whole terminal session to one role

```bash
claude --agent software-architect
claude --agent oracle-apex-architect
claude --agent compiler-parser-engineer
claude --agent runtime-test-automation-engineer
claude --agent qa-verification-engineer
claude --agent documentation-dx-engineer
```

Use this when you know a whole work session is going to stay in one
domain — e.g. a pure parser-bugfix afternoon. Add `--chrome` (or this
project's browser tooling equivalent) for agents that need live
verification (`oracle-apex-architect`, `runtime-test-automation-engineer`,
`qa-verification-engineer`).

### 3. Ask by name mid-session

Within an ordinary session, naming the agent explicitly ("use the
qa-verification-engineer subagent to check this") makes delegation
reliable. Relying on the agent's `description` field alone (every
subagent's description starts with "Use PROACTIVELY...") makes Claude
*more likely* to self-delegate for a matching task without being asked —
but that's a heuristic match, not a guarantee. If a task clearly belongs
to one domain and you want it handled by that specific agent, say so —
don't assume it'll route itself.

### Quick reference: which agent owns which path

| Touching... | Invoke |
|---|---|
| `packages/parser/**` | `/parser` |
| `packages/testkit/**`, `packages/generator/**`, `packages/mcp/**` | `/runtime` |
| `docs/quirks/26.1.json`, `docs/grammar-assumptions.md`, real sample-app verification | `/qa` |
| `docs/ecosystem-roadmap.md`, `docs/component-coverage-matrix.md`, `docs/support-matrix.md`, `README.md` capability matrix, `docs/tutorial.md` | `/docs` |
| Package boundaries, `.ai/ADR/`, `package.json`/`tsconfig.base.json`, "is this a new package/breaking change" | `/architect` |
| "How does this component actually behave" / "is there a real public API" | `/apex` |

## How a feature typically flows

```
Feature request
      |
      v
Software Architect  --  "does this fit the architecture, is it a new package?"
      |
      v
Oracle APEX Architect  --  "is there a real public API for this?"
      |
      v
QA/Verification Engineer  --  "verify it live / against real export data; say no if it can't be verified"
      |
      v
Compiler/Parser Engineer  --  typed AST field, if applicable
      |
      v
Runtime & Test Automation Engineer  --  wrapper + generator support, if verified live
      |
      v
Documentation & DX Engineer  --  roadmap, coverage matrix, README, tutorial, quirks -- together, not piecemeal
```

Not every feature needs every stage — a parser-only field (no live app
available) stops after Compiler/Parser Engineer and ships as a typed
field + an explicit `UnsupportedComponentError` stub, per ADR-002. See
`.ai/prompts/feature-design.md` for the design-stage template.

## Checklists

- `.ai/checklists/new-component.md` — a genuinely new region/component
  type, start to finish.
- `.ai/checklists/runtime-api.md` — extending an existing wrapper.
- `.ai/checklists/parser-change.md` — any parser change, including
  bug fixes and reviews of existing fields.
- `.ai/checklists/new-verification-app.md` — adding a new real Oracle
  sample app to the verification corpus.
- `.ai/checklists/release.md` — the full verification pass before any
  commit or release.

## Review templates

- `.ai/prompts/parser-review.md`
- `.ai/prompts/runtime-review.md`
- `.ai/prompts/feature-design.md`

## Rejecting work

QA/Verification Engineer (and any agent, really) should reject work that
violates the constitution, in this shape:

```
Rejected.

Violates ADR-002 (no undocumented Oracle APIs).
No verified public API -- [component]'s methods have not been called
against a real running instance. See .ai/checklists/runtime-api.md
before proposing this again.
```

State which ADR/guardrail is violated and what evidence would resolve it
— a rejection should tell the requester exactly what to go verify, not
just "no."
