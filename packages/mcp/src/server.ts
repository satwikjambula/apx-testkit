#!/usr/bin/env node
/**
 * apx-mcp — MCP server exposing the APEXlang parser + deterministic test
 * generator to agentic editors (Cursor, Claude Code, VS Code Copilot agent
 * mode, Windsurf, ...). The agent DISPATCHES generation; it never authors
 * assertions — determinism is the product. stdio transport.
 *
 * Seven tools total, every one a thin wrapper around an already-deterministic
 * `@apx/testgen` library function (the same function its own CLI calls) --
 * no LLM calls anywhere in this file, matching this project's "zero LLM
 * calls" runtime identity (DESIGN_GUARDRAILS.md). This file does not
 * reimplement or reinterpret any analysis; it only shapes already-computed
 * JSON/text into an MCP tool result:
 *   - inspect_apex_export     -- @apx/testgen/lib inspect()
 *   - generate_apex_tests     -- @apx/testgen/lib generate()
 *   - generate_flow_map       -- @apx/testgen/flow computeFlowMap()
 *   - diff_apex_exports       -- @apx/testgen/diff computeDiff()/formatDiffHuman()
 *   - analyze_coverage        -- @apx/testgen/coverage computeCoverage(),
 *                                 optionally @apx/testgen/coverage-html renderCoverageHtml()
 *   - generate_apex_docs      -- @apx/testgen/docs generateDocs()
 *   - onboard_generated_apex_app -- @apx/testgen/onboard runOnboarding() --
 *                                 the ONE shared onboarding orchestration
 *                                 function the `apx-onboard` CLI also calls
 *                                 (never a second, parallel implementation).
 *                                 The only tool here with any subprocess
 *                                 involvement at all (opt-in SQLcl `apex
 *                                 validate`, off by default) -- still zero
 *                                 LLM calls, per the invariant above.
 *
 * Editor config (Cursor: .cursor/mcp.json / Claude Code: claude mcp add):
 *   { "mcpServers": { "apx": { "command": "npx", "args": ["-y", "@apx/mcp"] } } }
 */
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { existsSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { z } from 'zod';
import { generate, inspect } from '@apx/testgen/lib';
import { computeFlowMap } from '@apx/testgen/flow';
import { computeDiff, formatDiffHuman } from '@apx/testgen/diff';
import { computeCoverage } from '@apx/testgen/coverage';
import { renderCoverageHtml } from '@apx/testgen/coverage-html';
import { generateDocs } from '@apx/testgen/docs';
import { runOnboarding } from '@apx/testgen/onboard';

/**
 * Shared precondition, mirroring exactly what every CLI in this project
 * already checks before doing any real work (`flow-cli.ts`/`diff-cli.ts`/
 * `coverage-cli.ts`/`docs-cli.ts`) -- an explicit, readable error instead of
 * a raw filesystem stack trace surfacing from deep inside `@apx/parser`'s
 * `loadApexlangExport()`. Returns a human-readable problem description, or `null`
 * when the directory looks like a real unzipped APEXlang export root.
 */
function checkExportDir(dir: string): string | null {
  if (!existsSync(dir)) return `Export directory not found: ${dir}`;
  if (!statSync(dir).isDirectory()) return `Not a directory: ${dir}`;
  if (!existsSync(join(dir, 'pages'))) {
    return `No pages/ subdirectory in ${dir} — is this an unzipped APEXlang export root?`;
  }
  return null;
}

/** Every tool handler funnels its real work through this so a thrown error
 * (malformed .apx content, an unexpected fs failure, etc.) always comes
 * back as a clearly-labeled MCP tool error instead of crashing the server
 * or silently swallowing the failure. */
async function safeText(
  fn: () => string | Promise<string>,
): Promise<{ content: { type: 'text'; text: string }[]; isError?: boolean }> {
  try {
    const text = await fn();
    return { content: [{ type: 'text', text }] };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return { content: [{ type: 'text', text: `Error: ${message}` }], isError: true };
  }
}

/**
 * Builds the fully-configured `McpServer` (all six tools registered)
 * WITHOUT connecting it to any transport -- factored out of the stdio
 * bootstrap below specifically so tests can connect it to an in-memory
 * transport pair (`InMemoryTransport.createLinkedPair()`,
 * `@modelcontextprotocol/sdk`'s own supported pattern for talking to a
 * server via a real `Client` without a real stdio process) instead of
 * exercising a raw stdio subprocess.
 */
export function createServer(): McpServer {
  const server = new McpServer({ name: 'apx-testkit', version: '0.1.0' });

  server.registerTool(
    'inspect_apex_export',
    {
      title: 'Inspect APEXlang export',
      description:
        'Parse an Oracle APEX 26.1 APEXlang export directory (.apx files) and return a JSON model: pages with aliases/public flag, regions, pageItems, buttons, parser warnings, and component types not yet covered. Use this first to see what exists before generating tests.',
      inputSchema: {
        exportDir: z.string().describe('Absolute path to the unzipped APEXlang export root; all .apx sources plus .apex/apexlang.json and deployment metadata are loaded'),
      },
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

  server.registerTool(
    'generate_flow_map',
    {
      title: 'Generate navigation Flow Map (deterministic)',
      description:
        'Build a deterministic navigation graph (apx-flow) directly from an APEXlang export\'s typed AST -- nodes are pages, edges come from exactly four sources: page branches, Cards/List region actions, report/IR/IG column links, and buttons. Each edge carries a fine-grained mechanism, confidence tier, literal evidence citation, and (when present) items/clearCache/condition passed through verbatim. Also reports pages with no incoming edge from these 4 sources (NOT a claim those pages are unreachable -- breadcrumbs, navigation lists, and Dynamic Action redirects are out of scope). No live app or browser needed; same export always produces a byte-identical FlowMap. Use this to understand how pages in an export link to each other before writing scenario-level tests.',
      inputSchema: {
        exportDir: z.string().describe('Absolute path to the unzipped APEXlang export root (contains pages/; application.apx is read when present)'),
      },
    },
    async ({ exportDir }) => {
      const problem = checkExportDir(exportDir);
      if (problem) return { content: [{ type: 'text', text: problem }], isError: true };
      return safeText(() => JSON.stringify(computeFlowMap(exportDir), null, 2));
    },
  );

  server.registerTool(
    'diff_apex_exports',
    {
      title: 'Diff two APEXlang exports (deterministic regression report)',
      description:
        'Pure AST-to-AST structural comparison (apx-diff) between two APEXlang export directories -- no live app or browser involved. Reports pages added/removed/changed, with per-page field-level diffs of items, regions (incl. nested columns/actions), buttons, dynamic actions, branches, validations, processes, and computations; anything not yet individually typed falls back to an honest "other metadata changed" note rather than silently missing it. Each added/removed/changed page also lists the generated .page.ts/.spec.ts filenames a regeneration would touch. Use this before regenerating tests against a new export to see exactly what changed and which generated files need re-review.',
      inputSchema: {
        oldExportDir: z.string().describe('Absolute path to the OLD/baseline APEXlang export root'),
        newExportDir: z.string().describe('Absolute path to the NEW APEXlang export root to compare against the baseline'),
        format: z
          .enum(['json', 'human'])
          .optional()
          .describe('"json" (default): the full structured DiffReport as JSON. "human": prose sentences, one per changed/added/removed page.'),
      },
    },
    async ({ oldExportDir, newExportDir, format }) => {
      const oldProblem = checkExportDir(oldExportDir);
      if (oldProblem) return { content: [{ type: 'text', text: `Old export: ${oldProblem}` }], isError: true };
      const newProblem = checkExportDir(newExportDir);
      if (newProblem) return { content: [{ type: 'text', text: `New export: ${newProblem}` }], isError: true };
      return safeText(() => {
        const report = computeDiff(oldExportDir, newExportDir);
        return format === 'human' ? formatDiffHuman(report) : JSON.stringify(report, null, 2);
      });
    },
  );

  server.registerTool(
    'analyze_coverage',
    {
      title: 'Analyze test coverage against a touch log (deterministic)',
      description:
        'Cross-references a recorded touch log (written by @apx/testkit\'s opt-in coverage recorder when APX_COVERAGE_LOG is set during a Playwright run) against an APEXlang export\'s declared items/regions/buttons (apx-coverage). Reports touched vs. untouched per page and overall, as a percentage of the export\'s OWN declared inventory -- not code-line coverage. Regions whose type has no @apx/testkit component at all (tree, calendar, map) are reported separately as "untrackable" rather than counted as untouched. Buttons are matched by (pageId, identifier), never by label alone, so two different buttons sharing a label are never conflated. Set includeHtml to also get a self-contained heatmap/checklist HTML view of the same report.',
      inputSchema: {
        exportDir: z.string().describe('Absolute path to the unzipped APEXlang export root (contains pages/; application.apx is read when present)'),
        touchLogPath: z.string().describe('Absolute path to the touch log file (the path pointed to by APX_COVERAGE_LOG when the suite ran). A missing file is treated as zero touches, not an error.'),
        includeHtml: z.boolean().optional().describe('When true, also return a second content block with the self-contained HTML heatmap/checklist view of the same report.'),
      },
    },
    async ({ exportDir, touchLogPath, includeHtml }) => {
      const problem = checkExportDir(exportDir);
      if (problem) return { content: [{ type: 'text', text: problem }], isError: true };
      try {
        const report = computeCoverage(exportDir, touchLogPath);
        const content: { type: 'text'; text: string }[] = [{ type: 'text', text: JSON.stringify(report, null, 2) }];
        if (includeHtml) content.push({ type: 'text', text: renderCoverageHtml(report) });
        if (!existsSync(touchLogPath)) {
          content.push({
            type: 'text',
            text: `Warning: touch log ${touchLogPath} does not exist -- every item/region/button above shows as untouched. Did you set APX_COVERAGE_LOG before running the suite?`,
          });
        }
        return { content };
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        return { content: [{ type: 'text', text: `Error: ${message}` }], isError: true };
      }
    },
  );

  server.registerTool(
    'generate_apex_docs',
    {
      title: 'Generate Markdown documentation from an APEXlang export (deterministic)',
      description:
        'Generate deterministic Markdown documentation (apx-docs) directly from an APEXlang export\'s typed AST -- one file per page (items, buttons, regions incl. nested columns/actions/calendar/chart settings, dynamic actions, branches, validations, processes, computations) plus an index.md summary. Pure read of already-typed data, no live app or browser needed; same export always produces byte-identical Markdown. Component types seen in the export but not yet modeled by the typed AST are listed explicitly in index.md rather than silently omitted. Use this to produce human-readable reference docs for an export, or to review what the parser actually captured for a page.',
      inputSchema: {
        exportDir: z.string().describe('Absolute path to the unzipped APEXlang export root (contains pages/; application.apx is read when present)'),
        outDir: z.string().describe('Directory to write the generated .md files into (created if it does not exist)'),
      },
    },
    async ({ exportDir, outDir }) => {
      const problem = checkExportDir(exportDir);
      if (problem) return { content: [{ type: 'text', text: problem }], isError: true };
      return safeText(() => {
        const r = generateDocs(exportDir, outDir);
        return [
          `Documented ${r.generated} page(s) into ${r.outDir} (${r.files.length} file(s) written, including ${r.indexFile}).`,
          r.warnings.length ? `Parser warnings (${r.warnings.length}):\n${r.warnings.slice(0, 15).join('\n')}` : 'No parser warnings.',
          `Files: ${r.files.join(', ')}`,
        ]
          .filter(Boolean)
          .join('\n\n');
      });
    },
  );

  server.registerTool(
    'onboard_generated_apex_app',
    {
      title: 'Onboard a newly generated/exported APEX app (deterministic orchestration)',
      description:
        'Runs the SAME deterministic onboarding orchestration as the apx-onboard CLI (runOnboarding(), @apx/testgen/onboard) -- ' +
        'the single shared implementation both call, never a second parallel one. No baseline given (first-ever ' +
        'generation of this export): inspects/parses, generates Playwright tests (generate_apex_tests), builds a Flow ' +
        'Map (generate_flow_map), and generates Markdown docs (generate_apex_docs) -- diff and coverage are both ' +
        'explicitly omitted from the report, with a note explaining why, never silently. baselineExportDir given: adds ' +
        'a regression diff (diff_apex_exports) against it; coverage is added ONLY when touchLogPath points at a touch ' +
        'log that ALREADY EXISTS (written by @apx/testkit\'s coverage recorder during a PRIOR run of the GENERATED ' +
        'suite with APX_COVERAGE_LOG set) -- this tool never runs Playwright itself, so a missing/absent touch log ' +
        'produces an explicit note, never an error or a silent omission. The report also includes parser warnings ' +
        'verbatim, unmodeled AI-generated component types, and a liveVerificationRequirements list derived from this ' +
        'same run\'s real diagnostics (not-auto-routable pages, regions with no verified DOM convention, unmodeled ' +
        'component types, parser warnings) -- never a separately-authored checklist. ' +
        'SQLcl validation (`apex validate -input <exportDir>`) is OFF by default; set sqlcl: true (optionally with ' +
        'sqlclExecutablePath) to opt in. If requested but no SQLcl executable can be resolved or invoked, the WHOLE ' +
        'call fails with isError: true -- never a silently skipped step. Same inputs always produce byte-identical ' +
        'report JSON (no timestamps, no unstable ordering).',
      inputSchema: {
        exportDir: z.string().describe('Absolute path to the unzipped APEXlang export root to onboard (contains pages/; application.apx is read when present)'),
        baselineExportDir: z.string().optional().describe('Absolute path to a PRIOR export of the SAME app. Enables the diff section, and (given an existing touchLogPath) the coverage section. Omitted entirely (with a note) when absent.'),
        testsOutDir: z.string().describe('Directory to write generated Playwright .page.ts/.spec.ts files into'),
        docsOutDir: z.string().describe('Directory to write generated Markdown documentation into'),
        touchLogPath: z.string().optional().describe('Absolute path to a touch log written by @apx/testkit\'s coverage recorder during a PRIOR run of the GENERATED suite (APX_COVERAGE_LOG). Only consulted when baselineExportDir is also given. A missing file produces an explicit note, not an error.'),
        sqlcl: z.boolean().optional().describe('Set true to opt in to SQLcl `apex validate -input <exportDir>`. OFF by default -- no SQLcl dependency unless explicitly requested.'),
        sqlclExecutablePath: z.string().optional().describe('Explicit path to the SQLcl executable (implies sqlcl: true even if sqlcl is omitted). When absent and sqlcl is true, PATH is searched.'),
      },
    },
    async ({ exportDir, baselineExportDir, testsOutDir, docsOutDir, touchLogPath, sqlcl, sqlclExecutablePath }) => {
      const problem = checkExportDir(exportDir);
      if (problem) return { content: [{ type: 'text', text: problem }], isError: true };
      if (baselineExportDir) {
        const baselineProblem = checkExportDir(baselineExportDir);
        if (baselineProblem) return { content: [{ type: 'text', text: `Baseline export: ${baselineProblem}` }], isError: true };
      }
      return safeText(async () => {
        const report = await runOnboarding({
          exportDir,
          baselineExportDir,
          testsOutDir,
          docsOutDir,
          touchLogPath,
          sqlcl: sqlcl || sqlclExecutablePath !== undefined ? { executablePath: sqlclExecutablePath } : undefined,
        });
        return JSON.stringify(report, null, 2);
      });
    },
  );

  return server;
}

/** True only when this module is the actual process entry point (`node
 * dist/server.js`/`npx @apx/mcp`) -- false when imported by a test, so
 * `createServer()` can be exercised (e.g. over an in-memory transport)
 * without also opening a real stdio connection that would hang the test
 * runner waiting for a client on stdin. */
function isMainModule(): boolean {
  if (!process.argv[1]) return false;
  return import.meta.url === pathToFileURL(process.argv[1]).href;
}

if (isMainModule()) {
  const server = createServer();
  const transport = new StdioServerTransport();
  await server.connect(transport);
}
