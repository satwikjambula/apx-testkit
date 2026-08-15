# AGENTS.md — apx-testkit

Portable project context for any AI coding tool (Cursor, Codex, Antigravity,
Claude Code, or otherwise). This file has no tool-specific mechanics in
it — no subagent dispatch, no slash commands — just what this project is,
what it believes, and where to look for more. Claude Code users: this
project also defines role-scoped subagents and slash commands on top of
this — see `CLAUDE.md` and `.ai/AGENT.md`.

## What this is

apx-testkit turns Oracle APEX 26.1 APEXlang (`.apx`) exports into a typed
AST, then into deterministic Playwright tests and live-verified runtime
wrappers. ("26.1", not "26.1+" — no later release has been verified; see
`.ai/knowledge/constitution-reconciliation.md`.) Four npm workspaces:

| Package | Does |
|---|---|
| `packages/parser` (`@apx/parser`) | `.apx` text → typed semantic AST. Lossless — unmodeled constructs go into `raw` bags, never dropped. |
| `packages/testkit` (`@apx/testkit`) | Playwright fixtures + component wrappers, live-verified against real running APEX instances before anything is exposed. |
| `packages/generator` (`@apx/testgen`) | Deterministic PageObject/spec generation, AST-to-AST diffing (`apx-diff`), coverage mapping (`apx-coverage`). |
| `packages/mcp` (`@apx/mcp`) | Thin MCP server exposing the parser + generator to any MCP-capable agentic tool — this is the real cross-tool integration point; it already works with Cursor, Codex, Antigravity, and Claude Code. |

## The constitution

1. Never guess an Oracle APEX API — verify live before exposing a runtime
   wrapper.
2. Prefer a documented public API or the standard jQuery UI widget-factory
   convention over a DOM heuristic.
3. The parser is lossless — every unmodeled construct survives in `raw`.
4. The typed semantic AST is canonical for every downstream consumer —
   never read a `raw.*` key directly when a typed field exists.
5. The parser only extracts facts; it does not decide what a component
   *means* at runtime.
6. Runtime code never depends on an undocumented Oracle internal without
   live verification.
7. A region's runtime static id is resolved in layers, never guessed — it
   can differ from the `.apx` export identifier (see `ApexRegion.htmlDomId`).
8. Every new runtime API requires: live verification, a
   `docs/quirks/26.1.json` entry, regression tests, and a documentation
   update in the same change — not deferred.

Full reasoning for each, plus the specific incidents that produced them
(a wrong "confirmed" claim about Chart's runtime behavior, a
1550+-occurrence silent parser bug, an AI-summarized fetch hallucinating
grammar syntax that doesn't exist): `.ai/ADR/001` through `004`, and
`DESIGN_GUARDRAILS.md` at the repo root.

## Where to look for more

- `DESIGN_GUARDRAILS.md` — the enforceable never/always list.
- `.ai/ADR/` — the four architecture decisions above, in full, with
  context and consequences.
- `.ai/knowledge/` — what each package actually does today: `parser.md`,
  `runtime.md`, `generator.md`, `verification.md`, `oracle-apex.md`,
  `architecture.md`.
- `.ai/checklists/` — step-by-step procedures: `new-component.md`,
  `runtime-api.md`, `parser-change.md`, `new-verification-app.md`,
  `release.md`.
- `docs/quirks/26.1.json` — the runtime evidence ledger (component,
  issue, evidence, which real app it was verified against, workaround,
  confidence level).
- `docs/grammar-assumptions.md` — the parser/EBNF evidence ledger.

## The one hard rule about evidence

Fetch Oracle's official APEXlang EBNF grammar
(`docs.oracle.com/en/database/oracle/apex/26.1/apxln/apexlang.ebnf`) via a
raw HTTP fetch to a file you then read directly — never through an
AI-summarizing fetch. This has hallucinated syntax that doesn't exist in
the real grammar before (a fabricated `@{component-id}` reference form).
The same principle applies to any Oracle APEX runtime claim: verify
against a real, running instance or real parsed export data, not
documentation prose or memory alone.
