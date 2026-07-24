# Architecture

apx-testkit is four npm workspaces, each with a single job:

```
packages/parser/     .apx export text  ->  typed AST (@apx/parser)
packages/testkit/    typed AST + live app  ->  Playwright fixtures/components (@apx/testkit)
packages/generator/  typed AST  ->  deterministic PageObject/spec code, coverage, diff (@apx/testgen)
packages/mcp/        thin MCP server exposing @apx/testgen to agentic editors (@apx/mcp)
```

## Data flow

```
Oracle APEX export (.apx files)
        |
        v
@apx/parser  --  parseApp()
        |
        |-- ComponentNode tree (generic, everything in `raw`)
        v
        `-- ApexAppAst (typed: pages/regions/items/buttons/dynamicActions)
             |                                    <- ADR-001: this is canonical
             |
   +---------+----------------------+
   |                                |
   v                                v
@apx/testgen                   @apx/testkit
- page-object.ts: emits         - ApexRegion + subclasses (Cards,
  PageObject + smoke .spec.ts     FacetedSearch, InteractiveGrid,
  files, deterministic            Chart) -- live-verified wrappers
- diff.ts: AST-to-AST diff        around apex.region()/widget-factory
  between two export versions   - item.ts / button.ts / messages.ts
- coverage.ts: cross-references - fixtures/: auth, lifecycle waits,
  a recorded touch log            console-guard, session, coverage
  against the AST                 recorder
        |
        v
@apx/mcp -- registers generate_apex_tests / inspect_apex_export
            as MCP tools for Cursor/Claude Code/Copilot/Windsurf
```

## The "treadmill rule"

Generated code (from `@apx/testgen`) and hand-written specs (in `spike/`)
both import their component logic from `@apx/testkit` — neither should
contain a raw selector or duplicate logic locally. When APEX's DOM or
client API changes, the fix happens once, in `packages/testkit`, and both
consumers pick it up. A hand-written spec that reaches for
`page.locator('#some-id')` instead of an `@apx/testkit` component is a
sign either the component is missing something, or the spec is cutting a
corner that will drift.

## Determinism as a product property

`@apx/testgen`'s output is not "good enough test scaffolding" — it is
specified to be **byte-identical** for the same input, every time. This
is what makes `apx-diff` (AST-to-AST) meaningful as a regression signal,
and what the release checklist's reference-fixture regeneration check
verifies before anything ships (see `.ai/checklists/release.md`).

## Where verification lives

There is no CI running against a live Oracle instance. Live verification
happens by hand, when a real running app becomes available, and gets
recorded permanently in `docs/quirks/26.1.json` (see
`.ai/knowledge/verification.md`) so it never has to be re-discovered.
Parser verification runs continuously against 13+ real, locally-kept
Oracle sample-app exports (not committed to the repo — see
`.ai/knowledge/verification.md` for why) plus the official APEXlang EBNF
grammar.
