# Using apx-testkit from Cursor / VS Code / Claude Code (no test-writing)

Three layers, thinnest first. There is deliberately NO traditional VS Code
extension: it would add a second API treadmill, compete with Oracle's own
SQL Developer for VS Code (which owns APEXlang editing), and buy nothing the
MCP layer doesn't already provide in agentic editors.

## 1. CLI (any editor terminal, CI)
    npx apx-testgen ./my-app-export --out ./tests-generated

## 2. MCP server (Cursor, Claude Code, VS Code Copilot agent mode, Windsurf)
Cursor — .cursor/mcp.json in your project:
    { "mcpServers": { "apx": { "command": "npx", "args": ["-y", "@apx/mcp"] } } }
Claude Code:
    claude mcp add apx -- npx -y @apx/mcp
Then just ask the agent: "inspect my APEX export in ./export and generate
smoke tests into ./tests-generated". Two tools are exposed:
- inspect_apex_export -> JSON model of pages/items/regions/warnings
- generate_apex_tests -> deterministic spec files + summary

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
