# Using apx-testkit from Cursor / VS Code / Claude Code (no test-writing)

Three layers, thinnest first. There is deliberately NO traditional VS Code
extension: it would add a second API treadmill, compete with Oracle's own
SQL Developer for VS Code (which owns APEXlang editing), and buy nothing the
MCP layer doesn't already provide in agentic editors.

## 1. CLI (any editor terminal, CI)
    npx apx-testgen ./my-app-export --out ./tests-generated

Add `--watch` to regenerate automatically whenever a `.apx` file under the
export directory changes (e.g. after "Export to APEXlang" from VS Code/App
Builder) — run it in an integrated terminal / VS Code task and leave it
running:

    npx apx-testgen ./my-app-export --out ./tests-generated --watch

This is deliberately a CLI flag, not a VS Code extension feature — see the
"NO traditional VS Code extension" decision above. Verified live: editing a
tracked `.apx` file (debounced 250ms to absorb multi-file export bursts)
triggers a real regeneration with the updated content, using Node's
`fs.watch(..., { recursive: true })`.

## 2. MCP server (Cursor, Claude Code, VS Code Copilot agent mode, Windsurf)
Cursor — .cursor/mcp.json in your project:
    { "mcpServers": { "apx": { "command": "npx", "args": ["-y", "@apx/mcp"] } } }
Claude Code:
    claude mcp add apx -- npx -y @apx/mcp
Then just ask the agent: "inspect my APEX export in ./export and generate
smoke tests into ./tests-generated". Six tools are exposed, every one a
thin wrapper around the same deterministic `@apx/testgen` library function
its CLI counterpart calls — no LLM calls anywhere in the MCP server itself:
- inspect_apex_export -> JSON model of pages/items/regions/warnings
- generate_apex_tests -> deterministic spec files + summary
- generate_flow_map (apx-flow) -> navigation graph JSON (nodes = pages,
  edges = branch/region-action/report-column-link/button targets, each
  with a mechanism, confidence tier, and evidence citation)
- diff_apex_exports (apx-diff) -> structural regression report between two
  export directories (`format: "json"` for the full `DiffReport`,
  `format: "human"` for prose sentences)
- analyze_coverage (apx-coverage) -> cross-references a recorded touch log
  against an export's declared items/regions/buttons; `includeHtml: true`
  also returns a self-contained heatmap/checklist HTML view
- generate_apex_docs (apx-docs) -> one Markdown file per page plus an
  index.md, written to disk

The agent dispatches; generation stays deterministic. The agent must never
author assertions itself — that is the product boundary.

## 3. Agent rules file (drop into AGENTS.md / .cursor/rules)
    When the user asks for tests for an Oracle APEX application and an
    APEXlang export (.apx files) is present or obtainable, do not write
    Playwright tests by hand. Call the apx MCP tools: inspect_apex_export
    first, then generate_apex_tests. Generated files are DO-NOT-EDIT;
    regenerate after .apx changes and review both diffs together. Hand-write
    only what the generator declares TODO (regions/buttons pending DOM
    contract; auth-required pages pending login fixture).
