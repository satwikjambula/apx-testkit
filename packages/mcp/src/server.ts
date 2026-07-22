#!/usr/bin/env node
/**
 * apx-mcp — MCP server exposing the APEXlang parser + deterministic test
 * generator to agentic editors (Cursor, Claude Code, VS Code Copilot agent
 * mode, Windsurf, ...). The agent DISPATCHES generation; it never authors
 * assertions — determinism is the product. stdio transport.
 *
 * Editor config (Cursor: .cursor/mcp.json / Claude Code: claude mcp add):
 *   { "mcpServers": { "apx": { "command": "npx", "args": ["-y", "@apx/mcp"] } } }
 */
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { z } from 'zod';
import { generate, inspect } from '@apx/testgen/lib';

const server = new McpServer({ name: 'apx-testkit', version: '0.1.0' });

server.registerTool(
  'inspect_apex_export',
  {
    title: 'Inspect APEXlang export',
    description:
      'Parse an Oracle APEX 26.1+ APEXlang export directory (.apx files) and return a JSON model: pages with aliases/public flag, regions, pageItems, buttons, parser warnings, and component types not yet covered. Use this first to see what exists before generating tests.',
    inputSchema: { exportDir: z.string().describe('Absolute path to the unzipped APEXlang export root (contains application.apx and pages/)') },
  },
  async ({ exportDir }) => ({
    content: [{ type: 'text', text: JSON.stringify(inspect(exportDir), null, 2) }],
  }),
);

server.registerTool(
  'generate_apex_tests',
  {
    title: 'Generate Playwright smoke tests (deterministic)',
    description:
      'Generate deterministic Playwright smoke specs from an APEXlang export. Emits ONLY runtime-verified assertions (alias URL loads, clean console, normalized title, all declared pageItems present, apex.item round-trip). Same input always produces byte-identical output — review regenerated diffs alongside .apx diffs. Do NOT hand-edit generated files; regenerate instead.',
    inputSchema: {
      exportDir: z.string().describe('Absolute path to the APEXlang export root'),
      outDir: z.string().describe('Directory to write .spec.ts files into (e.g. <project>/tests-generated)'),
    },
  },
  async ({ exportDir, outDir }) => {
    const r = generate(exportDir, outDir);
    const summary = [
      `Generated ${r.generated} specs into ${r.outDir} (${r.skippedAuth} skipped: auth required).`,
      r.warnings.length ? `Parser warnings (${r.warnings.length}):\n${r.warnings.slice(0, 15).join('\n')}` : 'No parser warnings.',
      r.unmodeled.length ? `Seen but not yet asserted on: ${r.unmodeled.join(', ')}` : '',
      `Files: ${r.files.join(', ')}`,
      'Next: ensure playwright.config exports APP_BASE for the target instance, then run: npx playwright test',
    ].filter(Boolean).join('\n\n');
    return { content: [{ type: 'text', text: summary }] };
  },
);

const transport = new StdioServerTransport();
await server.connect(transport);
